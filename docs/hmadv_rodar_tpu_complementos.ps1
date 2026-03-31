param(
  [string]$InputPath = 'D:\Github\newgit\docs\tpu\movimentos\dump_dados_oracle_postgres.sql',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 50,
  [int]$MaxRows = 0,
  [switch]$Importar,
  [switch]$ExecutarValidacaoFinal
)

$script = 'D:\Github\newgit\docs\hmadv_import_tpu_complementos.ps1'
$validator = 'D:\Github\newgit\docs\hmadv_fase5_tpu_validacao.ps1'

if ($Importar -and -not $ServiceRole) {
  throw 'Passe -ServiceRole ou defina HMADV_SERVICE_ROLE antes da importacao.'
}

$entities = @(
  'tipo_complemento',
  'complemento',
  'complemento_movimento',
  'complemento_tabelado',
  'procedimento_complementos',
  'temporariedade',
  'tipo_ramo_justica',
  'temp_item'
)

foreach ($entity in $entities) {
  Write-Host ''
  Write-Host ("=== TPU {0} ===" -f $entity.ToUpper())
  $args = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $script,
    '-InputPath', $InputPath,
    '-Entity', $entity,
    '-BatchSize', "$BatchSize"
  )
  if ($MaxRows -gt 0) {
    $args += @('-MaxRows', "$MaxRows")
  }
  if ($Importar) {
    $args += @('-Importar', '-ServiceRole', $ServiceRole)
  }
  & powershell @args
}

if ($ExecutarValidacaoFinal) {
  Write-Host ''
  Write-Host '=== VALIDACAO FINAL ==='
  $args = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $validator
  )
  if ($ServiceRole) {
    $args += @('-ServiceRole', $ServiceRole)
  }
  & powershell @args
}
