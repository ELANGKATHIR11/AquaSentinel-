import os
# Set PROJ_LIB for rasterio / pyproj compatibility
os.environ["PROJ_LIB"] = r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj"
import pyproj.datadir
pyproj.datadir.set_data_dir(r"C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj")

import zipfile
import glob
import logging
import datetime
import geopandas as gpd
import pandas as pd
import numpy as np
import shapely.geometry

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def extract_dems(zip_dir, extract_dir):
    logging.info("Extracting DEM tiles from zip archives...")
    os.makedirs(extract_dir, exist_ok=True)
    zip_files = glob.glob(os.path.join(zip_dir, "C43.zip")) + \
                glob.glob(os.path.join(zip_dir, "C44.zip")) + \
                glob.glob(os.path.join(zip_dir, "D43.zip")) + \
                glob.glob(os.path.join(zip_dir, "D44.zip"))
                
    for zf in zip_files:
        logging.info(f"Extracting {zf}...")
        with zipfile.ZipFile(zf, 'r') as zip_ref:
            # Viewfinder Panoramas zips might contain files directly or in a subdirectory
            for member in zip_ref.infolist():
                if member.filename.lower().endswith('.hgt'):
                    # Extract flat
                    filename = os.path.basename(member.filename)
                    if filename:
                        target_path = os.path.join(extract_dir, filename)
                        with open(target_path, 'wb') as f_out:
                            f_out.write(zip_ref.read(member.filename))

