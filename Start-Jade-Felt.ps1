$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($machine) { $parts += $machine }
  if ($user) { $parts += $user }
  if ($env:Path) { $parts += $env:Path }
  $env:Path = ($parts -join ";")
}

function Is-RealNode([string]$exe) {
  if (-not $exe) { return $false }
  if (-not (Test-Path -LiteralPath $exe)) { return $false }
  if ($exe -match "WindowsApps") { return $false }
  return $true
}

Refresh-Path

$candidates = New-Object System.Collections.Generic.List[string]
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd -and (Is-RealNode $cmd.Source)) { $candidates.Add($cmd.Source) }

$fixed = @(
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe",
  "$env:LocalAppData\Programs\nodejs\node.exe",
  "$env:UserProfile\.volta\bin\node.exe",
  "$env:UserProfile\scoop\shims\node.exe",
  "$env:UserProfile\scoop\apps\nodejs-lts\current\node.exe",
  "$env:UserProfile\scoop\apps\nodejs\current\node.exe",
  "$env:ProgramData\chocolatey\bin\node.exe"
)
foreach ($p in $fixed) {
  if (Is-RealNode $p) { $candidates.Add($p) }
}

$roots = @(
  "$env:LocalAppData\fnm",
  "$env:AppData\fnm",
  "$env:AppData\nvm",
  "$env:LocalAppData\nvm",
  "$env:ProgramFiles\nvm",
  "$env:LocalAppData\Microsoft\WinGet\Packages",
  "$env:LocalAppData\Microsoft\WinGet\Links"
)
foreach ($root in $roots) {
  if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 12 |
    ForEach-Object {
      if (Is-RealNode $_.FullName) { $candidates.Add($_.FullName) }
    }
}

$best = $null
$bestVer = $null
$seen = @{}
foreach ($c in $candidates) {
  if ($seen.ContainsKey($c)) { continue }
  $seen[$c] = $true
  try {
    $verText = (& $c -v 2>$null | Select-Object -First 1)
  } catch {
    continue
  }
  if ($verText -notmatch "^v(\d+)\.(\d+)\.(\d+)") { continue }
  $ver = [version]("$($Matches[1]).$($Matches[2]).$($Matches[3])")
  if (-not $bestVer -or $ver -gt $bestVer) {
    $best = $c
    $bestVer = $ver
  }
}

if (-not $best) {
  Write-Host ""
  Write-Host "This window cannot find node.exe."
  Write-Host ""
  Write-Host "Downloading the installer is not enough. You have to run it."
  Write-Host "1. Open https://nodejs.org and download the Windows Installer (.msi), 64-bit."
  Write-Host "2. Run the installer. Leave Add to PATH checked."
  Write-Host "3. Double-click Start Jade Felt.bat again. You do not need to reboot."
  Write-Host ""
  Write-Host "If you already finished the installer, open a new PowerShell and run:  node -v"
  Write-Host "A version like v22.x means Node is installed and this file should have found it."
  Write-Host "If node -v says it is not recognized, the installer did not finish."
  exit 1
}

if ($bestVer -lt [version]"20.0.0") {
  Write-Host "Found $best ($bestVer). Jade Felt needs Node.js 20 or newer. Install Node.js 22 LTS."
  exit 1
}

$nodeDir = Split-Path -Parent $best
$env:Path = "$nodeDir;" + $env:Path
Write-Host "Using $best (v$bestVer)"
Write-Host ""
Write-Host "Installing Jade Felt. The first time can take a few minutes."
Write-Host ""

$npm = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $npm)) {
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) { $npm = $npmCmd.Source }
}
if (-not (Test-Path -LiteralPath $npm)) {
  Write-Host "Found node.exe but not npm.cmd next to it. Reinstall Node.js 22 with the .msi installer."
  exit 1
}

& $npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Install failed. Check that you are online, then run this file again."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Leave this window open. Closing it stops the card room."
Write-Host "The room opens at http://127.0.0.1:8080"
Write-Host "If the page is not ready yet, wait a few seconds and refresh."
Write-Host ""

Start-Process -WindowStyle Hidden powershell.exe -ArgumentList "-NoProfile","-Command","Start-Sleep -Seconds 6; Start-Process 'http://127.0.0.1:8080'"

& $best "scripts\with-app-env.mjs" node ".\node_modules\vite\bin\vite.js" dev --host 127.0.0.1 --port 8080
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
