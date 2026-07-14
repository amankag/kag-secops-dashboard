# =============================================
# KAG SecOps — App Consent Audit Report
# Created by: Aman Kag
# Date: July 2026
# Description: Pulls all third party apps with
#              consented permissions from tenant
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "TENANT_ID"}).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_ID"}).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_SECRET"}).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

Write-Host "`n=== KAG SecOps App Consent Audit Report ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White

$ServicePrincipals = Get-MgServicePrincipal -All | Where-Object {
    $_.Tags -contains "WindowsAzureActiveDirectoryIntegratedApp" -or
    $_.ServicePrincipalType -eq "Application"
}

$Report = @()

foreach($App in $ServicePrincipals){
    $Permissions = Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue
    $OAuth2Grants = Get-MgServicePrincipalOauth2PermissionGrant -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue

    $PermissionList = if($Permissions){ ($Permissions.AppRoleId | ForEach-Object { $_.ToString() }) -join ", " } else { "" }
    $ScopeList = ($OAuth2Grants.Scope) -join ", "

    Write-Host "App: $($App.DisplayName)" -ForegroundColor White
    Write-Host "Type: $($App.ServicePrincipalType)" -ForegroundColor Gray
    if($ScopeList){
        Write-Host "Delegated Scopes: $ScopeList" -ForegroundColor Yellow
    }
    Write-Host ""

    $Report += [PSCustomObject]@{
        AppName           = $App.DisplayName
        AppId             = $App.AppId
        Type              = $App.ServicePrincipalType
        DelegatedScopes   = $ScopeList
        AppRoleCount      = $Permissions.Count
        CreatedDateTime   = $App.CreatedDateTime
    }
}

$ReportPath = "$HOME/Documents/KAGSecOps/Docs/AppConsent-Report.csv"
$Report | Export-Csv -Path $ReportPath
Write-Host "Total Apps Found: $($Report.Count)" -ForegroundColor White
Write-Host "Report exported to: $ReportPath" -ForegroundColor Cyan