# Data Cleaning Summary

Your 5 uploaded files were actually **not one dataset** — they're 4 unrelated tabular sources plus one file that isn't real tabular data. Each was cleaned separately and is now ML-ready (no unexpected nulls, consistent dtypes, dates parsed, categoricals encoded).

## ⚠️ flood_geodata.csv — could not be processed
Despite the `.csv` extension, this file contains ArcGIS shapefile **XML metadata** (lineage, coordinate system info), not tabular rows/columns. There's no data to clean here — if you meant to upload the actual flood-extent shapefile data, please re-export it as a proper CSV/table and re-upload.

## Files produced (in this order of relevance)

| Output file | Source | Rows | Cols | What it contains |
|---|---|---|---|---|
| `rainfall_telemetry_clean.csv` | file.csv | 166,410 | 21 | Hourly rainfall telemetry per station in Tamil Nadu |
| `flood_events_clean.csv` | flood_data.csv (2nd table) | 4,548 | 17 | Individual flood event records per gauge |
| `catchment_characteristics_clean.csv` | flood_data.csv (1st table) | 155 | 126 | Morphometric/climate/socio-economic features per gauge |
| `water_quality_clean.csv` | water_quality.csv | 1,724 | 32 | River/lake/groundwater quality station stats |
| `flood_water_level_clean.csv` | Flood_0.csv | 40 | 8 | Single-day water level snapshot across sensors |

## Key issues found and fixed

**file.csv → rainfall_telemetry_clean.csv**
- Dropped `Agency` and `State` (constant, zero information value) and `Subtributary`/`SubSubtributary` (100% empty).
- `"-"` placeholders converted to `"Unknown"` for geographic hierarchy fields.
- Parsed timestamps, dropped unparsable rows and duplicate station+time entries.
- Flagged (not deleted) 373 rainfall readings above 305mm/hr — the world hourly rainfall record — as `Rainfall_Outlier_Flag`, since these look like sensor glitches but the underlying event might still be real.
- Added `Year`, `Month`, `Hour`, `DayOfWeek` features.

**flood_data.csv → two separate tables**
This file actually contained **two different schemas concatenated with no second header row** — a data quality issue in the source itself. I split it:
- Table 1 (155 rows): one row per gauge with 108 morphometric/climate/economic features. Stream-order columns that were blank because that stream order simply doesn't exist in a given basin were filled with `0` (not imputed as "missing"). Everything else numeric was coerced and median-imputed. Categorical columns (climate type, land cover, soil, lithology) were one-hot encoded.
- Table 2 (4,548 rows): flood event records. **No header existed for this block in the source file** — I reconstructed column names from context (dates, peak level, duration, discharge, severity). Treat these names as best-effort; verify against original documentation if exact semantics matter. Dates parsed, `SeverityClass` label-encoded, `GaugeID` derived from event ID.

**water_quality.csv**
- Fixed a mojibake character in the CONDUCTIVITY column name.
- Stripped stray triple-quoting from text fields (e.g. `"""BEAS AT UPSTREAM MANALI"""` → `BEAS AT UPSTREAM MANALI`).
- **Dropped ~1,600 rows (nearly half the file) that were entirely blank** — no station code, no data at all.
- Literal `"NA"` strings converted to real nulls, then median-imputed within each Water Quality category.
- `Water Quality` has 253 distinct free-text values, so it was label-encoded rather than one-hot encoded (one-hot would have produced 250+ columns).

**Flood_0.csv**
- Renamed cryptic column headers, parsed dates, treated negative water levels as sensor errors and median-imputed them, label-encoded device name.

## Notes for modeling
- Categorical encodings used label-encoding where cardinality was high (water quality category, device name, severity) and one-hot where cardinality was low (climate/land cover/soil/lithology) — swap either as your model requires.
- `rainfall_telemetry_clean.csv` is large (166K rows); consider train/val/test splitting by time or station to avoid leakage.
- The flood-events table's column names are reconstructed guesses — worth a sanity check against whatever data dictionary the original source (looks like the INDOFLOODS catalog) provides.
