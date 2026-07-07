# =============================================
# KAG SecOps — MFA Status Report
# Created by: Aman Kag
# Date: July 2026
# Description: Checks MFA registration status
#              for all users in the tenant
# =============================================

#Extracting the info about the below fields from the .env file containing all secure info.
$TenantId = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "TENANT_ID" }).Split("=")[1]
$ClientId = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_ID" }).Split("=")[1]
$clientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object { $_ -match "CLIENT_SECRET" }).Split("=")[1]

#Getting variables containing secure credentials which powershell understand
$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force

$ClientCredential = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)

Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential

#Getting users info from the m365
$Users = Get-MgUser -All -Property DisplayName, UserPrincipalName, Department, JobTitle, Id

# Collect results for CSV export
$Report = @()

#Chechking and printing user info wether they have MFA enabled or not -
foreach($User in $Users){
    $AuthMethods = Get-MgUserAuthenticationMethod -UserId $User.Id
    if($AuthMethods.count -gt 1){
        $MFAStatus = "Enabled"
        Write-Host "$($User.DisplayName) | $($User.UserPrincipalName) | $MFAStatus" -ForegroundColor Green
    }else{
        $MFAStatus = "Not Registered"
        Write-Host "$($User.DisplayName) | $($User.UserPrincipalName) | $MFAStatus" -ForegroundColor Red
    }
    $Report += [PSCustomObject]@{
    DisplayName      = $User.DisplayName
    Email            = $User.UserPrincipalName
    Department       = $User.Department
    JobTitle         = $User.JobTitle
    MFAStatus        = $MFAStatus
    AuthMethodsCount = $AuthMethods.Count
    }
}

# Export to CSV
$ReportPath = "~/Documents/KAGSecOps/Docs/MFA-Report.csv"
$Report | Export-Csv -Path $ReportPath 
Write-Host "`nReport exported to: $ReportPath" -ForegroundColor Cyan
Write-Host "Total Users: $($Report.Count)" -ForegroundColor White
Write-Host "MFA Enabled: $(($Report | Where-Object { $_.MFAStatus -eq 'Enabled' }).Count)" -ForegroundColor Green
Write-Host "Not Registered: $(($Report | Where-Object { $_.MFAStatus -eq 'Not Registered' }).Count)" -ForegroundColor Red