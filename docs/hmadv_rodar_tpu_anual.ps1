param(
  [string]$BasePath = 'D:\Downloads\tpu',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$DryRun,
  [switch]$Importar,
  [switch]$ExecutarValidacaoFinal,
  [int]$MaxRows = 200,
  [int]$BatchSize = 50,
  [switch]$IncluirDocumentos
)

$discoverScript = 'D:\Github\newgit\docs\hmadv_descobrir_tpu_anual.ps1'
$importScript = 'D:\Github\newgit\docs\hmadv_import_tpu_sql_itens.ps1'
$validateScript = 'D:\Github\newgit\docs\hmadv_fase5_tpu_validacao.ps1'

if (-not $DryRun -and -not $Importar) {
  throw 'Informe -DryRun ou -Importar.'
}
if (-not $DryRun -and -not $ServiceRole) {
  throw 'Defina HMADV_SERVICE_ROLE ou use -ServiceRole no mesmo comando.'
}

$discoverOutput = powershell -ExecutionPolicy Bypass -File $discoverScript -BasePath $BasePath
$json = ($discoverOutput | Select-Object -Skip 2) -join "`n"
$found = $json | ConvertFrom-Json

$ordem = @(
  @{ Entity = 'classe'; Path = $found.classe.path },
  @{ Entity = 'assunto'; Path = $found.assunto.path },
  @{ Entity = 'movimento'; Path = $found.movimento.path }
)
if ($IncluirDocumentos) {
  $ordem += @{ Entity = 'documento'; Path = $found.documento.path }
}

foreach ($item in $ordem) {
  if (-not $item.Path) {
    Write-Host "Arquivo nao encontrado para $($item.Entity)."
    continue
  }

  Write-Host ''
  Write-Host ("=== TPU {0} ===" -f $item.Entity.ToUpper())
  $args = @(
    '-ExecutionPolicy','Bypass',
    '-File',$importScript,
    '-InputPath',$item.Path,
    '-Entity',$item.Entity,
    '-MaxRows',$MaxRows,
    '-BatchSize',$BatchSize
  )
  if ($Importar) {
    $args += '-Importar'
    $args += @('-ServiceRole',$ServiceRole)
  }
  & powershell @args
}

if ($ExecutarValidacaoFinal) {
  if (-not $ServiceRole) {
    throw 'A validacao final precisa de HMADV_SERVICE_ROLE.'
  }
  Write-Host ''
  Write-Host '=== VALIDACAO FINAL ==='
  & powershell -ExecutionPolicy Bypass -File $validateScript -ServiceRole $ServiceRole
}
