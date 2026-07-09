# River Measurements and GIS Processing Methodology

This report details the technical decisions, projection standards, spatial reference transformations, and measurement methodologies implemented in the Tamil Nadu major rivers pipeline.

## 1. Spatial Reference System & Projections
- **Source Coordinates**: All raw geospatial boundaries and river reaches are downloaded in geographic coordinate systems using **EPSG:4326** (WGS 84).
- **Measurement Coordinates**: To calculate projected lengths, perimeters, and polygon areas accurately without the distortions inherent in geographic degree coordinates, all vector layers are transformed to **EPSG:32644 (UTM Zone 44N)**. This coordinate system covers the vast majority of Tamil Nadu and minimizes local length and area distortions.
- **Output Coordinates**: Web-ready exports (GeoJSON) are reprojected back to **EPSG:4326** for compatibility with standard mapping frameworks (Leaflet, Mapbox, etc.), while local GIS assets (GeoPackage, ESRI Shapefile) are saved with spatial indexes.

## 2. Clipped Extents and Boundaries
- The state boundary of Tamil Nadu was retrieved from OpenStreetMap using the Overpass API (`admin_level="4"` relation).
- To preserve cross-state river continuity (such as the Kaveri River flowing from Karnataka, and Palar flowing from Karnataka/Andhra Pradesh), the Tamil Nadu boundary was projected to UTM 44N and buffered by **10 kilometers (10,000 meters)**.
- HydroRIVERS and OSM river reaches were clipped to this 10 km buffered boundary.

## 3. Joining HydroRIVERS and OSM Centerlines
- Since the global **HydroRIVERS** reaches have accurate streamflow and upland catchment attributes but lack name attributes, we performed a spatial buffer join:
  - Named OSM river lines (`waterway="river"`) were filtered for target names (Kaveri, Palar, etc.) including local spellings (such as `Thamirabharani` and `Amaravathi`).
  - These lines were projected and buffered by **250 meters** in UTM 44N.
  - HydroRIVERS centerline segments intersecting these buffers were assigned the respective canonical river name.
  - Reaches associated with each river were dissolved into a single dissolved LineString/MultiLineString feature per river.

## 4. River-Surface Area Calculations
- **River Centerline Length (`length_km`)**: Geodesic/projected length of the dissolved centerline in UTM 44N.
- **Line Perimeter (`line_perimeter_km`)**: Line geometries have no polygon area; therefore, `line_perimeter_km` is identical to `length_km`.
- **Basin Area (`basin_area_km2`)**: Retrieved from official published hydrological records for consistency (e.g., Kaveri basin of ~81,155 km²).
- **River Surface Area (`river_surface_area_km2`)**: Calculated solely from OSM `waterway=riverbank` and `natural=water` + `water=river` polygons where high-resolution surface geometries are available (Cauvery, Palar, Vellar, Amaravati, South Pennar). For other rivers with no mapped polygon data, these are set to `null` (N/A) to comply with data integrity rules, rather than applying arbitrary buffers.
