param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Aplicar,
  [int]$Limite = 100
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$base = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
}

function Normalize-Text([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  return ($value -replace '\s+', ' ').Trim()
}

function Get-Candidates {
  return @(Invoke-RestMethod -Method Get -Uri "$base/processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&select=id,numero_cnj,titulo,polo_ativo,polo_passivo,status_atual_processo&limit=$Limite" -Headers $headers -TimeoutSec 120)
}

function Infer-PolosFromTitulo([string]$titulo) {
  $result = @{
    polo_ativo = $null
    polo_passivo = $null
  }

  if ([string]::IsNullOrWhiteSpace($titulo)) { return $result }

  $m = [regex]::Match($titulo, '\((.+?) x (.+?)\)')
  if (-not $m.Success) { return $result }

  $result.polo_ativo = Normalize-Text $m.Groups[1].Value
  $result.polo_passivo = Normalize-Text $m.Groups[2].Value
  return $result
}

function Build-Patch($proc) {
  $patch = @{}
  $inferred = Infer-PolosFromTitulo $proc.titulo

  if (-not $proc.polo_ativo -and $inferred.polo_ativo) {
    $patch["polo_ativo"] = $inferred.polo_ativo
  }

  if (-not $proc.polo_passivo -and $inferred.polo_passivo) {
    $patch["polo_passivo"] = $inferred.polo_passivo
  }

  if (-not $proc.status_atual_processo) {
    $patch["status_atual_processo"] = "Ativo"
    $patch["status_fonte"] = "fallback"
    $patch["status_detectado_em"] = (Get-Date).ToString("s")
    $patch["status_evento_origem"] = "ausencia_de_evento_de_baixa_ou_suspensao"
  }

  return $patch
}

function Apply-Patch($procId, $patch) {
  $json = $patch | ConvertTo-Json -Depth 8 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method Patch -Uri "$base/processos?id=eq.$procId" -Headers ($headers + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$candidates = Get-Candidates
$preview = @()

foreach ($proc in $candidates) {
  $patch = Build-Patch $proc
  if ($patch.Keys.Count -gt 0) {
    $entry = [ordered]@{
      id = $proc.id
      numero_cnj = $proc.numero_cnj
      titulo = $proc.titulo
      patch = $patch
    }

    if ($Aplicar) {
      try {
        $entry["resultado"] = Apply-Patch $proc.id $patch
      } catch {
        $entry["erro"] = $_.Exception.Message
      }
    }

    $preview += $entry
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  candidatos_lidos = $candidates.Count
  candidatos_com_patch = $preview.Count
  sample = $preview | Select-Object -First 20
} | ConvertTo-Json -Depth 10
