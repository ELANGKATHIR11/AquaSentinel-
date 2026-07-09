# Tamil Nadu Top 10 Major Rivers Geospatial Pipeline

This project builds a verified, production-ready geospatial dataset for the top 10 major rivers in Tamil Nadu, India. The pipeline discovers, downloads, processes, validates, and exports river centerlines and water surfaces into multiple GIS-friendly formats.

## Folder Structure

- `data/raw/`: Downloaded datasets (OSM JSONs, HydroRIVERS zip, checksums).
- `data/interim/`: Clipped boundaries, merged geometries, and raw centerline layers.
- `data/processed/`: Final clean exports (Shapefile, GeoPackage, GeoJSON, CSV).
- `reports/`: Data quality, source metadata, and methodology reports.
- `logs/`: Orchestration log files.

## Reproducibility & Local Execution (Windows Native)

To run the pipeline locally, use the pre-configured Miniconda environment `dgpu-core` which contains all the required GIS dependencies (geopandas, pyproj, shapely, pandas, requests, tenacity, tqdm).

Run the central orchestrator from the workspace root:

```powershell
C:\Users\elang\miniconda3\envs\dgpu-core\python.exe run_pipeline.py
```

This single command will sequentially run:
1. `01_discover_sources.py`: Discovers URLs, queries, and license metadata.
2. `02_download_data.py`: Downloads HydroRIVERS and queries Overpass API mirrors with rate-limiting respect.
3. `03_prepare_boundaries.py`: Builds the Tamil Nadu state boundary and 10 km buffer.
4. `04_extract_rivers.py`: Extracts centerlines and aligns them with named reaches.
5. `05_compute_metrics.py`: Computes length, area, centroid, and district joins in EPSG:32644 (UTM 44N).
6. `06_validate_export.py`: Validates outputs and outputs the QA/QC report.

## Major Deliverables

- **Centerline Reaches**:
  - [GeoPackage Feature Class](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.gpkg)
  - [ESRI Shapefile](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.shp)
  - [GeoJSON](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.geojson)
  - [CSV Attribute Table](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.csv)
- **Water Surface Polygons** (where available):
  - [GeoPackage Feature Class](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_river_surfaces.gpkg)
  - [ESRI Shapefile](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_river_surfaces.shp)
- **Validation Report**:
  - [reports/validation_report.md](file:///f:/aquasentinel-gis-command-dashboard/reports/validation_report.md)

## Analytical Disclaimer

> [!IMPORTANT]
> **River Area and Perimeter**: Line/centerline geometries represent the path/flow of a river and have no area. River surface area (`river_surface_area_km2`) and perimeter (`river_surface_perimeter_km`) calculations are only derived from actual polygon surface geometries (such as `waterway=riverbank` or `natural=water`), available for the Cauvery, Palar, Vellar, Amaravati, and South Pennar. For other rivers, these attributes are set to `null` to preserve source integrity. Centerline length is also provided as `line_perimeter_km` for centerline vector layers.
