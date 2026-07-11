# =============================================
# KAG SecOps — HR Offboarding Pipeline
# Created by: Aman Kag
# Date: July 2026
# Description: Automates offboarding
#              remove user, disable account, remove license, remove from group.
#     
# =============================================

# SECTION 1 — Credentials & Connection

$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_ID"}).Split("=")[1]
$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "TENANT_ID"}).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_SECRET"}).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)

Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

# SECTION 2 — Read CSV & Display Summary

$OffboardingUsers = Import-Csv "$HOME/Documents/KAGSecOps/SampleData/offboardingList.csv"

Write-Host "`n=== KAG SecOps HR Offboarding Pipeline ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')" -ForegroundColor White
Write-Host "Users to offboard: $($OffboardingUsers.Count)`n" -ForegroundColor White


# SECTION 3 — Offboarding Loop

$Log = @()

foreach($Leaver in $OffboardingUsers){

    Write-Host "Processing: $($Leaver.DisplayName)" -ForegroundColor White

    # Find user in tenant
    $User = Get-MgUser -Filter "UserPrincipalName eq '$($Leaver.UserPrincipalName)'" -ErrorAction SilentlyContinue

    if(-not $User){
        Write-Host "User not found: $($Leaver.DisplayName)" -ForegroundColor Red
        continue
    }

    # Step 1 — Revoke all active sessions immediately
    Revoke-MgUserSignInSession -UserId $User.Id
    Write-Host "Sessions revoked: $($Leaver.DisplayName)" -ForegroundColor Green

    # Step 2 — Disable account
    Update-MgUser -UserId $User.Id -AccountEnabled:$false
    Write-Host "Account disabled: $($Leaver.DisplayName)" -ForegroundColor Green

    # Step 3 — Remove all licenses
    $UserLicenses = Get-MgUserLicenseDetail -UserId $User.Id
    if($UserLicenses){
        $LicenseRemoval = @{
            AddLicenses    = @()
            RemoveLicenses = @($UserLicenses.SkuId)
        }
        Set-MgUserLicense -UserId $User.Id -BodyParameter $LicenseRemoval
        Write-Host "Licenses removed: $($Leaver.DisplayName)" -ForegroundColor Green
    } else {
        Write-Host "No licenses to remove: $($Leaver.DisplayName)" -ForegroundColor Yellow
    }

    # Step 4 — Remove from all groups
    $UserGroups = Get-MgUserMemberOf -UserId $User.Id
    foreach($Group in $UserGroups){
        try {
            Remove-MgGroupMemberByRef -GroupId $Group.Id -DirectoryObjectId $User.Id
            Write-Host "Removed from group: $($Group.AdditionalProperties.displayName)" -ForegroundColor Green
        } catch {
            Write-Host "Could not remove from: $($Group.AdditionalProperties.displayName)" -ForegroundColor Yellow
        }
    }

    # SECTION 4 — Log Entry
    $Log += [PSCustomObject]@{
        Timestamp         = Get-Date -Format "dd MMM yyyy HH:mm:ss"
        DisplayName       = $Leaver.DisplayName
        UserPrincipalName = $Leaver.UserPrincipalName
        Department        = $Leaver.Department
        Reason            = $Leaver.Reason
        SessionsRevoked   = "Yes"
        AccountDisabled   = "Yes"
        LicensesRemoved   = "Yes"
        GroupsRemoved     = "Yes"
    }

    Write-Host "Offboarding complete: $($Leaver.DisplayName)`n" -ForegroundColor Cyan

} # closes foreach

# SECTION 5 — Export Log & Summary

$LogPath = "$HOME/Documents/KAGSecOps/Docs/Offboarding-Log.csv"
$Log | Export-Csv -Path $LogPath
Write-Host "`n=== Offboarding Complete ===" -ForegroundColor Cyan
Write-Host "Total Offboarded: $($Log.Count)" -ForegroundColor White
Write-Host "Log exported to: $LogPath" -ForegroundColor Cyan