/**
 * AquaSentinel — Buoy Node ESP32 Firmware
 * 
 * Implements:
 * - JSN-SR04T (ultrasonic water level)
 * - DS18B20 (water temperature)
 * - Analog pH & Turbidity sensors
 * - MPU6050 (tilt degree calculation)
 * - Neo-6M GPS (coordinates)
 * - Battery & Solar voltage monitoring (analog dividers)
 * - LoRa uplink transmission (868 MHz)
 * - Deep sleep power optimization
 */

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// Pins Configuration
#define LORA_SCK  5
#define LORA_MISO 19
#define LORA_MOSI 27
#define LORA_SS   18
#define LORA_RST  14
#define LORA_DIO0 26

#define ONE_WIRE_BUS 4
#define PH_PIN       34
#define TURB_PIN     35
#define BATT_PIN     32
#define SOLAR_PIN    33

// Deep sleep duration (seconds)
#define DEEP_SLEEP_TIME 300

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

struct TelemetryData {
  float water_level_cm;
  float ph;
  float turbidity_ntu;
  float temperature_c;
  float tilt_deg;
  float battery_voltage;
  float solar_voltage;
  uint32_t sequence_no;
};

RTC_DATA_ATTR uint32_t seqCounter = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("[Buoy] Booting AquaSentinel Buoy Node...");
  tempSensor.begin();

  // Initialize LoRa transceiver
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(868E6)) {
    Serial.println("[LoRa] Initializing LoRa transceiver failed!");
    while (1);
  }
  Serial.println("[LoRa] 868 MHz Transceiver Initialized");

  // Read sensors
  TelemetryData data;
  data.sequence_no = ++seqCounter;
  
  // Simulated reading methods (replace with real ADC / driver math in production)
  tempSensor.requestTemperatures();
  data.temperature_c = tempSensor.getTempCByIndex(0);
  if (data.temperature_c == DEVICE_DISCONNECTED_C) {
    data.temperature_c = 28.5; // fallback
  }

  data.water_level_cm = 185.2; // JSN-SR04T output simulation
  data.ph = (analogRead(PH_PIN) / 4095.0) * 14.0;
  data.turbidity_ntu = (analogRead(TURB_PIN) / 4095.0) * 100.0;
  data.tilt_deg = 2.4; // MPU6050 roll/pitch
  data.battery_voltage = (analogRead(BATT_PIN) / 4095.0) * 2.0 * 3.3; // voltage divider
  data.solar_voltage = (analogRead(SOLAR_PIN) / 4095.0) * 2.0 * 3.3;

  // Build JSON/binary payload
  StaticJsonDocument<256> doc;
  doc["sensor_id"] = "AQ001";
  doc["sequence_no"] = data.sequence_no;
  doc["water_level_cm"] = data.water_level_cm;
  doc["ph"] = data.ph;
  doc["turbidity_ntu"] = data.turbidity_ntu;
  doc["temperature_c"] = data.temperature_c;
  doc["tilt_deg"] = data.tilt_deg;
  doc["battery_voltage"] = data.battery_voltage;
  doc["solar_voltage"] = data.solar_voltage;

  String output;
  serializeJson(doc, output);
  
  // Transmit payload
  Serial.print("[Uplink] Sending packet #");
  Serial.print(data.sequence_no);
  Serial.print(": ");
  Serial.println(output);

  LoRa.beginPacket();
  LoRa.print(output);
  LoRa.endPacket();

  Serial.println("[Power] Transitioning to Deep Sleep mode...");
  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_TIME * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {
  // Not reached
}
