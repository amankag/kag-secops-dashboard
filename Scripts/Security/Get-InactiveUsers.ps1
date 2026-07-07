# =============================================
# KAG SecOps — Inactive Users Report
# Created by: Aman Kag
# Date: July 2026
# Description: Finds users inactive for 30+
#              days based on last sign-in
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "TENANT_ID" }).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_ID" }).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_SECRET" }).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

$ThresholdDate = (Get-Date).AddDays(-30)
$Users         = Get-MgUser -All -Property DisplayName, UserPrincipalName, SignInActivity, Department

$Report = @()

Write-Host "`n=== Inactive Users Report (30+ days) ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White

foreach($User in $Users){
    $LastSignIn = $User.SignInActivity.LastSignInDateTime

    if($null -eq $LastSignIn -or $LastSignIn -lt $ThresholdDate){
        $DaysInactive = if($null -eq $LastSignIn){ "Never signed in" } else { ((Get-Date) - $LastSignIn).Days.ToString() + " days" }

        Write-Host "$($User.DisplayName) | $($User.UserPrincipalName) | $DaysInactive" -ForegroundColor Yellow

        $Report += [PSCustomObject]@{
            DisplayName   = $User.DisplayName
            Email         = $User.UserPrincipalName
            Department    = $User.Department
            LastSignIn    = $LastSignIn
            DaysInactive  = $DaysInactive
        }
    }
}

$Report | Export-Csv "$HOME/Documents/KAGSecOps/Docs/Inactive-Users-Report.csv"
Write-Host "`nInactive Users Found: $($Report.Count)" -ForegroundColor Yellow
Write-Host "Report exported to Docs folder" -ForegroundColor Cyan