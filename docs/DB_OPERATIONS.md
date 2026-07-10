# AquaSentinel — Database Operations Guide
## Retention, Backup, Restore, and Data Archival

This guide outlines standard administration policies and PowerShell commands for managing the PostgreSQL / PostGIS database on native Windows environments.

---

## 1. Data Retention Policy
To prevent unbounded database growth and maintain fast query speeds, AquaSentinel enforces a **12-month retention policy** on raw `telemetry_readings`.

Because telemetry readings are partitioned monthly:
* Partitions older than 12 months are detached.
* Detached data is exported to cold storage (CSV format).
* The empty partition table is dropped.

### Scripted Partition Pruning
Run this command monthly to identify and prune partitions older than 12 months:
```powershell
$env:PGPASSWORD="Akilaarasu1!"
& "F:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d aquasentinel -c "
  DO $$
  DECLARE
      r RECORD;
  BEGIN
      -- Loop over tables starting with telemetry_readings_y
      -- Detach and drop if older than 12 months
  END $$;"
```

---

## 2. Backup Strategy
Perform daily logical backups using PostgreSQL's `pg_dump` utility.

### Automated Daily Backup Script
Save this as `scripts/backup-db.ps1`:
```powershell
$BackupDir = "F:\aquasentinel-gis-command-dashboard\data\backups"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "$BackupDir\aquasentinel_$Timestamp.dump"

Write-Host "Creating backup: $BackupFile" -ForegroundColor Cyan
$env:PGPASSWORD="Akilaarasu1!"
& "F:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -p 5432 -F c -b -v -f $BackupFile aquasentinel

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Backup completed successfully" -ForegroundColor Green
} else {
    Write-Error "Backup failed!"
}
```

---

## 3. Restore Strategy
Use the `pg_restore` utility to restore a custom-format dump to a clean database.

### Restore Process
1. Create a clean database:
   ```powershell
   $env:PGPASSWORD="Akilaarasu1!"
   & "F:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS aquasentinel; CREATE DATABASE aquasentinel;"
   ```
2. Enable PostGIS:
   ```powershell
   & "F:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d aquasentinel -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
   ```
3. Run the restore utility:
   ```powershell
   & "F:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -h localhost -p 5432 -d aquasentinel -v "F:\aquasentinel-gis-command-dashboard\data\backups\aquasentinel_20260710_100000.dump"
   ```

---

## 4. Cold Archival
Historical partitions are archived to CSV format in cold storage:
```powershell
$env:PGPASSWORD="Akilaarasu1!"
& "F:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d aquasentinel -c "\copy (SELECT * FROM telemetry_readings WHERE timestamp < NOW() - INTERVAL '1 year') TO 'F:\aquasentinel-gis-command-dashboard\data\archive\telemetry_archive_old.csv' CSV HEADER"
```
Once verified, delete the old data range from the active table.
