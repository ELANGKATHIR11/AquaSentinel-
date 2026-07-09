# AquaSentinel GIS Command Dashboard

AquaSentinel is a real-time geospatial command center designed to monitor water health, telemetry online status, flood risks, and sensor networks across Tamil Nadu, India. The project features an interactive React web dashboard integrated with an automated Python geoprocessing pipeline that extracts, validates, and analyzes the top 10 major rivers in Tamil Nadu.

---

## 🏗️ System Architecture

The project consists of two core components: a web-based **GIS Command Dashboard** for interactive visualization and an automated **Geospatial Processing Pipeline** that ingests and processes source geometries from public repositories.

```mermaid
graph TD
    subgraph Data Sources
        OSM[OpenStreetMap Overpass API] -->|Boundary/River Data| PP[Python Geoprocessing Pipeline]
        Hydro[HydroRIVERS Asia] -->|Centerline Data| PP
    end

    subgraph "Python Pipeline (dgpu-core)"
        PP -->|03_prepare_boundaries.py| Bounds[Tamil Nadu State & District Boundaries]
        PP -->|04_extract_rivers.py| Extract[River Centerlines & Surfaces Extraction]
        PP -->|05_compute_metrics.py| Metrics[Geospatial Metrics Calculator (UTM 44N)]
        PP -->|06_validate_export.py| Validate[QA/QC Validations]
    end

    subgraph Data Exports
        Metrics -->|gpkg / shp / geojson / csv| Proc[data/processed/]
    end

    subgraph GIS Command Dashboard
        Proc -->|tamil_nadu_top10_rivers.geojson| UI[React Leaflet GIS Map]
        Sensor[Sensor Network Telemetry] -->|Zustand State| UI
        UI -->|React / Vite / Tailwind| Dev[Live Web Dashboard]
    end
```

---

## 🚀 Key Features

### 1. Interactive Command Dashboard
* **Dynamic GIS Map**: Built with Leaflet, visualizing sensor nodes with status markers (normal, warning, high-risk, critical, offline).
* **Live Telemetry & Diagnostics**: Real-time graphing of pH, turbidity, temperature, and anomaly indicators using Recharts.
* **ML Inference Preview**: View real-time dGPU accelerated inference of flood and pollution anomaly probabilities directly in the manual entry pane.
* **GPS Integration**: Interactive pan-to-user-location utilizing browser GPS geolocation.

### 2. Geospatial Rivers Pipeline
* **High-Fidelity Extraction**: Combines HydroRIVERS centerline flow networks with OSM name databases to extract clean shapes for Tamil Nadu's 10 major rivers.
* **UTM calculations**: Performs all length, centroid, and area measurements in the local projected coordinate reference system (UTM Zone 44N, **EPSG:32644**).
* **QA/QC Validation**: Runs self-intersection checks, coordinate limit validations, and schema checks, generating a [QA Report](reports/validation_report.md).

---

## 🛠️ Local Development & Running Guide

### 1. Web Dashboard (Vite + React)
Requires Node.js installed on your machine.

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```
Access the application at `http://localhost:3000/`.

### 2. Python Geospatial Pipeline
Requires Python 3.12+ (configured via `dgpu-core` conda environment containing `geopandas`, `shapely`, `pyproj`, `pandas`, `requests`, `tenacity`, and `tqdm`).

To execute the data pipeline from scratch, run the orchestrator script:
```powershell
C:\Users\elang\miniconda3\envs\dgpu-core\python.exe run_pipeline.py
```

---

## 📊 Major Outputs & Reports
* **Geospatial Outputs**: 
  - Centerlines: [tamil_nadu_top10_rivers.gpkg](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.gpkg), [.shp](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.shp), [.geojson](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_rivers.geojson)
  - Surfaces: [tamil_nadu_top10_river_surfaces.gpkg](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_river_surfaces.gpkg), [.shp](file:///f:/aquasentinel-gis-command-dashboard/data/processed/tamil_nadu_top10_river_surfaces.shp)
* **Metadata & QA**:
  - [reports/data_sources.md](file:///f:/aquasentinel-gis-command-dashboard/reports/data_sources.md): Comprehensive listing of licenses, publisher meta, URLs, and checksums.
  - [reports/validation_report.md](file:///f:/aquasentinel-gis-command-dashboard/reports/validation_report.md): Output checks confirming 100% PASS on the target rivers.
  - [reports/river_measurements_methodology.md](file:///f:/aquasentinel-gis-command-dashboard/reports/river_measurements_methodology.md): Technical breakdown of the coordinate system selections and geometries.

---

## ⚠️ Analytical Disclaimer

> [!IMPORTANT]
> **River Surface Area**: Centerline vector layers represent the 1D flow path and have no polygon area (`line_perimeter_km` is equivalent to length). River surface area (`river_surface_area_km2`) and perimeter (`river_surface_perimeter_km`) are calculated only for rivers where physical water-surface polygons are mapped (Cauvery, Palar, Vellar, Amaravati, and South Pennar). For other rivers, these values are set to `null` to comply with spatial source integrity.
