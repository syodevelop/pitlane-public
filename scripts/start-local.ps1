$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Get-Command node -ErrorAction Stop | Out-Null
$logDirectory = Join-Path $projectRoot 'test-results\local-servers'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Test-LocalEndpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -ne 200) { return $false }
        if ($Url.EndsWith('/api/health')) {
            $health = $response.Content | ConvertFrom-Json
            return $health.status -eq 'ok' -and $health.environment -eq 'local' -and $health.ruleset -like 'garage-*'
        }
        return $response.Content -match '<title>Pitlane\b'
    } catch { return $false }
}

function Start-LocalServer([string]$Name, [int]$Port, [string]$Health) {
    if (Test-LocalEndpoint $Health) {
        Write-Output "$Name already responds on port $Port."
        return
    }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $Port is occupied but $Health does not respond. Inspect its process; no process was stopped."
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $stdout = Join-Path $logDirectory "$Name-$stamp.stdout.log"
    $stderr = Join-Path $logDirectory "$Name-$stamp.stderr.log"
    $logPrefix = Join-Path $logDirectory "$Name-$stamp"
    $runner = Join-Path $PSScriptRoot 'local-supervisor.mjs'
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    # WMI creates a process outside the calling terminal's Windows job object.
    # Otherwise a terminal/session cleanup can terminate a hidden Start-Process later.
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = "`"$nodePath`" `"$runner`" $Name `"$logPrefix`""
        CurrentDirectory = $projectRoot
        ProcessStartupInformation = $startup
    }
    if ($created.ReturnValue -ne 0) {
        throw "Background launch failed (Windows code $($created.ReturnValue)). Use npm run dev:api and npm run dev in two open terminals."
    }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-LocalEndpoint $Health) {
            $lifecycle = Get-Content -LiteralPath "$logPrefix.lifecycle.log" -Raw -ErrorAction SilentlyContinue
            $nodeMatch = [regex]::Match([string]$lifecycle, 'Node PID (\d+)')
            Write-Output "$Name ready on port $Port. Node PID $($nodeMatch.Groups[1].Value). Supervisor $($created.ProcessId). Exit history: $logPrefix.lifecycle.log"
            return
        }
        if (!(Get-Process -Id $created.ProcessId -ErrorAction SilentlyContinue)) {
            throw "$Name launch ended. Read $logPrefix.lifecycle.log, $stderr and $stdout."
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become ready. Its process was left intact; inspect $stderr and $stdout before retrying."
}

if (!(Test-Path (Join-Path $projectRoot 'node_modules\vite\bin\vite.js'))) {
    throw 'Dependencies are missing. Run npm ci in the project folder first.'
}
if (!(Test-Path (Join-Path $projectRoot 'dist\index.html'))) {
    throw 'The Worker needs built assets. Run npm run build first.'
}
Start-LocalServer 'api' 8787 'http://127.0.0.1:8787/api/health'
Start-LocalServer 'web' 5173 'http://127.0.0.1:5173/play'
if (!(Test-LocalEndpoint 'http://127.0.0.1:5173/api/health')) {
    throw 'The website started but its API proxy is unavailable. Inspect the server logs.'
}
Write-Output 'Open http://127.0.0.1:5173/play. Local background servers keep running after this command ends. Progress was not reset.'
