param(
  [string]$BasePath = 'D:\Downloads\tpu'
)

$rules = @(
  @{ Entity = 'classe'; Pattern = 'classe.*(dump|tpu)|tpu.*classe' },
  @{ Entity = 'assunto'; Pattern = 'assunto.*(dump|tpu)|tpu.*assunto' },
  @{ Entity = 'movimento'; Pattern = 'movimento.*(dump|tpu)|tpu.*movimento' },
  @{ Entity = 'documento'; Pattern = 'documento.*(dump|tpu)|tpu.*documento' }
)

$result = [ordered]@{}
foreach ($rule in $rules) {
  $match = Get-ChildItem -Path $BasePath -Recurse -File -Include *.sql,*.csv,*.tsv,*.zip |
    Where-Object { $_.Name.ToLower() -match $rule.Pattern } |
    Sort-Object Length -Descending |
    Select-Object -First 1

  $result[$rule.Entity] = if ($match) {
    [ordered]@{ path = $match.FullName; size = $match.Length; extension = $match.Extension }
  } else {
    $null
  }
}

Write-Host ''
Write-Host 'HMADV - Descoberta TPU anual'
$result | ConvertTo-Json -Depth 5
