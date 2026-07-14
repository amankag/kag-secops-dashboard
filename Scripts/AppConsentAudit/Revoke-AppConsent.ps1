# =============================================
# KAG SecOps — Revoke App Consent
# Created by: Aman Kag
# Date: July 2026
# Description: Removes a suspicious app from
#              tenant and revokes all its access
# =============================================

$TenantId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "TENANT_ID"}).Split("=")[1]
$ClientId     = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_ID"}).Split("=")[1]
$ClientSecret = (Get-Content ~/Documents/KAGSecOps/.env | Where-Object {$_ -match "CLIENT_SECRET"}).Split("=")[1]

$ClientSecretSecure = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$ClientCredential   = New-Object System.Management.Automation.PSCredential($ClientId, $ClientSecretSecure)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $ClientCredential -NoWelcome

# App to revoke — change this to target different apps
$TargetAppName = "Contoso PDF Converter"

Write-Host "`n=== KAG SecOps App Consent Revocation ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'dd MMM yyyy HH:mm')`n" -ForegroundColor White
Write-Host "Targeting app: $TargetAppName" -ForegroundColor Yellow

# Find the app service principal
$App = Get-MgServicePrincipal -Filter "DisplayName eq '$TargetAppName'" -ErrorAction SilentlyContinue

if(-not $App){
    Write-Host "App not found: $TargetAppName" -ForegroundColor Red
    exit
}

Write-Host "Found: $($App.DisplayName) — $($App.AppId)" -ForegroundColor Yellow

# Step 1 — Revoke all OAuth2 permission grants
Write-Host "`nStep 1 — Revoking OAuth2 permission grants..." -ForegroundColor White
$Grants = Get-MgServicePrincipalOauth2PermissionGrant -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue

foreach($Grant in $Grants){
    Remove-MgOauth2PermissionGrant -OAuth2PermissionGrantId $Grant.Id -ErrorAction SilentlyContinue
    Write-Host "Revoked grant: $($Grant.Scope)" -ForegroundColor Green
}

# Step 2 — Remove app role assignments
Write-Host "`nStep 2 — Removing app role assignments..." -ForegroundColor White
$RoleAssignments = Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue

foreach($Role in $RoleAssignments){
    Remove-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $App.Id -AppRoleAssignmentId $Role.Id -ErrorAction SilentlyContinue
    Write-Host "Removed role assignment: $($Role.Id)" -ForegroundColor Green
}

# Step 3 — Remove service principal from tenant
Write-Host "`nStep 3 — Removing app from tenant..." -ForegroundColor White
Remove-MgServicePrincipal -ServicePrincipalId $App.Id -ErrorAction SilentlyContinue
Write-Host "App removed from tenant: $TargetAppName" -ForegroundColor Green

# Log the action
$LogPath = "$HOME/Documents/KAGSecOps/Docs/AppRevocation-Log.csv"
$Log = [PSCustomObject]@{
    Timestamp   = Get-Date -Format "dd MMM yyyy HH:mm:ss"
    AppName     = $TargetAppName
    AppId       = $App.AppId
    Action      = "Consent Revoked and App Removed"
    GrantsRemoved = $Grants.Count
    RolesRemoved  = $RoleAssignments.Count
}
$Log | Export-Csv -Path $LogPath
Write-Host "`nAction logged to: $LogPath" -ForegroundColor Cyan
Write-Host "Revocation complete for: $TargetAppName" -ForegroundColor Green