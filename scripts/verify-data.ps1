# Windows PowerShell Script to verify local data file integrity using SHA-256 checksums

Write-Host "=== Verifying Dataset and Artifact Integrity ===" -ForegroundColor Cyan

$Success = $true
$Manifests = @(
    @{ Path = "data/manifest.csv"; Dir = "data" },
    @{ Path = "artifacts/manifest.csv"; Dir = "artifacts" }
)

foreach ($M in $Manifests) {
    if (-not (Test-Path $M.Path)) {
        Write-Warning "Manifest file not found: $($M.Path)"
        continue
    }

    Write-Host "Validating manifest: $($M.Path)" -ForegroundColor Gray
    $Entries = Import-Csv -Path $M.Path
    
    foreach ($Entry in $Entries) {
        $FilePath = Join-Path $M.Dir $Entry.filename
        
        if (-not (Test-Path $FilePath)) {
            Write-Host "  [MISSING] $FilePath" -ForegroundColor Yellow
            $Success = $false
            continue
        }
        
        # Verify size
        $RealSize = (Get-Item $FilePath).Length
        if ($RealSize -ne [int64]$Entry.size_bytes) {
            Write-Host "  [FAIL] $FilePath (Size mismatch: expected $($Entry.size_bytes) bytes, got $RealSize)" -ForegroundColor Red
            $Success = $false
            continue
        }
        
        # Verify hash (skip multi-GB files from checking inside rapid CLI test loop unless they exist)
        $HashObject = Get-FileHash -Path $FilePath -Algorithm SHA256
        $RealHash = $HashObject.Hash.ToLower()
        $ExpectedHash = $Entry.sha256_checksum.ToLower()
        
        if ($RealHash -ne $ExpectedHash) {
            Write-Host "  [FAIL] $FilePath (SHA-256 mismatch: expected $ExpectedHash, got $RealHash)" -ForegroundColor Red
            $Success = $false
        } else {
            Write-Host "  [OK] $FilePath (SHA-256 verified)" -ForegroundColor Green
        }
    }
}

if ($Success) {
    Write-Host "=== All files successfully verified! ===" -ForegroundColor Green
} else {
    Write-Error "Data integrity verification failed. Check the errors above."
    Exit 1
}
