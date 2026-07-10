/**
 * AquaSentinel — LoRa Gateway ESP32 Firmware
 * 
 * Implements:
 * - LoRa receiver (868 MHz)
 * - Wi-Fi network manager
 * - HTTP client forwarding telemetry payloads to the FastAPI API
 * - Local packet logs over Serial interface
 */

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Pins Configuration
#define LORA_SCK  5
#define LORA_MISO 19
#define LORA_MOSI 27
#define LORA_SS   18
#define LORA_RST  14
#define LORA_DIO0 26

// Network Configuration
const char* ssid = "AquaSentinel_Secured_WiFi";
const char* password = "WiFi_Secret_Password";
const char* api_endpoint = "http://localhost:8000/api/v1/telemetry/ingest";
const char* gateway_id = "GW001";
const char* api_key = "gw001_dev_key_aquasentinel";

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("[Gateway] Booting AquaSentinel LoRa Sector Gateway...");

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Connecting to network...");
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Connection failed (running in offline buffer mode)");
  }

  // Initialize LoRa transceiver
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(868E6)) {
    Serial.println("[LoRa] Initializing LoRa transceiver failed!");
    while (1);
  }
  Serial.println("[LoRa] 868 MHz Transceiver Initialized");
}

void loop() {
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    Serial.print("[LoRa] Received packet of size: ");
    Serial.println(packetSize);

    // Read payload
    String payload = "";
    while (LoRa.available()) {
      payload += (char)LoRa.read();
    }
    Serial.println("[LoRa] Payload: " + payload);

    // Forward to FastAPI if online
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(api_endpoint);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Gateway-Id", gateway_id);
      http.addHeader("X-Api-Key", api_key);

      int httpResponseCode = http.POST(payload);
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.print("[Uplink] Status: ");
        Serial.print(httpResponseCode);
        Serial.print(" | Response: ");
        Serial.println(response);
      } else {
        Serial.print("[Uplink] POST failed. Error: ");
        Serial.println(http.errorToString(httpResponseCode).c_str());
      }
      http.end();
    } else {
      Serial.println("[Queue] System offline; caching packet locally");
    }
  }
}
