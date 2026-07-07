# =============================================
# KAG SecOps — New User creation through CSV.
# Created by: Aman Kag
# Date: July 2026
# Description: Creates user from CSV file. 
# =============================================

$PasswordProfile = @{
    Password                      = "KAGSecOps@2026!"
    ForceChangePasswordNextSignIn = $false
}

$Users = Import-Csv "$HOME/Documents/KAGSecOps/SampleData/NewStarters.csv"

$SkippedUser = 0
$CreatedUser = 0
foreach($User in $users){
    # Check if user already exists before creating
    $ExistingUser = Get-MgUser -Filter "UserPrincipalName eq '$($User.UserPrincipalName)'" -ErrorAction SilentlyContinue
        if($ExistingUser){
            Write-Host "Skipping: $($User.DisplayName) already exists" -ForegroundColor Yellow
            $SkippedUser++
        }else{
            New-MgUser `
                -DisplayName $User.DisplayName `
                -JobTitle $User.JobTitle `
                -Department $User.Department `
                -UserPrincipalName $User.UserPrincipalName `
                -AccountEnabled `
                -PasswordProfile $PasswordProfile `
                -MailNickname ($User.UserPrincipalName.Split("@")[0]) 
            Write-Host "Created: $($User.DisplayName)" -ForegroundColor Green
            $CreatedUser++
        }  
}

#Printing the outcome - 
If($CreatedUser -gt 0){
    Write-Host "Users Skipped:" -NoNewline
    Write-Host "$SkippedUser, "-ForegroundColor Cyan -NoNewline
    Write-Host "New Users Created :" -NoNewline
    Write-Host "$CreatedUser " -ForegroundColor Green -NoNewline
    Write-Host "successfully!" -NoNewline
}else{
    Write-Host "Users Skipped:"-NoNewline
    Write-Host "$SkippedUser ,"-ForegroundColor Cyan -NoNewline
    Write-Host "New Users Created :" -NoNewline
    Write-Host "$CreatedUser " -ForegroundColor Red -NoNewline
    Write-Host "successfully!" -NoNewline
}
