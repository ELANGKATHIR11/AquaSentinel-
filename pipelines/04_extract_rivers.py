import os
os.environ["PROJ_LIB"] = r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj"
import pyproj.datadir
pyproj.datadir.set_data_dir(r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj")
import json
import zipfile
import logging
import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import linemerge, polygonize

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

RIVER_NAME_MAP = {
    "Cauvery": "Kaveri|Cauvery",
    "Palar": "Palar",
    "South Pennar": "South Pennar|Ponnaiyar|Thenpennai|Pennar",
    "Vaigai": "Vaigai",
    "Tamiraparani": "Tamiraparani|Thamirabarani|Thamirabharani",
    "Bhavani": "Bhavani",
    "Amaravati": "Amaravati|Amaravathi",
    "Noyyal": "Noyyal",
    "Vellar": "Vellar",
    "Gundar": "Gundar"
}

def extract_zip(zip_path, extract_to):
    logging.info(f"Extracting {zip_path} to {extract_to}...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)

def parse_osm_lines(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    features = []
    for el in data.get('elements', []):
        tags = el.get('tags', {})
        name = tags.get('name:en') or tags.get('name') or 'Unknown'
        el_type = el.get('type')
        
        if el_type == 'way':
            geom = el.get('geometry', [])
            if geom and len(geom) >= 2:
                coords = [(pt['lon'], pt['lat']) for pt in geom]
                features.append({
                    'geometry': LineString(coords),
                    'osm_name': name,
                    'osm_id': el.get('id')
                })
        elif el_type == 'relation':
            for member in el.get('members', []):
                geom = member.get('geometry', [])
                if geom and len(geom) >= 2:
                    coords = [(pt['lon'], pt['lat']) for pt in geom]
                    features.append({
                        'geometry': LineString(coords),
                        'osm_name': name,
                        'osm_id': el.get('id')
                    })
    return gpd.GeoDataFrame(features, crs="EPSG:4326")

def parse_osm_polygons(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    features = []
    for el in data.get('elements', []):
        tags = el.get('tags', {})
        name = tags.get('name:en') or tags.get('name') or 'Unknown'
        el_type = el.get('type')
        
        if el_type == 'way':
            geom = el.get('geometry', [])
            if geom and len(geom) >= 3:
                coords = [(pt['lon'], pt['lat']) for pt in geom]
                try:
                    features.append({
                        'geometry': Polygon(coords),
                        'osm_name': name,
                        'osm_id': el.get('id')
                    })
                except Exception:
                    pass
        elif el_type == 'relation':
            lines = []
            for member in el.get('members', []):
                geom = member.get('geometry', [])
                if geom and len(geom) >= 2:
                    coords = [(pt['lon'], pt['lat']) for pt in geom]
                    lines.append(LineString(coords))
            if lines:
                try:
                    merged = linemerge(lines)
                    polygons = list(polygonize(merged))
                    for poly in polygons:
                        features.append({
                            'geometry': poly,
                            'osm_name': name,
                            'osm_id': el.get('id')
                        })
                except Exception:
                    pass
    return gpd.GeoDataFrame(features, crs="EPSG:4326")

def match_canonical_name(name):
    if not name or pd.isna(name):
        return None
    for canonical, pattern in RIVER_NAME_MAP.items():
        if pd.Series(name).str.contains(pattern, case=False, regex=True).any():
            return canonical
    return None

def main():
    zip_path = os.path.join("data", "raw", "HydroRIVERS_v10_as_shp.zip")
    extract_to = os.path.join("data", "raw", "HydroRIVERS_v10_as_shp")
    
    if not os.path.exists(extract_to) and os.path.exists(zip_path):
        extract_zip(zip_path, extract_to)
        
    buffered_boundary_path = os.path.join("data", "interim", "tamil_nadu_boundary_buffered.geojson")
    if not os.path.exists(buffered_boundary_path):
        logging.error("Buffered boundary missing! Run 03_prepare_boundaries.py first.")
        return
        
    logging.info("Loading buffered Tamil Nadu boundary...")
    tn_buffer_gdf = gpd.read_file(buffered_boundary_path)
    
    # Find shapefile inside extracted directory
    shp_file = None
    for root, dirs, files in os.walk(extract_to):
        for file in files:
            if file.endswith(".shp"):
                shp_file = os.path.join(root, file)
                break
                
    if not shp_file:
        logging.error("HydroRIVERS shapefile not found in extracted zip!")
        return
        
    logging.info(f"Loading HydroRIVERS shapefile: {shp_file}...")
    # Load and clip to buffered state boundary
    logging.info("Clipping HydroRIVERS to buffered Tamil Nadu boundary...")
    rivers_gdf = gpd.read_file(shp_file, bbox=tuple(tn_buffer_gdf.total_bounds))
    rivers_clipped = gpd.clip(rivers_gdf, tn_buffer_gdf)
    
    # Parse OSM named river centerlines
    osm_rivers_path = os.path.join("data", "raw", "tamil_nadu_rivers_osm.json")
    logging.info("Parsing named OSM river centerlines...")
    osm_lines = parse_osm_lines(osm_rivers_path)
    
    # Clean and match canonical names for OSM lines
    osm_lines['river_name'] = osm_lines['osm_name'].apply(match_canonical_name)
    osm_lines_matched = osm_lines[osm_lines['river_name'].notna()]
    
    logging.info(f"OSM matched lines: {len(osm_lines_matched)} features.")
    
    # Join HydroRIVERS reaches with OSM named buffers
    logging.info("Joining HydroRIVERS reaches with OSM named river lines...")
    # Buffer OSM lines by 250m (approx 0.00225 degrees)
    osm_lines_matched_proj = osm_lines_matched.to_crs("EPSG:32644")
    osm_lines_matched_proj['geometry'] = osm_lines_matched_proj.geometry.buffer(250)
    osm_buffers = osm_lines_matched_proj.to_crs("EPSG:4326")
    
    # Spatial join
    joined = gpd.sjoin(rivers_clipped, osm_buffers[['geometry', 'river_name']], how='inner', predicate='intersects')
    
    # Dissolve by canonical river name
    logging.info("Dissolving HydroRIVERS centerline segments by canonical river name...")
    # Preserve key attributes from the longest reach or aggregate flow attributes
    dissolved_reaches = joined.dissolve(by='river_name', aggfunc={
        'DIS_AV_CMS': 'max',
        'UPLAND_SKM': 'max',
        'HYRIV_ID': 'first'
    }).reset_index()
    
    # Save centerlines
    centerlines_path = os.path.join("data", "interim", "tamil_nadu_top10_rivers_centerlines.geojson")
    dissolved_reaches.to_file(centerlines_path, driver="GeoJSON")
    logging.info(f"Centerlines saved to {centerlines_path}")
    
    # Parse OSM river surfaces
    osm_surfaces_path = os.path.join("data", "raw", "tamil_nadu_river_surfaces_osm.json")
    logging.info("Parsing named OSM river surfaces...")
    osm_surfaces = parse_osm_polygons(osm_surfaces_path)
    if not osm_surfaces.empty:
        osm_surfaces['river_name'] = osm_surfaces['osm_name'].apply(match_canonical_name)
        osm_surfaces_matched = osm_surfaces[osm_surfaces['river_name'].notna()]
        
        # Intersect with buffered boundary and dissolve
        surfaces_clipped = gpd.clip(osm_surfaces_matched, tn_buffer_gdf)
        if not surfaces_clipped.empty:
            logging.info("Dissolving river surfaces...")
            dissolved_surfaces = surfaces_clipped.dissolve(by='river_name').reset_index()
            surfaces_path = os.path.join("data", "interim", "tamil_nadu_top10_rivers_surfaces.geojson")
            dissolved_surfaces.to_file(surfaces_path, driver="GeoJSON")
            logging.info(f"Surfaces saved to {surfaces_path}")
        else:
            logging.warning("No river surfaces intersect Tamil Nadu boundary.")
    else:
        logging.warning("No OSM river surfaces parsed.")

if __name__ == "__main__":
    main()
