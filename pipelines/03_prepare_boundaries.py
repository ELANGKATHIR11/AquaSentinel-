import os
os.environ["PROJ_LIB"] = r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj"
import pyproj.datadir
pyproj.datadir.set_data_dir(r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj")
import json
import logging
import geopandas as gpd
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import linemerge, polygonize

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def parse_overpass_to_gdf(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    elements = data.get('elements', [])
    features = []
    
    for element in elements:
        name = element.get('tags', {}).get('name:en') or element.get('tags', {}).get('name', 'Unknown')
        el_type = element.get('type')
        
        if el_type == 'relation':
            lines = []
            for member in element.get('members', []):
                geom = member.get('geometry', [])
                if geom and len(geom) >= 2:
                    coords = [(pt['lon'], pt['lat']) for pt in geom]
                    lines.append(LineString(coords))
            if lines:
                try:
                    merged = linemerge(lines)
                    polygons = list(polygonize(merged))
                    if polygons:
                        poly_geom = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)
                        features.append({
                            'geometry': poly_geom,
                            'name': name,
                            'type': 'relation'
                        })
                except Exception as e:
                    logging.warning(f"Error polygonizing relation {name}: {e}")
        elif el_type == 'way':
            geom = element.get('geometry', [])
            if geom and len(geom) >= 2:
                coords = [(pt['lon'], pt['lat']) for pt in geom]
                try:
                    poly_geom = Polygon(coords)
                    features.append({
                        'geometry': poly_geom,
                        'name': name,
                        'type': 'way'
                    })
                except Exception as e:
                    logging.warning(f"Error creating Polygon from way {name}: {e}")
                    
    if not features:
        # Fallback if no polygons created, just load geometries as LineStrings
        for element in elements:
            name = element.get('tags', {}).get('name', 'Unknown')
            for member in element.get('members', []):
                geom = member.get('geometry', [])
                if geom and len(geom) >= 2:
                    coords = [(pt['lon'], pt['lat']) for pt in geom]
                    features.append({
                        'geometry': LineString(coords),
                        'name': name,
                        'type': 'line'
                    })
                    
    gdf = gpd.GeoDataFrame(features, crs="EPSG:4326")
    return gdf

def main():
    logging.info("Preparing boundary layers...")
    
    boundary_raw_path = os.path.join("data", "raw", "tamil_nadu_boundary.json")
    districts_raw_path = os.path.join("data", "raw", "tamil_nadu_districts.json")
    
    if not os.path.exists(boundary_raw_path) or not os.path.exists(districts_raw_path):
        logging.error("Raw boundary files missing! Run 02_download_data.py first.")
        return

    # Parse boundaries
    logging.info("Parsing state boundary...")
    state_gdf = parse_overpass_to_gdf(boundary_raw_path)
    if state_gdf.empty:
        logging.error("Failed to parse state boundary!")
        return
        
    logging.info("Parsing districts boundary...")
    districts_gdf = parse_overpass_to_gdf(districts_raw_path)
    
    # Save unbuffered state boundary
    state_gdf.to_file(os.path.join("data", "interim", "tamil_nadu_boundary.geojson"), driver="GeoJSON")
    
    # Save districts
    if not districts_gdf.empty:
        districts_gdf.to_file(os.path.join("data", "interim", "tamil_nadu_districts.geojson"), driver="GeoJSON")
        logging.info(f"Districts saved: {len(districts_gdf)} features.")
        
    # Project, buffer by 10km, and reproject back to 4326
    logging.info("Projecting state boundary to UTM Zone 44N and buffering by 10km...")
    state_projected = state_gdf.to_crs("EPSG:32644")
    state_projected['geometry'] = state_projected.geometry.buffer(10000) # 10 km
    
    state_buffered = state_projected.to_crs("EPSG:4326")
    buffered_output = os.path.join("data", "interim", "tamil_nadu_boundary_buffered.geojson")
    state_buffered.to_file(buffered_output, driver="GeoJSON")
    
    logging.info(f"Buffered boundary saved to {buffered_output}")

if __name__ == "__main__":
    main()
