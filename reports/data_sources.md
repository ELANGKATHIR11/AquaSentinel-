# Data Sources Report

This report documents the datasets used in building the geospatial dataset for the top 10 major rivers in Tamil Nadu, India.

## Discovered Datasets Table

| Dataset Key | Dataset Name | Publisher | License | Source URL | Intended Use | SHA-256 Checksum |
| --- | --- | --- | --- | --- | --- | --- |
| `hydrorivers_asia` | HydroRIVERS Asia (v1.0) | WWF / HydroSHEDS | Creative Commons Attribution 4.0 International (CC BY 4.0) | [hydrosheds.org/products/hydrorivers](https://www.hydrosheds.org/products/hydrorivers) | Primary river reach network centerlines, flow parameters | `29780b0a75f90024f22e7e2029e5e3045f7325cda0528db65c5cc4c864b98525` |
| `tamil_nadu_boundary` | Tamil Nadu State Boundary | OpenStreetMap Contributors | Open Data Commons Open Database License (ODbL) | [z.overpass-api.de/api/interpreter](https://z.overpass-api.de/api/interpreter) | Base boundary clipping | `d6da4b18a2fdcca421f6d01b16ed1c59ffac919ccd291146c9d85b949ab7451a` |
| `tamil_nadu_districts` | Tamil Nadu Districts Boundary | OpenStreetMap Contributors | Open Data Commons Open Database License (ODbL) | [z.overpass-api.de/api/interpreter](https://z.overpass-api.de/api/interpreter) | Spatial join to identify intersected districts | `12adc573f174ee1a6de442c61ebafd52936d04b19498131732bb85e475d3e3a5` |
| `tamil_nadu_rivers_osm` | Tamil Nadu Rivers (OSM) | OpenStreetMap Contributors | Open Data Commons Open Database License (ODbL) | [z.overpass-api.de/api/interpreter](https://z.overpass-api.de/api/interpreter) | Name reference matching for HydroRIVERS centerlines | `62783909b0497f35a77fc607427c4cb0a87aefebab90e370e5ba97522274529a` |
| `tamil_nadu_river_surfaces_osm` | Tamil Nadu River Surfaces (OSM) | OpenStreetMap Contributors | Open Data Commons Open Database License (ODbL) | [z.overpass-api.de/api/interpreter](https://z.overpass-api.de/api/interpreter) | High-resolution water-surface polygon geometries | `0aa4edc4b4f11427d7ed9859bf6f646a39158abbdb41d43c497191c43514885e` |

## Compliance & Terms of Use
1. **OpenStreetMap ODbL**: Under the ODbL license, derivative products incorporating OpenStreetMap data must also carry the ODbL license.
2. **HydroSHEDS CC-BY 4.0**: The HydroRIVERS dataset is free for scientific, educational, and commercial purposes with proper attribution: "This product incorporates data from the HydroSHEDS database which is © World Wildlife Fund, Inc. (2006-2013) and has been used herein under license."
