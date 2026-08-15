# DNS verification for the domain-attach playbook (DOMAIN-ONBOARDING-PLAYBOOK.md).
# Checks: MX target, single SPF + lookups, DKIM selectors, DMARC, MTA-STS,
# CAA, and proxy split (proxied host shows Cloudflare ranges, mail shows origin).
# Usage: .\check-dns.ps1 -Domain opusoverseas.com [-VpsIp 1.2.3.4]

param(
  [string]$Domain,
  [string]$VpsIp,
  [string[]]$DkimSelectors = @('mail', 'default', 'mautic'),
  [switch]$SkipNetwork
)

$ErrorActionPreference = 'Continue'
$results = @()

function Check($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ Check = $name; Status = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail }
}

function Dns($type, $name) {
  try { (Resolve-DnsName -Name $name -Type $type -ErrorAction Stop | Sort-Object Name) } catch { @() }
}

# â”€â”€ MX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$mx = Dns MX $Domain
$mxTarget = ($mx | Where-Object Type -eq 'MX' | Select-Object -First 1).NameExchange
Check 'MX record exists' ($null -ne $mxTarget) ($(if ($mxTarget) { $mxTarget } else { 'none' }))
if ($mxTarget) {
  $mxHost = ($mxTarget -replace '\.$','')
  Check 'MX points at mail host' ($mxHost -like 'mail.*') $mxHost
  $mxA = Dns A $mxHost
  Check 'MX host resolves (A)' ($mxA.Count -gt 0) (($mxA | ForEach-Object IPAddress) -join ',')
  if ($VpsIp -and $mxA) {
    Check 'MX host IP matches VPS' ($mxA.IPAddress -contains $VpsIp) ($mxA.IPAddress -join ',')
  }
  # Proxy split: mail must NOT resolve to Cloudflare ranges
  if ($mxA) {
    $cfRanges = @('104.16.','104.17.','104.18.','104.19.','172.64.','172.65.','172.66.','172.67.','162.159.','188.114.')
    $proxied = ($mxA.IPAddress | Where-Object { $cfRanges.Contains($_.Substring(0, [Math]::Min(7, $_.Length))) }).Count -gt 0
    Check 'mail host is DNS-only (not proxied)' (-not $proxied) (($mxA.IPAddress) -join ',')
  }
}

# â”€â”€ SPF (one record, <10 lookups) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$spf = Dns TXT $Domain | Where-Object Strings -like 'v=spf1*' | ForEach-Object { $_.Strings -join '' }
Check 'Exactly one SPF record' ($spf -is [string]) 'single record'
if ($spf -is [string]) {
  $lookups = ([regex]::Matches($spf, '\b(include|a|mx|ptr|exists):')).Count
  Check 'SPF under 10-lookup budget' ($lookups -le 10) ("~$lookups lookups")
  Check 'SPF includes SMTP2GO' ($spf.ToLower() -match 'senders\.smtp2go\.com') $spf
}

# â”€â”€ DKIM selectors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
foreach ($sel in $DkimSelectors) {
  $key = Dns TXT "$sel._domainkey.$Domain"
  Check "DKIM selector '$sel' published" ($key.Count -gt 0) ($(if ($key.Count) { 'present' } else { 'missing' }))
  if ($key.Count) {
    Check "DKIM '$sel' is 2048-bit+" (($key | ForEach-Object Strings | Out-String) -match 'p=[A-Za-z0-9+/]{300,}') 'key present'
  }
}

# â”€â”€ DMARC + MTA-STS + CAA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$dmarc = Dns TXT "_dmarc.$Domain"
$dmarcTxt = $dmarc | ForEach-Object { $_.Strings -join '' }
Check 'DMARC published' ($dmarc.Count -gt 0) ($(if ($dmarc.Count) { $dmarcTxt } else { 'missing' }))
if ($dmarc.Count -and $dmarcTxt -match 'p=(none|quarantine|reject)') {
  $pol = [regex]::Match($dmarcTxt, 'p=(\w+)').Groups[1].Value
  Check 'DMARC policy set' ($pol -in @('none','quarantine','reject')) $pol
}
$mta = Dns TXT "_mta-sts.$Domain"
Check 'MTA-STS TXT published' ($mta.Count -gt 0) ($(if ($mta.Count) { 'present' } else { 'optional but recommended' }))
$caa = Dns CAA $Domain
$caaVal = (($caa | ForEach-Object { $_.Value } | Where-Object { $_ } | ForEach-Object { $_.ToString() }) -join ';')
Check 'CAA restricts issuance' ($caa.Count -gt 0) ($(if ($caa.Count) { $caaVal } else { 'missing' }))

# â”€â”€ Apex proxy split â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$apex = Dns A $Domain
if ($apex) {
  $cfRanges = @('104.16.','104.17.','104.18.','104.19.','172.64.','172.65.','172.66.','172.67.','162.159.','188.114.')
  $proxied = ($apex.IPAddress | Where-Object { $cfRanges.Contains($_.Substring(0, [Math]::Min(7, $_.Length))) }).Count -gt 0
  Check 'Apex is proxied (Cloudflare ranges)' $proxied (($apex.IPAddress) -join ',')
}

# â”€â”€ Output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Output ''
$results | Format-Table -AutoSize
$fails = $results | Where-Object Status -eq 'FAIL'
Write-Output ('RESULT: ' + $results.Count + ' checks, ' + $fails.Count + ' FAIL')
if ($fails.Count) { $fails | ForEach-Object { Write-Output ('  FAIL: ' + $_.Check + ' — ' + $_.Detail) } }
Write-Output ''
Write-Output 'Manual follow-ups: MXToolbox supertool, DNSViz (DNSSEC), mail-tester >= 9 per sender class.'
if ($fails.Count -gt 0) { exit 1 } else { exit 0 }




