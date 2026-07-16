/**
 * AquaSentinel — Buoy Node ESP32 DevKit V1 Firmware
 * 
 * Implements:
 * - DS18B20 (Water Temperature) on GPIO4
 * - MPU6050 (Tilt Pitch/Roll & Accel) on I2C (SDA=21, SCL=22)
 * - Turbidity (TSW-20M AO) on GPIO34
 * - Rain Sensor (AO) on GPIO35
 * - Ultrasonic Distance (AJ-SR04M TRIG=18, ECHO=19) for Water Level
 * - Analog pH on GPIO32
 * - Analog TDS on GPIO33
 * - Neo-6M GPS on SoftwareSerial / HardwareSerial (RX=16, TX=17)
 * - 2-second acquisition cycle
 * - Moving Average and Median filtering
 * - WiFi Auto-Reconnect & Watchdog
 * - Local circular buffer (1000 samples)
 * - OTA ready and HTTP Server API
 * - MQTT Client abstraction
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <cstring>
#include <algorithm>
#include <esp_task_wdt.h>

// Watchdog timeout in seconds
#define WDT_TIMEOUT 8

// GPIO Pin Mapping
#define PIN_DS18B20      4
#define PIN_SDA          21
#define PIN_SCL          22
#define PIN_TURBIDITY    34
#define PIN_RAIN         35
#define PIN_TRIG         18
#define PIN_ECHO         19
#define PIN_PH           32
#define PIN_TDS          33
#define PIN_GPS_RX       16
#define PIN_GPS_TX       17

// Network configuration parameters
const char* ssid = "AquaSentinel_WiFi";
const char* password = "SecurePassword123";
const char* api_endpoint = "http://192.168.1.100:8000/api/sensor"; // Pi Server address
const char* mqtt_broker = "192.168.1.100";
const int mqtt_port = 1883;

// Calibration Coefficients (y = mx + c style or multiplier)
float cal_temp_slope = 1.0;
float cal_temp_offset = 0.0;
float cal_ph_slope = 1.0;
float cal_ph_offset = 0.0;
float cal_turbidity_factor = 1.0;
float cal_water_level_offset = 0.0;

// Filter configurations
#define FILTER_SIZE 5
float temp_window[FILTER_SIZE];
float ph_window[FILTER_SIZE];
float turbidity_window[FILTER_SIZE];
float wl_window[FILTER_SIZE];
int filter_idx = 0;

// Local buffering (1000 samples structure)
struct TelemetrySample {
    float temp;
    float turbidity;
    float waterLevel;
    float rain;
    float pitch;
    float roll;
    float ax, ay, az;
    float ph;
    float tds;
    float pressure;
    double lat;
    double lon;
    uint32_t timestamp;
};

TelemetrySample buffer[1000];
int buffer_head = 0;
int buffer_tail = 0;
int buffer_count = 0;

// Library instances
OneWire oneWire(PIN_DS18B20);
DallasTemperature tempSensor(&oneWire);
Adafruit_MPU6050 mpu;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2); // Serial2
WebServer server(80);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long last_read_time = 0;
uint32_t sample_counter = 0;

// Filter Functions
void add_to_filter(float val, float window[]) {
    window[filter_idx] = val;
}

float get_median(float window[]) {
    float sorted[FILTER_SIZE];
    memcpy(sorted, window, sizeof(sorted));
    // Sort array
    for (int i = 0; i < FILTER_SIZE - 1; i++) {
        for (int j = i + 1; j < FILTER_SIZE; j++) {
            if (sorted[i] > sorted[j]) {
                float tmp = sorted[i];
                sorted[i] = sorted[j];
                sorted[j] = tmp;
            }
        }
    }
    return sorted[FILTER_SIZE / 2];
}

float get_moving_average(float window[]) {
    float sum = 0;
    for (int i = 0; i < FILTER_SIZE; i++) {
        sum += window[i];
    }
    return sum / FILTER_SIZE;
}

// Push to circular local buffer
void push_to_buffer(TelemetrySample sample) {
    buffer[buffer_head] = sample;
    buffer_head = (buffer_head + 1) % 1000;
    if (buffer_count < 1000) {
        buffer_count++;
    } else {
        // Buffer overflow: move tail forward to discard oldest sample
        buffer_tail = (buffer_tail + 1) % 1000;
    }
}

// Read ultrasonic distance (AJ-SR04M)
float read_ultrasonic_distance() {
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);
    
    long duration = pulseIn(PIN_ECHO, HIGH, 30000); // 30ms timeout
    if (duration == 0) return 0;
    
    // Distance in cm
    float distance = duration * 0.034 / 2.0;
    return distance;
}

// REST Web Server endpoints
void handle_status() {
    JsonDocument doc;
    doc["device_id"] = "ESP32_DevKitV1_01";
    doc["uptime_sec"] = millis() / 1000;
    doc["buffer_usage"] = buffer_count;
    doc["wifi_rssi"] = WiFi.RSSI();
    
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
}

void handle_buffer() {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    
    int temp_tail = buffer_tail;
    for (int i = 0; i < buffer_count; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["temp"] = buffer[temp_tail].temp;
        obj["turbidity"] = buffer[temp_tail].turbidity;
        obj["waterLevel"] = buffer[temp_tail].waterLevel;
        obj["rain"] = buffer[temp_tail].rain;
        obj["ph"] = buffer[temp_tail].ph;
        obj["tds"] = buffer[temp_tail].tds;
        obj["timestamp"] = buffer[temp_tail].timestamp;
        temp_tail = (temp_tail + 1) % 1000;
    }
    
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
}

void handle_calibrate() {
    if (server.hasArg("ph_slope")) cal_ph_slope = server.arg("ph_slope").toFloat();
    if (server.hasArg("ph_offset")) cal_ph_offset = server.arg("ph_offset").toFloat();
    if (server.hasArg("temp_slope")) cal_temp_slope = server.arg("temp_slope").toFloat();
    if (server.hasArg("temp_offset")) cal_temp_offset = server.arg("temp_offset").toFloat();
    if (server.hasArg("turbidity_factor")) cal_turbidity_factor = server.arg("turbidity_factor").toFloat();
    if (server.hasArg("wl_offset")) cal_water_level_offset = server.arg("wl_offset").toFloat();
    
    server.send(200, "text/plain", "Calibration settings updated successfully.");
}

void connect_wifi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.println("Connecting to WiFi...");
    WiFi.begin(ssid, password);
}

void setup() {
    Serial.begin(115200);
    
    // Watchdog configuration
    esp_task_wdt_init(WDT_TIMEOUT, true);
    esp_task_wdt_add(NULL);
    
    // I/O pins configuration
    pinMode(PIN_TRIG, OUTPUT);
    pinMode(PIN_ECHO, INPUT);
    pinMode(PIN_TURBIDITY, INPUT);
    pinMode(PIN_RAIN, INPUT);
    pinMode(PIN_PH, INPUT);
    pinMode(PIN_TDS, INPUT);
    
    // Init sensors
    Wire.begin(PIN_SDA, PIN_SCL);
    tempSensor.begin();
    
    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip");
    }
    
    gpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    
    // WiFi configuration
    WiFi.mode(WIFI_AP_STA);
    connect_wifi();
    
    // OTA configuration
    ArduinoOTA.setHostname("aquasentinel-buoy");
    ArduinoOTA.begin();
    
    // Server endpoints
    server.on("/status", handle_status);
    server.on("/buffer", handle_buffer);
    server.on("/calibrate", HTTP_POST, handle_calibrate);
    server.begin();
    
    // MQTT configuration
    mqttClient.setServer(mqtt_broker, mqtt_port);
    
    Serial.println("ESP32 Buoy Ready.");
}

void loop() {
    // Feed the watchdog
    esp_task_wdt_reset();
    
    // Maintain OTA & Server
    ArduinoOTA.handle();
    server.handleClient();
    
    // Auto WiFi Reconnect check
    if (WiFi.status() != WL_CONNECTED && millis() % 10000 < 100) {
        connect_wifi();
    }
    
    // Process incoming GPS stream
    while (gpsSerial.available() > 0) {
        gps.encode(gpsSerial.read());
    }
    
    // Acquisition cycle (every 2 seconds)
    if (millis() - last_read_time >= 2000) {
        last_read_time = millis();
        
        // Temperature reading
        tempSensor.requestTemperatures();
        float raw_temp = tempSensor.getTempCByIndex(0);
        if (raw_temp == DEVICE_DISCONNECTED_C) raw_temp = 25.0; // fallback
        float cal_temp = (raw_temp * cal_temp_slope) + cal_temp_offset;
        
        // pH reading (0-14 calibrated from raw analog)
        float raw_ph_voltage = analogRead(PIN_PH) * (3.3 / 4095.0);
        float raw_ph = 7.0 + ((2.5 - raw_ph_voltage) * 3.5);
        float cal_ph = (raw_ph * cal_ph_slope) + cal_ph_offset;
        if (cal_ph < 0.0) cal_ph = 0.0;
        if (cal_ph > 14.0) cal_ph = 14.0;
        
        // Turbidity reading (approx NTU)
        float raw_turb_voltage = analogRead(PIN_TURBIDITY) * (3.3 / 4095.0);
        float cal_turbidity = max(0.0f, (3000.0f - (raw_turb_voltage * 1000.0f)) * cal_turbidity_factor);
        
        // Water Level reading (AJ-SR04M)
        float raw_wl = read_ultrasonic_distance();
        float cal_wl = max(0.0f, raw_wl + cal_water_level_offset);
        
        // Rain reading (0-100% scale)
        float rain_analog = analogRead(PIN_RAIN);
        float rain_pct = (1.0f - (rain_analog / 4095.0f)) * 100.0f;
        
        // TDS reading
        float tds_voltage = analogRead(PIN_TDS) * (3.3 / 4095.0);
        float cal_tds = tds_voltage * 500.0; // basic conversion coefficient
        
        // Accel / Gyro reading
        sensors_event_t a, g, temp_mpu;
        mpu.getEvent(&a, &g, &temp_mpu);
        
        // Simple Pitch & Roll estimation
        float pitch = atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 180.0 / M_PI;
        float roll = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / M_PI;
        
        // Filter calculations
        add_to_filter(cal_temp, temp_window);
        add_to_filter(cal_ph, ph_window);
        add_to_filter(cal_turbidity, turbidity_window);
        add_to_filter(cal_wl, wl_window);
        filter_idx = (filter_idx + 1) % FILTER_SIZE;
        
        float filtered_temp = get_moving_average(temp_window);
        float filtered_ph = get_median(ph_window);
        float filtered_turbidity = get_moving_average(turbidity_window);
        float filtered_wl = get_median(wl_window);
        
        // GPS Data
        double lat = gps.location.isValid() ? gps.location.lat() : 13.0827; // Default Chennai coordinates
        double lon = gps.location.isValid() ? gps.location.lng() : 80.2707;
        
        // Build Telemetry Sample
        TelemetrySample sample;
        sample.temp = filtered_temp;
        sample.turbidity = filtered_turbidity;
        sample.waterLevel = filtered_wl;
        sample.rain = rain_pct;
        sample.pitch = pitch;
        sample.roll = roll;
        sample.ax = a.acceleration.x;
        sample.ay = a.acceleration.y;
        sample.az = a.acceleration.z;
        sample.ph = filtered_ph;
        sample.tds = cal_tds;
        sample.pressure = 1013.25; // standard pressure placeholder if sensor absent
        sample.lat = lat;
        sample.lon = lon;
        sample.timestamp = sample_counter++;
        
        // Push telemetry sample to circular buffer
        push_to_buffer(sample);
        
        // Send to REST API or queue locally
        if (WiFi.status() == WL_CONNECTED) {
            HTTPClient http;
            http.begin(api_endpoint);
            http.addHeader("Content-Type", "application/json");
            
            JsonDocument doc;
            doc["temp"] = sample.temp;
            doc["turbidity"] = sample.turbidity;
            doc["waterLevel"] = sample.waterLevel;
            doc["rain"] = sample.rain;
            doc["pitch"] = sample.pitch;
            doc["roll"] = sample.roll;
            doc["ax"] = sample.ax;
            doc["ay"] = sample.ay;
            doc["az"] = sample.az;
            doc["ph"] = sample.ph;
            doc["tds"] = sample.tds;
            doc["pressure"] = sample.pressure;
            doc["lat"] = sample.lat;
            doc["lon"] = sample.lon;
            doc["device_id"] = "ESP32_DevKitV1_01";
            
            String reqBody;
            serializeJson(doc, reqBody);
            
            int httpCode = http.POST(reqBody);
            if (httpCode > 0) {
                Serial.printf("[HTTP] POST Response Code: %d\n", httpCode);
                // Clean buffer elements if request succeeded
                buffer_count = 0;
                buffer_tail = buffer_head;
            } else {
                Serial.printf("[HTTP] POST failed: %s\n", HTTPClient::errorToString(httpCode).c_str());
            }
            http.end();
        }
        
        // MQTT Abstraction Publish
        if (mqttClient.connected()) {
            JsonDocument mqttDoc;
            mqttDoc["temp"] = sample.temp;
            mqttDoc["ph"] = sample.ph;
            mqttDoc["turbidity"] = sample.turbidity;
            mqttDoc["waterLevel"] = sample.waterLevel;
            String payload;
            serializeJson(mqttDoc, payload);
            mqttClient.publish("aquasentinel/telemetry", payload.c_str());
        }
    }
}
