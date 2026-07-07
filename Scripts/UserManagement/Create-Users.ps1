# =============================================
# KAG SecOps — Bulk User Creation Script
# Created by: Aman Kag
# Date: July 2026
# Description: Creates 12 fake users in M365
#              tenant for portfolio demo
# =============================================

$PasswordProfile = @{
    Password                      = "KAGSecOps@2026!"
    ForceChangePasswordNextSignIn = $false
}

$Users = @(
    @{
        DisplayName       = "Alex Johnson"
        JobTitle          = "IT Support Analyst"
        Department        = "IT"
        UserPrincipalName = "alex.johnson@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Sarah Chen"
        JobTitle          = "Finance Manager"
        Department        = "Finance"
        UserPrincipalName = "sarah.chen@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Raj Patel"
        JobTitle          = "Software Engineer"
        Department        = "Engineering"
        UserPrincipalName = "raj.patel@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Emma Williams"
        JobTitle          = "HR Business Partner"
        Department        = "HR"
        UserPrincipalName = "emma.williams@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "James Miller"
        JobTitle          = "Sales Executive"
        Department        = "Sales"
        UserPrincipalName = "james.miller@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Priya Sharma"
        JobTitle          = "Data Analyst"
        Department        = "Analytics"
        UserPrincipalName = "priya.sharma@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Tom Wilson"
        JobTitle          = "Operations Manager"
        Department        = "Operations"
        UserPrincipalName = "tom.wilson@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Lisa Anderson"
        JobTitle          = "Marketing Specialist"
        Department        = "Marketing"
        UserPrincipalName = "lisa.anderson@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "David Brown"
        JobTitle          = "Network Engineer"
        Department        = "IT"
        UserPrincipalName = "david.brown@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Michelle Taylor"
        JobTitle          = "Compliance Officer"
        Department        = "Legal"
        UserPrincipalName = "michelle.taylor@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Kevin Nguyen"
        JobTitle          = "Cloud Architect"
        Department        = "Engineering"
        UserPrincipalName = "kevin.nguyen@KAGSecOps.onmicrosoft.com"
    }
    @{
        DisplayName       = "Sophie Martin"
        JobTitle          = "Project Manager"
        Department        = "Operations"
        UserPrincipalName = "sophie.martin@KAGSecOps.onmicrosoft.com"
    }
)

foreach ($User in $Users) {
    New-MgUser `
        -DisplayName $User.DisplayName `
        -JobTitle $User.JobTitle `
        -Department $User.Department `
        -UserPrincipalName $User.UserPrincipalName `
        -AccountEnabled `
        -PasswordProfile $PasswordProfile `
        -MailNickname ($User.UserPrincipalName.Split("@")[0])

    Write-Host "Created: $($User.DisplayName)" -ForegroundColor Green
}

Write-Host "All 12 users created successfully!" -ForegroundColor Cyan