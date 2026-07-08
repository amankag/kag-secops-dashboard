# =============================================
# KAG SecOps — Conditional Access Policy Report
# Created by: Aman Kag
# Date: July 2026
# Description: Exports all CA policies from
#              tenant to CSV for audit purposes
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "TENANT_ID" }).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_ID" }).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_SECRET" }).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

# Get all CA policies
$Policies = Get-MgIdentityConditionalAccessPolicy

$Report = @()

Write-Host "`n=== Conditional Access Policy Report ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White

foreach($Policy in $Policies){
    $State = switch($Policy.State){
        "enabled"    { "Enabled" }
        "disabled"   { "Disabled" }
        "enabledForReportingButNotEnforced" { "Report Only" }
        default      { $Policy.State }
    }

    $Color = switch($State){
        "Enabled"     { "Green" }
        "Report Only" { "Yellow" }
        "Disabled"    { "Red" }
        default       { "White" }
    }

    Write-Host "$($Policy.DisplayName) | $State" -ForegroundColor $Color

    $Report += [PSCustomObject]@{
        PolicyName   = $Policy.DisplayName
        State        = $State
        CreatedDate  = $Policy.CreatedDateTime
        ModifiedDate = $Policy.ModifiedDateTime
        Id           = $Policy.Id
    }
}

$ReportPath = "$HOME/Documents/KAGSecOps/Docs/ConditionalAccess/CA-Policy-Report.csv"
$Report | Export-Csv -Path $ReportPath
Write-Host "`nTotal Policies: $($Report.Count)" -ForegroundColor White
Write-Host "Enabled: $(($Report | Where-Object { $_.State -eq 'Enabled' }).Count)" -ForegroundColor Green
Write-Host "Report Only: $(($Report | Where-Object { $_.State -eq 'Report Only' }).Count)" -ForegroundColor Yellow
Write-Host "Report exported to: $ReportPath" -ForegroundColor Cyan