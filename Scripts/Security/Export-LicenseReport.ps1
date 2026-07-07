# =============================================
# KAG SecOps — License Report
# Created by: Aman Kag
# Date: July 2026
# Description: Reports on M365 license
#              assignment across all users
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "TENANT_ID" }).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_ID" }).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_SECRET" }).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

$Users  = Get-MgUser -All -Property DisplayName, UserPrincipalName, AssignedLicenses, Department
$Report = @()

Write-Host "`n=== License Assignment Report ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White

foreach($User in $Users){
    $LicenseStatus = if($User.AssignedLicenses.Count -gt 0){ "Licensed" } else { "Unlicensed" }
    $Color         = if($LicenseStatus -eq "Licensed"){ "Green" } else { "Yellow" }

    Write-Host "$($User.DisplayName) | $($User.UserPrincipalName) | $LicenseStatus" -ForegroundColor $Color

    $Report += [PSCustomObject]@{
        DisplayName   = $User.DisplayName
        Email         = $User.UserPrincipalName
        Department    = $User.Department
        LicenseStatus = $LicenseStatus
        LicenseCount  = $User.AssignedLicenses.Count
    }
}

$Report | Export-Csv "$HOME/Documents/KAGSecOps/Docs/License-Report.csv"

Write-Host "`nTotal Users: $($Report.Count)" -ForegroundColor White
Write-Host "Licensed: $(($Report | Where-Object { $_.LicenseStatus -eq 'Licensed' }).Count)" -ForegroundColor Green
Write-Host "Unlicensed: $(($Report | Where-Object { $_.LicenseStatus -eq 'Unlicensed' }).Count)" -ForegroundColor Yellow
Write-Host "Report exported to Docs folder" -ForegroundColor Cyan