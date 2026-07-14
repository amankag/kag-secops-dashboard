# =============================================
# KAG SecOps — High Risk App Detection
# Created by: Aman Kag
# Date: July 2026
# Description: Flags apps with sensitive or
#              high risk permissions in tenant
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "TENANT_ID"}).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_ID"}).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_SECRET"}).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

# High risk permission scopes to watch for
$HighRiskScopes = @(
    "Mail.Read",
    "Mail.ReadWrite", 
    "Files.ReadWrite.All",
    "Files.Read.All",
    "User.Read.All",
    "User.ReadWrite.All",
    "Directory.ReadWrite.All",
    "Calendars.ReadWrite",
    "Contacts.ReadWrite",
    "MailboxSettings.ReadWrite"
)

Write-Host "`n=== KAG SecOps High Risk App Detection ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White
Write-Host "Scanning for apps with high risk permissions...`n" -ForegroundColor Yellow

$ServicePrincipals = Get-MgServicePrincipal -All -ErrorAction SilentlyContinue
$HighRiskReport = @()
$HighRiskCount = 0

foreach($App in $ServicePrincipals){
    $OAuth2Grants = Get-MgServicePrincipalOauth2PermissionGrant -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue

    foreach($Grant in $OAuth2Grants){
        $Scopes = $Grant.Scope -split " "
        $RiskyScopes = $Scopes | Where-Object { $HighRiskScopes -contains $_ }

        if($RiskyScopes.Count -gt 0){
            $HighRiskCount++
            $RiskLevel = if($RiskyScopes.Count -ge 3){ "CRITICAL" } elseif($RiskyScopes.Count -ge 2){ "HIGH" } else { "MEDIUM" }
            $Color = if($RiskLevel -eq "CRITICAL"){ "Red" } elseif($RiskLevel -eq "HIGH"){ "Yellow" } else { "Cyan" }

            Write-Host "[$RiskLevel] $($App.DisplayName)" -ForegroundColor $Color
            Write-Host "Risky Permissions: $($RiskyScopes -join ', ')" -ForegroundColor $Color
            Write-Host "Consent Type: $($Grant.ConsentType)" -ForegroundColor Gray
            Write-Host ""

            $HighRiskReport += [PSCustomObject]@{
                RiskLevel         = $RiskLevel
                AppName           = $App.DisplayName
                AppId             = $App.AppId
                RiskyPermissions  = $RiskyScopes -join ", "
                ConsentType       = $Grant.ConsentType
                AllScopes         = $Grant.Scope
            }
        }
    }
}

$ReportPath = "$HOME/Documents/KAGSecOps/Docs/HighRiskApps-Report.csv"
$HighRiskReport | Export-Csv -Path $ReportPath

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "High Risk Apps Found: $HighRiskCount" -ForegroundColor Red
Write-Host "Report exported to: $ReportPath" -ForegroundColor Cyan