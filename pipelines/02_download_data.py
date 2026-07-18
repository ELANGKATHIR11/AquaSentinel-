import os
import json
import hashlib
import requests
import logging
import time
from tqdm import tqdm
from tenacity import retry, stop_after_attempt, wait_exponential

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# User-Agent header for respect and authentication compatibility
HEADERS = {
    'User-Agent': 'AquaSentinelGisCommandDashboard/1.0 (elang@example.com)'
}

def get_sha256(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=15), reraise=True)
def download_file(url, output_path):
    logging.info(f"Downloading {url} to {output_path}...")
    response = requests.get(url, headers=HEADERS, stream=True, timeout=30)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    block_size = 1024 * 1024 # 1MB chunks
    
    with open(output_path, 'wb') as f, tqdm(
        desc=os.path.basename(output_path),
        total=total_size,
        unit='iB',
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for data in response.iter_content(block_size):
            size = f.write(data)
            bar.update(size)

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=15, max=60), reraise=True)
def run_overpass_query(url, query, output_path):
    urls_to_try = [url]
    fallbacks = ["https://z.overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter"]
    for fb in fallbacks:
        if fb not in urls_to_try:
            urls_to_try.append(fb)
            
    last_err = None
    for target_url in urls_to_try:
        try:
            logging.info(f"Running Overpass query at {target_url} for {output_path}...")
            response = requests.post(target_url, data={'data': query}, headers=HEADERS, timeout=120)
            if response.status_code == 200:
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(response.text)
                return
            else:
                logging.warning(f"Instance {target_url} returned status {response.status_code}")
        except Exception as e:
            logging.warning(f"Error querying {target_url}: {e}")
            last_err = e
            
    if last_err:
        raise last_err
    else:
        raise Exception("All Overpass queries failed without returning 200")

def main():
    sources_path = os.path.join("data", "raw", "sources.json")
    if not os.path.exists(sources_path):
        logging.error("sources.json not found! Run 01_discover_sources.py first.")
        return

    with open(sources_path, "r", encoding="utf-8") as f:
        sources = json.load(f)

    checksums = {}
    checksums_path = os.path.join("data", "raw", "checksums.json")

    for key, src in sources.items():
        if src["type"] in ["zip_shapefile", "zip_dem"]:
            filename = os.path.basename(src["url"])
            dest = os.path.join("data", "raw", filename)
            try:
                if os.path.exists(dest):
                    logging.info(f"File {dest} already exists. Skipping download.")
                else:
                    download_file(src["url"], dest)
                checksums[key] = {
                    "file": filename,
                    "sha256": get_sha256(dest)
                }
            except Exception as e:
                logging.error(f"Failed to download {key}: {e}")
                raise e
                
        elif src["type"] == "overpass_query":
            dest = os.path.join("data", "raw", f"{key}.json")
            try:
                if os.path.exists(dest):
                    logging.info(f"Query result {dest} already exists. Skipping query.")
                else:
                    logging.info("Sleeping for 15 seconds to respect Overpass rate limits...")
                    time.sleep(15)
                    run_overpass_query(src["url"], src["query"], dest)
                checksums[key] = {
                    "file": f"{key}.json",
                    "sha256": get_sha256(dest)
                }
            except Exception as e:
                logging.error(f"Failed to query {key}: {e}")
                raise e

    with open(checksums_path, "w", encoding="utf-8") as f:
        json.dump(checksums, f, indent=2)
    logging.info(f"All downloads complete. Checksums saved to {checksums_path}")

if __name__ == "__main__":
    main()
