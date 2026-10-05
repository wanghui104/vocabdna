$projectPath = (Get-Location).Path
$buildPath = Join-Path $projectPath 'dist'
$archiveRoot = Join-Path $projectPath '.tmp/build-archives'
$archivePath = Join-Path $archiveRoot ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString())
if ((Split-Path $buildPath -Parent) -ne $projectPath -or -not $archivePath.StartsWith($projectPath + '\.tmp\')) { throw 'Unexpected build path' }
if (Test-Path -LiteralPath $buildPath) {
  New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
  Move-Item -LiteralPath $buildPath -Destination $archivePath -ErrorAction Stop
}
