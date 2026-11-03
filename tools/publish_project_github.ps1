param(
 [Parameter(Mandatory=$true)][string]$ProjectFolder,
 [Parameter(Mandatory=$true)][string]$ProjectTitle,
 [Parameter(Mandatory=$true)][string]$SourceMax,
 [string]$ProjectId,
 [switch]$SkipAssembly
)
$ErrorActionPreference='Stop'
$pythonExecutable=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
if(-not (Test-Path -LiteralPath $pythonExecutable)){$pythonExecutable=(Get-Command python -ErrorAction Stop).Source}
if(-not $SkipAssembly){
 & $pythonExecutable -X utf8 (Join-Path $PSScriptRoot 'assembly_pdf.py') (Join-Path $ProjectFolder 'scene.json') (Join-Path $ProjectFolder 'assembly.pdf') $ProjectTitle
 if($LASTEXITCODE -ne 0){throw 'Монтажный PDF не создан. Публикация остановлена.'}
}
$publishArguments=@('-X','utf8',(Join-Path $PSScriptRoot 'publish_max.py'),'--folder',$ProjectFolder,'--title',$ProjectTitle,'--source',$SourceMax)
if($ProjectId){$publishArguments+=@('--id',$ProjectId)}
if(-not $SkipAssembly){$publishArguments+='--assembly'}
& $pythonExecutable @publishArguments
if($LASTEXITCODE -ne 0){throw 'Публикация в GitHub не завершена.'}
