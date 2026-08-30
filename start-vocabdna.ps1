$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PreferredPort = 3000
$ReadyTimeoutSeconds = 60
$CandidatePorts = 3000..3010

function Get-AppUrl([int]$Port) {
  return "http://localhost:$Port/"
}

function Test-HttpOk([int]$Port) {
  try {
    $response = Invoke-WebRequest -Uri (Get-AppUrl $Port) -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Test-PortOpen([int]$Port) {
  $client = $null
  try {
    $client = [Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(300)) {
      return $false
    }
    $client.EndConnect($connect)
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($client) {
      $client.Close()
    }
  }
}

function Clear-VocabDnaDevLock {
  $lockPath = Join-Path $ProjectRoot ".vinext\dev\lock.json"
  if (-not (Test-Path -LiteralPath $lockPath)) {
    return
  }

  try {
    Write-Host "Clearing old VocabDNA dev lock..."
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
  catch {
    Write-Host "Could not clear the old VocabDNA dev lock automatically."
  }
}

function Open-AppBrowser([int]$Port) {
  $url = Get-AppUrl $Port
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "start", '""', $url) -WindowStyle Hidden
}

function Start-VocabDnaServer([int]$Port) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction Stop
  }

  $stdoutLog = Join-Path $ProjectRoot ".vocabdna-server.out.log"
  $stderrLog = Join-Path $ProjectRoot ".vocabdna-server.err.log"

  Start-Process `
    -FilePath $npm.Source `
    -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "$Port") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "Installing VocabDNA dependencies. This may take a few minutes..."
  npm install
}

if (Test-HttpOk $PreferredPort) {
  Write-Host "Opening VocabDNA at $(Get-AppUrl $PreferredPort)"
  Open-AppBrowser $PreferredPort
  exit 0
}

$selectedPort = $null
foreach ($port in $CandidatePorts) {
  if (-not (Test-PortOpen $port)) {
    $selectedPort = $port
    break
  }
}

if (-not $selectedPort) {
  Write-Host "Ports 3000-3010 are already in use."
  Write-Host "Close old local dev servers, then double-click VocabDNA.bat again."
  exit 1
}

Clear-VocabDnaDevLock

Write-Host "Starting VocabDNA on $(Get-AppUrl $selectedPort) ..."
Start-VocabDnaServer $selectedPort

$deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-HttpOk $selectedPort) {
    Write-Host "Opening VocabDNA at $(Get-AppUrl $selectedPort)"
    Open-AppBrowser $selectedPort
    exit 0
  }
  Start-Sleep -Milliseconds 700
}

Write-Host ""
Write-Host "VocabDNA did not become ready on $(Get-AppUrl $selectedPort)."
Write-Host "Check .vocabdna-server.err.log for details."
exit 1
