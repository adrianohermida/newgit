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
  Prefer = "count=exact"
}

function Get-Count($url) {
  $res = Invoke-WebRequest -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  $cr = ($res.Headers["Content-Range"] -join "")
  $m = [regex]::Match($cr, "/(\d+)$")
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return 0
}

function Get-Sample($url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

$report = [ordered]@{
  processos_com_account = Get-Count "$base/processos?account_id_freshsales=not.is.null&select=id"
  processos_sem_polo_ativo = Get-Count "$base/processos?account_id_freshsales=not.is.null&polo_ativo=is.null&select=id"
  processos_sem_polo_passivo = Get-Count "$base/processos?account_id_freshsales=not.is.null&polo_passivo=is.null&select=id"
  processos_sem_status = Get-Count "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=is.null&select=id"
  processos_status_fora_padrao = Get-Count "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=not.in.(Ativo,Baixado,Suspenso)&select=id"
  partes_cliente_hmadv = Get-Count "$base/partes?cliente_hmadv=is.true&select=id"
  partes_representadas = Get-Count "$base/partes?representada_pelo_escritorio=is.true&select=id"
  contatos_sync = Get-Count "$base/processo_contato_sync?select=id"
  sample_processos_sem_status = Get-Sample "$base/processos?account_id_freshsales=not.is.null&status_atual_processo=is.null&select=id,numero_cnj,titulo,polo_ativo,polo_passivo&limit=10"
  sample_processos_sem_polos = Get-Sample "$base/processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null)&select=id,numero_cnj,titulo,polo_ativo,polo_passivo,status_atual_processo&limit=10"
  sample_partes_cliente = Get-Sample "$base/partes?cliente_hmadv=is.true&select=id,processo_id,nome,polo,cliente_hmadv,representada_pelo_escritorio,contato_freshsales_id&limit=10"
}

$report | ConvertTo-Json -Depth 8
