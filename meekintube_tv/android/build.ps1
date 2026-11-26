<#
  Build the meekinTube TV APK for Xiaomi / Android TV, without Android Studio.

    .\build.ps1                      # build app-debug.apk in Docker (cimg/android)
    .\build.ps1 -Install <tv-ip>     # ... then adb connect + install + launch

  Uses the CircleCI Android image (JDK 21, Gradle 9.8.2, SDK platforms 34-37,
  build-tools 36). The Gradle cache lives in the Docker volume "meekin-gradle".
  The debug signing key is kept in %USERPROFILE%\.android-meekin so every
  build is signed with the same key and installs over the previous one.
#>
param(
  [string]$Install = "",
  [string]$Image = "cimg/android:2026.10"
)
# Native tools (docker, adb) write progress to stderr; PowerShell 5.1 would turn
# that into terminating errors under "Stop", so check exit codes instead.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$keys = Join-Path $env:USERPROFILE ".android-meekin"
New-Item -ItemType Directory -Force -Path $keys | Out-Null

$server = docker version --format "{{.Server.Version}}" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $server) { throw "Docker is not running. Start Docker Desktop first." }

docker image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Pulling $Image (about 3 GB, first build only)..."
  docker pull $Image
  if ($LASTEXITCODE -ne 0) { throw "docker pull $Image failed" }
}
docker volume create meekin-gradle | Out-Null
# root inside the container: the Windows bind mount is then always writable
docker run --rm --user root -e HOME=/root -e GRADLE_USER_HOME=/root/.gradle `
  -v "${here}:/project" -v meekin-gradle:/root/.gradle -v "${keys}:/root/.android" `
  -w /project $Image gradle --no-daemon assembleDebug
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }

$apk = Join-Path $here "app\build\outputs\apk\debug\app-debug.apk"
$final = Join-Path $here "meekinTubeTV-debug.apk"
Copy-Item $apk $final -Force
Write-Host "APK: $final"

if ($Install) {
  $target = if ($Install -match ":\d+$") { $Install } else { "${Install}:5555" }
  adb connect $target
  adb -s $target install -r $final
  if ($LASTEXITCODE -ne 0) { throw "adb install failed (allow USB debugging on the TV when it asks)" }
  adb -s $target shell am start -n org.swumkt.meekintube.tv/.MainActivity
}
