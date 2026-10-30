<#
  Build (and optionally install) the meekinTube TV .wgt for Samsung TVs.

    .\build.ps1                                 # stage files only, into .\build
    .\build.ps1 -Profile MyTV                   # stage + build + sign + package
    .\build.ps1 -Profile MyTV -Target <device>  # ... and install + launch on that device

  -Profile is the certificate profile name from Tizen Studio's Certificate
  Manager (a Samsung TV certificate that includes your TV's DUID).
  -Target is the device name shown by `sdb devices` after `sdb connect <tv-ip>`.

  The UI comes from backend/meekintube_static/tv so there is one copy of it.
  player.html is NOT packaged: the app frames it from https://swumkt.org on purpose.
#>
param(
  [string]$Profile = "",
  [string]$Target = ""
)
# The Tizen CLI writes progress to stderr; under "Stop" PowerShell 5.1 would
# treat that as fatal, so native steps are checked through $LASTEXITCODE.
$ErrorActionPreference = "Continue"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ui = Resolve-Path (Join-Path $here "..\..\backend\meekintube_static\tv")
$out = Join-Path $here "build"

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item (Join-Path $here "config.xml"), (Join-Path $here "icon.png") $out
Copy-Item (Join-Path $ui "index.html"), (Join-Path $ui "tv.css"), (Join-Path $ui "tv.js") $out
Write-Host "Staged app files in $out"

if (-not $Profile) {
  Write-Host "No -Profile given: stopping after staging. (Open $out\index.html in Chrome at 1920x1080 to try the UI.)"
  exit 0
}

# Find the Tizen CLI: PATH first, then the default Tizen Studio locations.
$tizen = (Get-Command tizen -ErrorAction SilentlyContinue).Source
if (-not $tizen) {
  foreach ($root in @($env:TIZEN_STUDIO, "C:\tizen-studio", "$env:USERPROFILE\tizen-studio")) {
    if ($root -and (Test-Path "$root\tools\ide\bin\tizen.bat")) { $tizen = "$root\tools\ide\bin\tizen.bat"; break }
  }
}
if (-not $tizen) { throw "Tizen CLI not found. Install Tizen Studio (with TV Extensions + Samsung Certificate Extension) or set TIZEN_STUDIO." }

& $tizen build-web -- $out
if ($LASTEXITCODE -ne 0) { throw "tizen build-web failed" }
& $tizen package -t wgt -s $Profile -- (Join-Path $out ".buildResult")
if ($LASTEXITCODE -ne 0) { throw "tizen package failed (is '$Profile' a valid certificate profile?)" }

$wgt = Get-ChildItem (Join-Path $out ".buildResult") -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { throw "No .wgt produced" }
$final = Join-Path $here "meekinTubeTV.wgt"
Copy-Item $wgt.FullName $final -Force
Write-Host "Package: $final"

if ($Target) {
  # install the copy: the CLI names the package after <name> ("meekinTube TV.wgt")
  # and `tizen install` mishandles file names with spaces
  & $tizen install -n "meekinTubeTV.wgt" -t $Target -- $here
  if ($LASTEXITCODE -ne 0) { throw "tizen install failed (did you run 'Permit to install applications' for this TV?)" }
  & $tizen run -p "MeekinTube.MeekinTubeTV" -t $Target
}
