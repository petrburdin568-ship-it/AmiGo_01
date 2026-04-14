param(
    [ValidateSet("Debug", "Release")]
    [string]$BuildType = "Debug",
    [switch]$SkipWebBuild,
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "android"
$gradleUserHome = Join-Path $repoRoot ".gradle"
$localPropertiesPath = Join-Path $androidDir "local.properties"
$androidAssetsDir = Join-Path $androidDir "app\src\main\assets\public"

function Write-Step {
    param([string]$Message)

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-LoggedCommand {
    param(
        [string]$WorkingDirectory,
        [string]$FilePath,
        [string[]]$Arguments
    )

    Write-Host "> $FilePath $($Arguments -join ' ')"

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Get-JavaHomePath {
    $candidates = @()

    if ($env:JAVA_HOME) {
        $candidates += $env:JAVA_HOME
    }

    $candidates += "C:\Program Files\Android\Android Studio\jbr"
    $candidates += "C:\Program Files\Android\Android Studio\jre"

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "bin\java.exe"))) {
            return $candidate
        }
    }

    return $null
}

function Get-AndroidSdkPath {
    $candidates = @()

    if (Test-Path $localPropertiesPath) {
        $sdkLine = Get-Content $localPropertiesPath | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1
        if ($sdkLine) {
            $sdkPathFromProperties = ($sdkLine -replace "^sdk\.dir=", "").Trim()
            $sdkPathFromProperties = $sdkPathFromProperties -replace "\\:", ":"
            $sdkPathFromProperties = $sdkPathFromProperties -replace "\\\\", "\"
            $sdkPathFromProperties = $sdkPathFromProperties -replace "/", "\"
            $candidates += $sdkPathFromProperties
        }
    }

    if ($env:ANDROID_SDK_ROOT) {
        $candidates += $env:ANDROID_SDK_ROOT
    }

    if ($env:ANDROID_HOME) {
        $candidates += $env:ANDROID_HOME
    }

    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
    $candidates += (Join-Path $localAppData "Android\Sdk")
    $candidates += "C:\Android\Sdk"
    $candidates += "C:\Program Files\Android\Sdk"

    foreach ($candidate in $candidates) {
        if (-not $candidate) {
            continue
        }

        $normalizedCandidate = $candidate.Trim()
        if (-not $normalizedCandidate) {
            continue
        }

        if (Test-Path -LiteralPath (Join-Path $normalizedCandidate "platform-tools")) {
            return $normalizedCandidate
        }

        if (Test-Path -LiteralPath $normalizedCandidate) {
            return $candidate
        }
    }

    return $null
}

Write-Step "Preparing Android build environment"

$javaHome = Get-JavaHomePath
if (-not $javaHome) {
    throw "Java was not found. Install Android Studio or set JAVA_HOME to a JDK 17+ location."
}

$sdkPath = Get-AndroidSdkPath
if (-not $sdkPath) {
    throw "Android SDK was not found. Install Android Studio SDK components and make sure platform-tools is available."
}

$env:JAVA_HOME = $javaHome
$env:PATH = "$(Join-Path $javaHome 'bin');$env:PATH"
$env:ANDROID_SDK_ROOT = $sdkPath
$env:ANDROID_HOME = $sdkPath
$env:GRADLE_USER_HOME = $gradleUserHome

$sdkDirForGradle = $sdkPath -replace "\\", "/"
Set-Content -LiteralPath $localPropertiesPath -Value "sdk.dir=$sdkDirForGradle" -Encoding ASCII

Write-Host "JAVA_HOME        $javaHome"
Write-Host "ANDROID_SDK_ROOT $sdkPath"
Write-Host "GRADLE_USER_HOME $gradleUserHome"

if ($SkipWebBuild) {
    $nextOutputMarker = Join-Path $repoRoot ".next\routes-manifest.json"
    if ((-not $SkipSync) -and (-not (Test-Path -LiteralPath $nextOutputMarker))) {
        throw "SkipWebBuild was requested, but .next output was not found. Run npm.cmd run build first or use -SkipSync if Android assets are already prepared."
    }

    Write-Step "Skipping Next.js build and reusing existing .next output"
}
else {
    Write-Step "Building Next.js app"
    Invoke-LoggedCommand -WorkingDirectory $repoRoot -FilePath "npm.cmd" -Arguments @("run", "build")
}

if ($SkipSync) {
    $androidBuildIdPath = Join-Path $androidAssetsDir "BUILD_ID"
    if (-not (Test-Path -LiteralPath $androidBuildIdPath)) {
        throw "SkipSync was requested, but Android web assets were not found in $androidAssetsDir"
    }

    Write-Step "Skipping Capacitor sync and reusing existing Android assets"
}
else {
    Write-Step "Syncing Capacitor Android project"
    Invoke-LoggedCommand -WorkingDirectory $repoRoot -FilePath "npm.cmd" -Arguments @("run", "android:sync")
}

$gradleTask = if ($BuildType -eq "Release") { "assembleRelease" } else { "assembleDebug" }

Write-Step "Running Gradle task $gradleTask"
Invoke-LoggedCommand -WorkingDirectory $androidDir -FilePath (Join-Path $androidDir "gradlew.bat") -Arguments @($gradleTask)

$apkRelativePath = if ($BuildType -eq "Release") {
    "app\build\outputs\apk\release\app-release.apk"
}
else {
    "app\build\outputs\apk\debug\app-debug.apk"
}

$apkPath = Join-Path $androidDir $apkRelativePath

if (-not (Test-Path $apkPath)) {
    throw "Build finished, but APK was not found at $apkPath"
}

Write-Step "APK is ready"
Write-Host $apkPath -ForegroundColor Green
