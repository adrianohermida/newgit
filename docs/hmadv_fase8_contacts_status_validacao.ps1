param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$base = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Profile" = "judiciario"
  Prefer = "count=exact"
}

function Get-Count($url) {
  try {
    $countUrl = if ($url -match "limit=") { $url } elseif ($url -match "\?") { "$url&limit=5000" } else { "$url?limit=5000" }
    $rows = Invoke-RestMethod -Method Get -Uri $countUrl -Headers $headers -TimeoutSec 60
    if ($null -eq $rows) { return 0 }
    return @($rows).Count
  } catch {
    return @{
      erro = $_.Exception.Message
    }
  }
}

function Get-Sample($url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

function Test-Column($table, $column) {
  try {
    Invoke-RestMethod -Method Get -Uri "$base/$table?select=$column&limit=1" -Headers $headers -TimeoutSec 30 | Out-Null
    return $true
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "Could not find the '.*' column" -or $msg -match "column .* does not exist" -or $msg -match "\(400\)" -or $msg -match "\(404\)") {
      return $false
    }
    return @{
      erro = $msg
    }
  }
}

$hasClienteHmadv = Test-Column "partes" "cliente_hmadv"
$hasRepresentada = Test-Column "partes" "representada_pelo_escritorio"
$hasContatoFreshsales = Test-Column "partes" "contato_freshsales_id"
$hasPrincipalNoAccount = Test-Column "partes" "principal_no_account"
$hasProcessoContatoSync = Test-Column "processo_contato_sync" "id"
$hasStatusFonte = Test-Column "processos" "status_fonte"

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  processos_com_account = Get-Count "$base/processos?account_id_freshsales=not.is.null&select=id"
  processos_sem_polo_ativo = Get-Count "$base/processos?account_id_freshsales=not.is.null&polo_ativo=is.null&select=id"
  processos_sem_polo_passivo = Get-Count "$base/processos?account_id_freshsales=not.is.null&polo_passivo=is.null&select=id"
  processos_sem_status = Get-Count "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=is.null&select=id"
  processos_status_fora_padrao = Get-Count "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=not.in.(Ativo,Baixado,Suspenso)&select=id"
  partes_cliente_hmadv = if ($hasClienteHmadv -eq $true) { Get-Count "$base/partes?cliente_hmadv=is.true&select=id" } else { @{ aviso = "coluna cliente_hmadv ainda nao aplicada" } }
  partes_representadas = if ($hasRepresentada -eq $true) { Get-Count "$base/partes?representada_pelo_escritorio=is.true&select=id" } else { @{ aviso = "coluna representada_pelo_escritorio ainda nao aplicada" } }
  partes_com_contato_freshsales = if ($hasContatoFreshsales -eq $true) { Get-Count "$base/partes?contato_freshsales_id=not.is.null&select=id" } else { @{ aviso = "coluna contato_freshsales_id ainda nao aplicada" } }
  partes_principais_no_account = if ($hasPrincipalNoAccount -eq $true) { Get-Count "$base/partes?principal_no_account=is.true&select=id" } else { @{ aviso = "coluna principal_no_account ainda nao aplicada" } }
  contatos_sync = if ($hasProcessoContatoSync -eq $true) { Get-Count "$base/processo_contato_sync?select=id" } else { @{ aviso = "tabela processo_contato_sync ainda nao aplicada" } }
  status_fonte_disponivel = $hasStatusFonte
  sample_processos_sem_status = Get-Sample "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=is.null&select=id,numero_cnj,titulo,polo_ativo,polo_passivo&limit=10"
  sample_processos_sem_polos = Get-Sample "$base/processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null)&select=id,numero_cnj,titulo,polo_ativo,polo_passivo,status_atual_processo&limit=10"
  sample_partes_cliente = if ($hasClienteHmadv -eq $true) { Get-Sample "$base/partes?cliente_hmadv=is.true&select=id,processo_id,nome,polo,cliente_hmadv,representada_pelo_escritorio,contato_freshsales_id,principal_no_account&limit=10" } else { @{ aviso = "sample_partes_cliente indisponivel antes da migracao 006" } }
  sample_processos_status_fora_padrao = Get-Sample "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=not.in.(Ativo,Baixado,Suspenso)&select=id,numero_cnj,titulo,status_atual_processo&limit=10"
}

$report | ConvertTo-Json -Depth 8
