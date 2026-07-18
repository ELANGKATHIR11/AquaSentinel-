import os
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def main():
    logging.info("Starting source discovery...")
    
    # Create the raw directory if it doesn't exist
    os.makedirs(os.path.join("data", "raw"), exist_ok=True)
    os.makedirs(os.path.join("data", "interim"), exist_ok=True)
    os.makedirs(os.path.join("data", "processed"), exist_ok=True)
    os.makedirs("reports", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    
    sources = {
        "hydrorivers_asia": {
            "name": "HydroRIVERS Asia",
            "url": "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip",
            "license": "Creative Commons Attribution 4.0 International (CC BY 4.0) via HydroSHEDS License",
            "publisher": "WWF / HydroSHEDS",
            "description": "Global vectorized line network representing river reaches for Asia.",
            "type": "zip_shapefile"
        },
        "dem_c43": {
            "name": "Viewfinder Panoramas DEM C43",
            "url": "https://viewfinderpanoramas.org/dem3/C43.zip",
            "license": "Public Domain (Jonathan de Ferranti)",
            "publisher": "Viewfinder Panoramas",
            "description": "3 arc-second DEM for grid C43 (covers southwest Tamil Nadu).",
            "type": "zip_dem"
        },
        "dem_c44": {
            "name": "Viewfinder Panoramas DEM C44",
            "url": "https://viewfinderpanoramas.org/dem3/C44.zip",
            "license": "Public Domain (Jonathan de Ferranti)",
            "publisher": "Viewfinder Panoramas",
            "description": "3 arc-second DEM for grid C44 (covers southeast Tamil Nadu).",
            "type": "zip_dem"
        },
        "dem_d43": {
            "name": "Viewfinder Panoramas DEM D43",
            "url": "https://viewfinderpanoramas.org/dem3/D43.zip",
            "license": "Public Domain (Jonathan de Ferranti)",
            "publisher": "Viewfinder Panoramas",
            "description": "3 arc-second DEM for grid D43 (covers northwest Tamil Nadu).",
            "type": "zip_dem"
        },
        "dem_d44": {
            "name": "Viewfinder Panoramas DEM D44",
            "url": "https://viewfinderpanoramas.org/dem3/D44.zip",
            "license": "Public Domain (Jonathan de Ferranti)",
            "publisher": "Viewfinder Panoramas",
            "description": "3 arc-second DEM for grid D44 (covers northeast Tamil Nadu).",
            "type": "zip_dem"
        },
        "tamil_nadu_boundary": {
            "name": "Tamil Nadu State Boundary (OSM)",
            "url": "https://z.overpass-api.de/api/interpreter",
            "query": '[out:json];relation["admin_level"="4"]["name"="Tamil Nadu"];out geom;',
            "license": "Open Data Commons Open Database License (ODbL)",
            "publisher": "OpenStreetMap Contributors",
            "description": "State boundary polygon of Tamil Nadu.",
            "type": "overpass_query"
        },
        "tamil_nadu_districts": {
            "name": "Tamil Nadu Districts Boundary (OSM)",
            "url": "https://z.overpass-api.de/api/interpreter",
            "query": '[out:json];area["admin_level"="4"]["name"="Tamil Nadu"]->.a;relation(area.a)["admin_level"="6"];out geom;',
            "license": "Open Data Commons Open Database License (ODbL)",
            "publisher": "OpenStreetMap Contributors",
            "description": "District boundaries of Tamil Nadu.",
            "type": "overpass_query"
        },
        "tamil_nadu_rivers_osm": {
            "name": "Tamil Nadu Target Rivers Centerlines (OSM)",
            "url": "https://z.overpass-api.de/api/interpreter",
            "query": """[out:json][timeout:90];
area["admin_level"="4"]["name"="Tamil Nadu"]->.a;
(
  way(area.a)["waterway"="river"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
  relation(area.a)["waterway"="river"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
);
out geom;""",
            "license": "Open Data Commons Open Database License (ODbL)",
            "publisher": "OpenStreetMap Contributors",
            "description": "River centerlines from OSM for target river names.",
            "type": "overpass_query"
        },
        "tamil_nadu_river_surfaces_osm": {
            "name": "Tamil Nadu Target River Surfaces (OSM)",
            "url": "https://z.overpass-api.de/api/interpreter",
            "query": """[out:json][timeout:90];
area["admin_level"="4"]["name"="Tamil Nadu"]->.a;
(
  way(area.a)["waterway"="riverbank"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
  relation(area.a)["waterway"="riverbank"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
  way(area.a)["natural"="water"]["water"="river"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
  relation(area.a)["natural"="water"]["water"="river"]["name"~"Kaveri|Cauvery|Palar|Pennar|Ponnaiyar|Thenpennai|Vaigai|Tamiraparani|Thamirabarani|Thamirabharani|Bhavani|Amaravati|Amaravathi|Noyyal|Vellar|Gundar",i];
);
out geom;""",
            "license": "Open Data Commons Open Database License (ODbL)",
            "publisher": "OpenStreetMap Contributors",
            "description": "River water surface area polygons from OSM.",
            "type": "overpass_query"
        }
    }
    
    output_path = os.path.join("data", "raw", "sources.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sources, f, indent=2)
        
    logging.info(f"Sources successfully discovered and written to {output_path}")

if __name__ == "__main__":
    main()
