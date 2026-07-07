# =============================================
# KAG SecOps — Service Health Report
# Created by: Aman Kag
# Date: July 2026
# Description: Checks M365 service health
#              status across all services
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "TENANT_ID" }).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_ID" }).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_SECRET" }).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

$Services = Get-MgServiceAnnouncementHealthOverview

Write-Host "`n=== M365 Service Health Report ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White

$Report = foreach($Service in $Services){
    Write-Host "$($Service.Service) | " -NoNewline
    switch($Service.Status){
        "serviceOperational"  { Write-Host "Operational" -ForegroundColor Green }
        "serviceDegradation"  { Write-Host "Degraded"    -ForegroundColor Yellow }
        "serviceInterruption" { Write-Host "Outage"      -ForegroundColor Red }
        "serviceRestored"     { Write-Host "Restored"    -ForegroundColor Green }
        default               { Write-Host "$($Service.Status)" -ForegroundColor Cyan }
    }

    [PSCustomObject]@{
        Service = $Service.Service
        Status  = $Service.Status
    }
}

Write-Host "`nTotal Services Checked: $($Services.Count)" -ForegroundColor White

$Report | Export-Csv -Path "$HOME/Documents/KAGSecOps/Docs/ServiceHealth-Report.csv" -NoTypeInformation
Write-Host "Report exported to Docs/ServiceHealth-Report.csv" -ForegroundColor Cyan