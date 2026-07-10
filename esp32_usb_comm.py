"""
ESP32 USB Serial Communication
Connects to ESP32 over USB (COM5) and reads live sensor data.
"""

import serial
import serial.tools.list_ports
import logging
import time
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ── Configuration ────────────────────────────────────────────────────────────
DEFAULT_PORT     = "COM5"
DEFAULT_BAUDRATE = 115200
TIMEOUT          = 2          # seconds
READ_DURATION    = 30         # seconds to listen for data
# ─────────────────────────────────────────────────────────────────────────────


def list_serial_ports():
    """List all available serial ports on the system."""
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        logging.warning("No serial ports detected.")
        return []
    for p in ports:
        logging.info(f"  {p.device} | {p.description} | {p.hwid}")
    return [p.device for p in ports]


def connect(port: str = DEFAULT_PORT, baudrate: int = DEFAULT_BAUDRATE) -> serial.Serial:
    """Open a serial connection to the ESP32."""
    logging.info(f"Connecting to ESP32 on {port} at {baudrate} baud ...")
    try:
        ser = serial.Serial(port, baudrate=baudrate, timeout=TIMEOUT)
        time.sleep(2)                   # Let device reset after port opens
        ser.reset_input_buffer()        # Discard startup noise
        logging.info("✅ Connected successfully.")
        return ser
    except serial.SerialException as e:
        logging.error(f"❌ Could not open {port}: {e}")
        sys.exit(1)


def send_command(ser: serial.Serial, command: str) -> str:
    """Send a newline-terminated command and return the response."""
    cmd = command.strip() + "\n"
    ser.write(cmd.encode("utf-8"))
    logging.info(f"→ Sent: {command.strip()}")
    response = ser.read_until(b"\n").decode("utf-8", errors="ignore").strip()
    logging.info(f"← Recv: {response}")
    return response


def read_stream(ser: serial.Serial, duration: int = READ_DURATION):
    """Continuously read and print lines from the ESP32 for `duration` seconds."""
    logging.info(f"📡 Streaming data from ESP32 for {duration}s (Ctrl+C to stop) ...")
    deadline = time.time() + duration
    try:
        while time.time() < deadline:
            if ser.in_waiting:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if line:
                    print(f"[ESP32] {line}")
            else:
                time.sleep(0.05)
    except KeyboardInterrupt:
        logging.info("Stream interrupted by user.")


def main():
    # 1. Discover ports
    logging.info("=== Available Serial Ports ===")
    available = list_serial_ports()

    # 2. Pick the port (auto-select COM5 or first available)
    port = DEFAULT_PORT
    if port not in available:
        if available:
            port = available[0]
            logging.warning(f"COM5 not found, using {port} instead.")
        else:
            logging.error("No serial ports available. Check USB connection.")
            sys.exit(1)

    # 3. Connect
    ser = connect(port)

    try:
        # 4. Optional: send a hello / status command to the ESP32
        #    Change this to match whatever command your firmware expects.
        send_command(ser, "STATUS")

        # 5. Read streaming data (sensor readings, logs, etc.)
        read_stream(ser, duration=READ_DURATION)

    finally:
        ser.close()
        logging.info("🔌 Connection closed.")


if __name__ == "__main__":
    main()
