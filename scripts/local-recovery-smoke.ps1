$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) { throw 'Test port 5174 is occupied; nothing was stopped.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PitlaneRecoveryTest {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool TerminateProcess(IntPtr process, uint exitCode);
}
'@
$oldPort = $env:PITLANE_WEB_PORT
$env:PITLANE_WEB_PORT = '5174'
$logRoot = Join-Path $projectRoot 'test-results\local-servers'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$runner = Join-Path $PSScriptRoot 'local-supervisor.mjs'
$supervisor = $null
$testNode = $null
function Wait-TestNode([string]$Prefix, [int]$Previous = 0) {
    for ($i = 0; $i -lt 60; $i++) {
        $history = Get-Content -LiteralPath "$Prefix.lifecycle.log" -Raw -ErrorAction SilentlyContinue
        if (!$history) { Start-Sleep -Milliseconds 250; continue }
        $nodeMatches = [regex]::Matches($history, 'Node PID (\d+)')
        if ($nodeMatches.Count -gt 0) {
            $candidate = [int]$nodeMatches[$nodeMatches.Count - 1].Groups[1].Value
            if ($candidate -ne $Previous) {
                $listener = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
                if ($listener -and $listener.OwningProcess -eq $candidate) {
                    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$candidate"
                    if ($info.CommandLine -notmatch 'scripts/local-web.mjs') { throw 'Unexpected process on test port; nothing was stopped.' }
                    if ((Invoke-WebRequest 'http://127.0.0.1:5174/play' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) {
                        return [System.Diagnostics.Process]::GetProcessById($candidate)
                    }
                }
            }
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Test server did not become ready. Read $Prefix.lifecycle.log"
}
try {
    foreach ($mode in @('crash', 'manual')) {
        $prefix = Join-Path $logRoot "recovery-test-$stamp-$mode"
        $supervisor = Start-Process node.exe -ArgumentList "`"$runner`" web `"$prefix`"" -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
        $testNode = Wait-TestNode $prefix
        if ($mode -eq 'crash') {
            for ($attempt = 0; $attempt -lt 4; $attempt++) {
                $previous = $testNode.Id
                Write-Output "Ending test child $previous with native failure code, iteration $attempt."
                # Simulate the observed native exit on this test's verified child only.
                if (![PitlaneRecoveryTest]::TerminateProcess($testNode.Handle, [uint32]3221226505)) { throw 'Could not end the test child.' }
                $testNode.WaitForExit()
                Write-Output "Test child $previous exited."
                $testNode = $null
                if ($attempt -lt 3) { $testNode = Wait-TestNode $prefix $previous }
            }
        } else {
            Stop-Process -Id $testNode.Id
            $testNode.WaitForExit()
            $testNode = $null
        }
        if (!$supervisor.WaitForExit(8000)) { throw 'Supervisor must stop after manual stop or restart limit.' }
        if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) { throw 'Test server unexpectedly remains running.' }
        $history = Get-Content -LiteralPath "$prefix.lifecycle.log" -Raw
        $count = [regex]::Matches($history, 'Recovering web').Count
        if ($count -ne $(if ($mode -eq 'crash') { 3 } else { 0 })) { throw 'Incorrect recovery count.' }
        if ($mode -eq 'crash') {
            foreach ($suffix in @('', '-retry1', '-retry2', '-retry3')) {
                if (!(Test-Path -LiteralPath "$prefix$suffix.stdout.log")) { throw 'Attempt output was not preserved.' }
            }
        }
    }
    Write-Output 'Recovery passed: three bounded native-crash restarts, separate attempt logs, terminal fourth crash, and no restart after manual stop. Port 5173 and saves untouched.'
} finally {
    if ($testNode -and !$testNode.HasExited) { Stop-Process -Id $testNode.Id }
    if ($supervisor -and !$supervisor.HasExited) { Stop-Process -Id $supervisor.Id }
    if ($null -eq $oldPort) { Remove-Item Env:PITLANE_WEB_PORT -ErrorAction SilentlyContinue } else { $env:PITLANE_WEB_PORT = $oldPort }
}
