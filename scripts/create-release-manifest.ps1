# Windows PowerShell Script to compile release-manifest.json

Write-Host "=== Compiling Release Manifest ===" -ForegroundColor Cyan

# 1. Fetch current Git commit hash
$CommitSha = "UNKNOWN"
if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        $CommitSha = (git rev-parse HEAD).Trim()
    } catch {}
}

# 2. Parse dataset manifests
$Datasets = @()
if (Test-Path "data/manifest.csv") {
    $Datasets = Import-Csv "data/manifest.csv" | ForEach-Object {
        [PSCustomObject]@{
            filename = $_.filename
            sha256   = $_.sha256_checksum
            size     = [int64]$_.size_bytes
        }
    }
}

# 3. Parse artifact manifests
$Models = @()
if (Test-Path "artifacts/manifest.csv") {
    $Models = Import-Csv "artifacts/manifest.csv" | ForEach-Object {
        [PSCustomObject]@{
            filename = $_.filename
            sha256   = $_.sha256_checksum
            size     = [int64]$_.size_bytes
        }
    }
}

# 4. Assemble release payload
$Manifest = @{
    commit_sha      = $CommitSha
    timestamp       = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
    datasets        = $Datasets
    models          = $Models
    build_version   = "v1.0.0-release"
}

# 5. Write to release-manifest.json
$ManifestJson = $Manifest | ConvertTo-Json -Depth 5
$TargetFile = "release-manifest.json"
[System.IO.File]::WriteAllText($TargetFile, $ManifestJson)

Write-Host "[OK] Saved release manifest to: $TargetFile" -ForegroundColor Green
