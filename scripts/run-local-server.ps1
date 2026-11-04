param(
    [Parameter(Mandatory = $true)][ValidateSet('api', 'web')][string]$Name,
    [Parameter(Mandatory = $true)][string]$LogPrefix
)
$ErrorActionPreference = 'Stop'
# Compatibility entry point; new launches call the Node supervisor directly.
$nodePath = (Get-Command node -ErrorAction Stop).Source
& $nodePath (Join-Path $PSScriptRoot 'local-supervisor.mjs') $Name $LogPrefix
exit $LASTEXITCODE