def main():
    import rasterio
    from rasterio.merge import merge
    from rasterio.mask import mask
    
    raw_dir = os.path.join("data", "raw")
    interim_dir = os.path.join("data", "interim")
    processed_dir = os.path.join("data", "processed")
    dem_extract_dir = os.path.join(raw_dir, "dem_tiles")
    
    extract_dems(raw_dir, dem_extract_dir)
    
    hgt_files = glob.glob(os.path.join(dem_extract_dir, "*.hgt"))
    if not hgt_files:
        logging.error("No HGT files found after extraction!")
        return
        
    logging.info(f"Found {len(hgt_files)} HGT tiles. Preparing to merge...")
    
    # 1. Merge all tiles into a single mosaic
    src_files_to_mosaic = []
    for fp in hgt_files:
        src = rasterio.open(fp)
        src_files_to_mosaic.append(src)
        
    logging.info("Merging raster tiles...")
    mosaic, out_trans = merge(src_files_to_mosaic)
    
    # Copy metadata from the first source
    out_meta = src_files_to_mosaic[0].meta.copy()
    out_meta.update({
        "driver": "GTiff",
        "height": mosaic.shape[1],
        "width": mosaic.shape[2],
        "transform": out_trans,
        "crs": src_files_to_mosaic[0].crs
    })
    
    # Close sources
    for src in src_files_to_mosaic:
        src.close()
        
    # Write interim merged mosaic
    merged_temp_path = os.path.join(interim_dir, "tamil_nadu_dem_merged.tif")
    logging.info(f"Writing merged raster to interim path: {merged_temp_path}")
    with rasterio.open(merged_temp_path, "w", **out_meta) as dest:
        dest.write(mosaic)
        
    # 2. Clip the merged DEM to Tamil Nadu boundary
    boundary_path = os.path.join(interim_dir, "tamil_nadu_boundary.geojson")
    if not os.path.exists(boundary_path):
        logging.error(f"State boundary file {boundary_path} not found!")
        return
        
    logging.info(f"Loading boundary from {boundary_path} for clipping...")
    boundary_gdf = gpd.read_file(boundary_path)
    # Ensure CRS matches (HGT uses EPSG:4326)
    if boundary_gdf.crs != "EPSG:4326":
        boundary_gdf = boundary_gdf.to_crs("EPSG:4326")
        
    geoms = boundary_gdf.geometry.values
    
    logging.info("Clipping raster to Tamil Nadu boundary...")
    with rasterio.open(merged_temp_path) as src:
        # crop=True clips the raster to the extent of the polygon shape
        out_image, out_transform = mask(src, geoms, crop=True)
        out_meta = src.meta.copy()
        
    # Update metadata for clipped raster
    out_meta.update({
        "driver": "GTiff",
        "height": out_image.shape[1],
        "width": out_image.shape[2],
        "transform": out_transform
    })
    
    # Save final DEM
    final_dem_path = os.path.join(processed_dir, "tamil_nadu_dem.tif")
    logging.info(f"Writing clipped DEM to processed path: {final_dem_path}")
    with rasterio.open(final_dem_path, "w", **out_meta) as dest:
        dest.write(out_image)
        
    # 3. Query elevations for the top 10 rivers
    csv_path = os.path.join(processed_dir, "tamil_nadu_top10_rivers.csv")
    if not os.path.exists(csv_path):
        logging.error("Processed top 10 rivers CSV not found! Run compute_metrics first.")
        return
        
    logging.info("Loading rivers database to update elevation metrics...")
    df = pd.read_csv(csv_path)
    
    source_elevations = []
    mouth_elevations = []
    elevation_drops = []
    
    # Open clipped DEM to sample elevations
    with rasterio.open(final_dem_path) as dem_src:
        for idx, row in df.iterrows():
            name = row['river_name']
            src_lat, src_lon = row['source_lat'], row['source_lon']
            mth_lat, mth_lon = row['mouth_lat'], row['mouth_lon']
            
            # Sample source elevation
            src_elev = 0
            if pd.notna(src_lat) and pd.notna(src_lon):
                try:
                    # rasterio sample takes list of (x, y) coords -> (lon, lat)
                    sampled = list(dem_src.sample([(src_lon, src_lat)]))
                    src_elev = float(sampled[0][0])
                except Exception as e:
                    logging.warning(f"Failed to sample source elevation for {name}: {e}")
            
            # Sample mouth elevation
            mth_elev = 0
            if pd.notna(mth_lat) and pd.notna(mth_lon):
                try:
                    sampled = list(dem_src.sample([(mth_lon, mth_lat)]))
                    mth_elev = float(sampled[0][0])
                except Exception as e:
                    logging.warning(f"Failed to sample mouth elevation for {name}: {e}")
            
            # Adjust if NODATA values are returned (HGT typical nodata is -32768)
            if src_elev < -500:
                src_elev = 0.0
            if mth_elev < -500:
                mth_elev = 0.0
                
            drop = max(0.0, src_elev - mth_elev)
            
            source_elevations.append(round(src_elev, 1))
            mouth_elevations.append(round(mth_elev, 1))
            elevation_drops.append(round(drop, 1))
            
            logging.info(f"River: {name} | Source: {src_elev:.1f}m | Mouth: {mth_elev:.1f}m | Drop: {drop:.1f}m")
            
    df['source_elevation_m'] = source_elevations
    df['mouth_elevation_m'] = mouth_elevations
    df['elevation_drop_m'] = elevation_drops
    df['elevation_source'] = "Viewfinder Panoramas (DEM3 90m SRTM)"
    
    # Save back CSV
    df.to_csv(csv_path, index=False, encoding='utf-8')
    logging.info(f"Updated CSV saved to {csv_path}")
    
    # Reload GeoJSON and update it as well
    geojson_path = os.path.join(processed_dir, "tamil_nadu_top10_rivers.geojson")
    if os.path.exists(geojson_path):
        gdf = gpd.read_file(geojson_path)
        # Merge updated elevation columns
        gdf = gdf.merge(df[['river_name', 'source_elevation_m', 'mouth_elevation_m', 'elevation_drop_m', 'elevation_source']], on='river_name', how='left')
        gdf.to_file(geojson_path, driver="GeoJSON")
        # Save shapefiles and geopackages as well
        gdf.to_file(os.path.join(processed_dir, "tamil_nadu_top10_rivers.gpkg"), layer="centerlines", driver="GPKG")
        gdf.to_file(os.path.join(processed_dir, "tamil_nadu_top10_rivers.shp"), driver="ESRI Shapefile")
        logging.info("Updated vector datasets (GeoJSON, GPKG, Shapefile) with elevation details.")
        
    logging.info("DEM processing and elevation extraction completed successfully.")

if __name__ == "__main__":
    main()
