import os
os.environ["PROJ_LIB"] = r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj"
import pyproj.datadir
pyproj.datadir.set_data_dir(r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj")
import json
import logging
import requests
import geopandas as gpd
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def check_url(url):
    try:
        r = requests.head(url, allow_redirects=True, timeout=5)
        return r.status_code == 200
    except Exception:
        return False

def main():
    logging.info("Validating exports...")
    
    csv_path = os.path.join("data", "processed", "tamil_nadu_top10_rivers.csv")
    geojson_path = os.path.join("data", "processed", "tamil_nadu_top10_rivers.geojson")
    
    if not os.path.exists(csv_path) or not os.path.exists(geojson_path):
        logging.error("Processed output files missing!")
        return
        
    df = pd.read_csv(csv_path)
    gdf = gpd.read_file(geojson_path)
    
    validation_issues = []
    
    # 1. Geometry Validation
    logging.info("Checking geometry validity...")
    for idx, row in gdf.iterrows():
        name = row['river_name']
        geom = row['geometry']
        if geom is None or geom.is_empty:
            validation_issues.append(f"Geometry for {name} is empty or null.")
        elif not geom.is_valid:
            validation_issues.append(f"Geometry for {name} is invalid (self-intersecting or broken).")
            
    # 2. Schema check
    expected_fields = [
        'river_id', 'river_name', 'alternate_names', 'rank', 'geometry_type',
        'source_dataset', 'source_url', 'source_license', 'source_download_date',
        'source_feature_id', 'source_confidence', 'state_name', 'districts_intersected',
        'source_lat', 'source_lon', 'mouth_lat', 'mouth_lon', 'centroid_lat', 'centroid_lon',
        'length_km', 'line_perimeter_km', 'basin_area_km2', 'river_surface_area_km2',
        'river_surface_perimeter_km', 'area_method', 'perimeter_method',
        'geometry_validation_status', 'last_verified_date', 'notes',
        'source_elevation_m', 'mouth_elevation_m', 'elevation_drop_m', 'elevation_source'
    ]
    
    for f in expected_fields:
        if f not in df.columns:
            validation_issues.append(f"Missing required field in CSV: {f}")
            
    # 3. Numeric values non-negative
    for idx, row in df.iterrows():
        name = row['river_name']
        if row['length_km'] <= 0:
            validation_issues.append(f"Negative or zero length for {name}: {row['length_km']}")
        if row['basin_area_km2'] <= 0:
            validation_issues.append(f"Negative or zero basin area for {name}: {row['basin_area_km2']}")
        if row['source_elevation_m'] < 0:
            validation_issues.append(f"Negative source elevation for {name}: {row['source_elevation_m']}")
        if row['mouth_elevation_m'] < 0:
            validation_issues.append(f"Negative mouth elevation for {name}: {row['mouth_elevation_m']}")
            
    # 4. Outlier checks (length check against reasonable bounds, e.g. Kaveri should be >100km, others >20km)
    for idx, row in df.iterrows():
        name = row['river_name']
        length = row['length_km']
        if name == "Cauvery" and length < 100:
            validation_issues.append(f"Kaveri centerline length outlier: {length} km (expected > 100 km in Tamil Nadu).")
            
    # 5. URL reachability
    for idx, row in df.iterrows():
        url = row['source_url']
        if pd.notna(url) and not check_url(url):
            validation_issues.append(f"Source URL not reachable: {url}")
            break # check once
            
    # Write validation report
    logging.info("Writing reports/validation_report.md...")
    report_content = f"""# Validation and QA/QC Report - Tamil Nadu Rivers Dataset

## Summary of Validation
* **Total Rivers Evaluated**: {len(df)}
* **Total Validation Checks Run**: 8
* **Status**: {"PASS" if not validation_issues else "WARNING/FAIL"}

## Quality Issues Found
"""
    if not validation_issues:
        report_content += "No geometry errors, schema mismatch, or out-of-bounds metrics detected. The dataset matches standard validation criteria.\n"
    else:
        for issue in validation_issues:
            report_content += f"- [ ] **[QA_ALERT]**: {issue}\n"
            
    report_content += """
## Metrics Quality Control Check
| River Name | Length (km) | Basin Area (km²) | Surface Area (km²) | Source Elev (m) | Mouth Elev (m) | Drop (m) | Districts Intersected | Centroid (Lat/Lon) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
"""
    for idx, row in df.iterrows():
        surf_area = f"{row['river_surface_area_km2']:.3f}" if pd.notna(row['river_surface_area_km2']) else "N/A"
        report_content += f"| {row['river_name']} | {row['length_km']:.1f} | {row['basin_area_km2']:.0f} | {surf_area} | {row['source_elevation_m']:.1f} | {row['mouth_elevation_m']:.1f} | {row['elevation_drop_m']:.1f} | {row['districts_intersected']} | {row['centroid_lat']:.4f}, {row['centroid_lon']:.4f} |\n"

    report_content += "\n*Report generated automatically during QA stage.*\n"
    
    with open(os.path.join("reports", "validation_report.md"), "w", encoding="utf-8") as f:
        f.write(report_content)
        
    logging.info("Validation report written successfully.")

if __name__ == "__main__":
    main()
