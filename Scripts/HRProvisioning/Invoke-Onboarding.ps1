# =============================================
# KAG SecOps — HR Onboarding Pipeline
# Created by: Aman Kag
# Date: July 2026
# Description: Automates new starter onboarding
#              Creates user, assigns license,
#              adds to group, sends welcome email
# =============================================

# SECTION 1 — Credentials & Connection

$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_ID"}).Split("=")[1]
$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "TENANT_ID"}).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_SECRET"}).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)

Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

# SECTION 2 — Read CSV & Display Summary

$NewStarters = Import-Csv "$HOME/Documents/KAGSecOps/SampleData/OnboardingList.csv"

Write-Host "`n=== KAG SecOps HR Onboarding Pipeline ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')" -ForegroundColor White
Write-Host "New starters to process: $($NewStarters.Count)`n" -ForegroundColor White

# SECTION 3 — Password Profile + Loop

$PasswordProfile = @{
    Password                      = "KAGWelcome@2026!"
    ForceChangePasswordNextSignIn = $true
}

$Log = @()

foreach($Starter in $NewStarters){

    Write-Host "Processing: $($Starter.DisplayName)" -ForegroundColor White

    $ExistingUser = Get-MgUser -Filter "UserPrincipalName eq '$($Starter.UserPrincipalName)'" -ErrorAction SilentlyContinue

    if($ExistingUser){
        Write-Host "Skipping: $($Starter.DisplayName) already exists" -ForegroundColor Yellow
        continue
    }

    $NewUser = New-MgUser `
        -DisplayName $Starter.DisplayName `
        -GivenName $Starter.FirstName `
        -Surname $Starter.LastName `
        -JobTitle $Starter.JobTitle `
        -Department $Starter.Department `
        -UserPrincipalName $Starter.UserPrincipalName `
        -AccountEnabled `
        -PasswordProfile $PasswordProfile `
        -MailNickname ($Starter.UserPrincipalName.Split("@")[0])

    Write-Host "Created: $($Starter.DisplayName)" -ForegroundColor Green

    # SECTION 4 — Assign License

    $License = Get-MgSubscribedSku | Where-Object { $_.SkuPartNumber -eq "SPB" }

    if($License -and $License.ConsumedUnits -lt $License.PrepaidUnits.Enabled){
        $LicenseAssignment = @{
            AddLicenses    = @(@{ SkuId = $License.SkuId })
            RemoveLicenses = @()
        }
        Set-MgUserLicense -UserId $NewUser.Id -BodyParameter $LicenseAssignment
        Write-Host "License assigned: $($Starter.DisplayName)" -ForegroundColor Green
    } else {
        Write-Host "No licenses available for: $($Starter.DisplayName)" -ForegroundColor Yellow
    }

    # SECTION 5 — Add to Department Group

    $GroupName = "$($Starter.Department)-Staff"
    $Group = Get-MgGroup -Filter "DisplayName eq '$GroupName'" -ErrorAction SilentlyContinue

    if($Group){
        $BodyParameter = @{
            "@odata.id" = "https://graph.microsoft.com/v1.0/users/$($NewUser.Id)"
        }
        New-MgGroupMember -GroupId $Group.Id -BodyParameter $BodyParameter
        Write-Host "Added to group: $GroupName" -ForegroundColor Green
    } else {
        Write-Host "Group not found: $GroupName" -ForegroundColor Yellow
    }

    # SECTION 6 — Send Welcome Email

    $EmailBody = @{
        Message = @{
            Subject = "Welcome to KAG SecOps, $($Starter.FirstName)!"
            Body    = @{
                ContentType = "HTML"
                Content     = @"
<h2>Welcome to the team, $($Starter.FirstName)!</h2>
<p>Your account has been created. Here are your details:</p>
<ul>
    <li><strong>Email:</strong> $($Starter.UserPrincipalName)</li>
    <li><strong>Temporary Password:</strong> KAGWelcome@2026!</li>
    <li><strong>Department:</strong> $($Starter.Department)</li>
    <li><strong>Job Title:</strong> $($Starter.JobTitle)</li>
</ul>
<p>Please sign in and change your password immediately.</p>
<p>IT Support Team — KAG SecOps</p>
"@
            }
            ToRecipients = @(
                @{
                    EmailAddress = @{
                        Address = $Starter.Manager
                    }
                }
            )
        }
    }

    Send-MgUserMail -UserId "amankag@KAGSecOps.onmicrosoft.com" -BodyParameter $EmailBody
    Write-Host "Welcome email sent for: $($Starter.DisplayName)" -ForegroundColor Green

    # SECTION 7 — Log Entry

    $Log += [PSCustomObject]@{
        Timestamp         = Get-Date -Format "dd MMM yyyy HH:mm:ss"
        DisplayName       = $Starter.DisplayName
        UserPrincipalName = $Starter.UserPrincipalName
        Department        = $Starter.Department
        JobTitle          = $Starter.JobTitle
        AccountCreated    = "Yes"
        GroupAssigned     = $GroupName
        EmailSent         = "Yes"
    }

} # closes foreach

# SECTION 8 — Export Log & Final Summary

$LogPath = "$HOME/Documents/KAGSecOps/Docs/Onboarding-Log.csv"
$Log | Export-Csv -Path $LogPath
Write-Host "`n=== Onboarding Complete ===" -ForegroundColor Cyan
Write-Host "Total Processed: $($Log.Count)" -ForegroundColor White
Write-Host "Log exported to: $LogPath" -ForegroundColor Cyan