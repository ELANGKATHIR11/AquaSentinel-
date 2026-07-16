import os
import sys
import subprocess
import logging

# Set PROJ_LIB environment variable for pyproj
os.environ["PROJ_LIB"] = r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj"

# Ensure log directory exists
os.makedirs("logs", exist_ok=True)

# Configure logging to both console and logs/pipeline.log
logger = logging.getLogger()
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

# File Handler
file_handler = logging.FileHandler(os.path.join("logs", "pipeline.log"), mode='w', encoding='utf-8')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Console Handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# Use current python executable to run scripts
PYTHON_EXE = sys.executable

def run_script(script_name):
    logging.info(f"==================================================")
    logging.info(f"Running script: {script_name}...")
    logging.info(f"==================================================")
    
    script_path = os.path.join(os.path.dirname(__file__), script_name)
    result = subprocess.run([PYTHON_EXE, script_path], capture_output=True, text=True, encoding='utf-8')
    
    # Write outputs to log file
    if result.stdout:
        logging.info("STDOUT:")
        logging.info(result.stdout)
    if result.stderr:
        logging.warning("STDERR:")
        logging.warning(result.stderr)
        
    if result.returncode != 0:
        logging.error(f"Script {script_name} failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    else:
        logging.info(f"Script {script_name} completed successfully.")

def main():
    logging.info("Starting Tamil Nadu Rivers Geospatial Pipeline...")
    
    run_script("01_discover_sources.py")
    run_script("02_download_data.py")
    run_script("03_prepare_boundaries.py")
    run_script("04_extract_rivers.py")
    run_script("05_compute_metrics.py")
    run_script("06_validate_export.py")
    
    logging.info("Pipeline completed successfully! Check reports/ and logs/ for details.")

if __name__ == "__main__":
    main()
