# KAG SecOps Dashboard

![PowerShell](https://img.shields.io/badge/PowerShell-7-5391FE?logo=powershell&logoColor=white)
![Python](https://img.shields.io/badge/Python-FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black)
![Microsoft Graph](https://img.shields.io/badge/Microsoft%20Graph-API-0078D4?logo=microsoft&logoColor=white)

A self-hosted Microsoft 365 security operations dashboard that replaces five separate admin portals — Entra ID, Intune, Defender, Compliance, and Service Health — with one live view, built against a real M365 tenant using Microsoft Graph.

<p align="center">
  <img src="./Docs/screenshots/dashboard/01-overview.png" alt="KAG SecOps Dashboard overview" width="850">
</p>

---

## Problem → Solution

IT support and cloud teams routinely check MFA status, license assignment, inactive accounts, and service health across separate M365 admin panels. That's slow, repetitive, and easy to lose track of. This dashboard pulls all four signals from Microsoft Graph, correlates them, and surfaces the ones that actually need action — not just raw counts.

## Features

- **Live data**, not a static export — PowerShell scripts hit Microsoft Graph directly against a real tenant, a FastAPI backend serves the results, and a one-click Refresh button re-runs everything on demand
- **Security Score** built from real weighted contributions (MFA coverage, license coverage, service health) rather than an arbitrary single number, with a full point-by-point breakdown on click
- **Compounded risk detection** — cross-references the MFA report against the inactivity report to surface users who combine *both* risk factors at once, a signal neither report shows on its own
- **Click-to-drill-down everywhere** — every bar, chart point, and department breakdown expands to show the exact users behind the number, instead of an ambiguous "2 of 3"
- **Searchable, filterable lists** for MFA gaps, inactive users, license status, and service health
- **Employee directory** with live search across name and department
- **Notifications** generated from the same live data (not a separate hardcoded feed), with read/unread state
- Smooth flip-in card expansion, hover states, and a department radar chart, tuned over several rounds of visual iteration (see *Design & Iteration* below)

## Architecture

```
PowerShell 7 + Microsoft.Graph SDK
        │  (app-only auth, client credentials flow)
        ▼
Azure AD App Registration ──► Microsoft Graph API
        │
        ▼
CSV reports (Docs/*.csv)
        │
        ▼
FastAPI backend (Python)  ──►  GET /api/mfa-status
                                GET /api/license-report
                                GET /api/inactive-users
                                GET /api/service-health
                                POST /api/refresh
        │
        ▼
React frontend (localhost:3000)
```

## Tech stack

`PowerShell 7` · `Microsoft.Graph PowerShell SDK` · `Python` · `FastAPI` · `uvicorn` · `React` · `Microsoft Entra ID` · `Azure AD App Registration`

## How to run locally

**Backend:**
```bash
cd ~/Documents/KAGSecOps/Backend
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd ~/Documents/KAGSecOps/dashboard
npm start
```

Requires a `.env` file with `TENANT_ID`, `CLIENT_ID`, and `CLIENT_SECRET` for an Azure AD app registration with the following application permissions granted:

`User.Read.All` · `User.ReadWrite.All` · `AuditLog.Read.All` · `DeviceManagementManagedDevices.Read.All` · `ServiceHealth.Read.All` · `UserAuthenticationMethod.Read.All` · `Policy.Read.All` · `Group.ReadWrite.All` · `Organization.Read.All` · `Mail.Send`

Note: permissions were added incrementally as each feature was built — not granted all at once — following least privilege principles.

## Screenshots

| | |
|---|---|
| **Overview** — Security score, MFA gaps, department chart | ![Overview](./Docs/screenshots/dashboard/01-overview.png) |
| **MFA gap drill-down** — click any bar to see the exact users | ![MFA drilldown](./Docs/screenshots/dashboard/02-mfa-drilldown.png) |
| **Compounded risk metric** — no MFA + never signed in, cross-referenced | ![At risk users](./Docs/screenshots/dashboard/03-at-risk.png) |
| **Employee directory** — searchable by name or department | ![Directory](./Docs/screenshots/dashboard/04-directory.png) |
| **Notifications** — generated live from the same data, read/unread state | ![Notifications](./Docs/screenshots/dashboard/05-notifications.png) |

<details>
<summary><strong>Setup & automation screenshots</strong> (PowerShell scripts, Azure app registration, API — click to expand)</summary>

| | |
|---|---|
| Bulk user creation via `Create-Users.ps1` | ![Bulk users](./Docs/screenshots/setup/01-bulk-users.png) |
| All users listed in Microsoft 365 Admin Center | ![Admin center users](./Docs/screenshots/setup/02-admin-center-users.png) |
| Azure App Registration overview | ![App registration](./Docs/screenshots/setup/03-app-registration.png) |
| API permissions before admin consent | ![API permissions pending](./Docs/screenshots/setup/04-api-permissions-pending.png) |
| API permissions after admin consent granted | ![API permissions granted](./Docs/screenshots/setup/05-api-permissions-granted.png) |
| `Get-MFAStatus.ps1` output | ![MFA status script](./Docs/screenshots/setup/06-mfa-status-script.png) |
| `Get-ServiceHealth.ps1` output | ![Service health script](./Docs/screenshots/setup/07-service-health-script.png) |
| `Get-InactiveUsers.ps1` output | ![Inactive users script](./Docs/screenshots/setup/08-inactive-users-script.png) |
| `Export-LicenseReport.ps1` output | ![License report script](./Docs/screenshots/setup/09-license-report-script.png) |
| FastAPI backend running (`uvicorn`) | ![FastAPI terminal](./Docs/screenshots/setup/10-fastapi-terminal.png) |
| API root endpoint responding | ![API root response](./Docs/screenshots/setup/11-api-root-response.png) |
| Live MFA data returned as raw JSON | ![API MFA response](./Docs/screenshots/setup/12-api-mfa-response.png) |
| `/docs` Swagger API documentation | ![API docs](./Docs/screenshots/setup/13-api-docs.png) |

</details>

## Design & iteration

This wasn't a single build — the interface went through several rounds of correction before it was worth showing anyone. Early versions had inconsistent card sizing, metrics duplicated across two sections for no reason, and numbers like "2 of 3" with no way to see who the 2 actually were. Coming from building the Manufacturing Quality Dashboard in Power BI, where card alignment, avoiding redundant visuals, and giving people a path from summary number to underlying detail decide whether a dashboard gets used or ignored, I pushed each pass toward:

- Removing duplicated metrics (Statistics originally just repeated MFA Coverage and License Usage shown elsewhere — replaced with two signals that don't exist anywhere else on the dashboard: Inactivity Rate, and a compounded "At Risk Users" metric built by cross-referencing MFA and inactivity data)
- Click-to-drill-down on every bar and chart point, so a number is never a dead end
- Consistent grid alignment across every card and section
- A security score whose composition is traceable, not a black-box number

The PowerShell automation, Graph API queries, FastAPI backend, and the overall system design are my own work. For the React frontend implementation, I worked with Claude (Anthropic's AI assistant) as a coding tool, directing the layout, interaction design, and visual structure through multiple correction cycles, then had a couple of IT professional colleagues review the working build, who suggested a few minor JavaScript refinements before calling it production ready. Without the dashboarding judgment from the Power BI work behind it, this would have shipped as a flat, generic layout — the placement, hierarchy, and drill-down structure are what turned it into something people would actually want to use.

## Lessons learned

- Cross-referencing two datasets (MFA status × inactivity) surfaces risk that neither report shows alone, and is a better security signal than either metric individually
- Admin/service accounts frequently lack a Department attribute in Entra ID — worth handling explicitly (an "Unassigned" bucket) rather than letting those users silently disappear from department-level views
- A dashboard's numbers need to always be traceable to the underlying record; a percentage or count with no drill-down is a dead end for anyone actually trying to act on it

## Conditional Access Lab

As a natural extension of the dashboard — which surfaces MFA gaps and inactive accounts — three Conditional Access policies were configured in the same tenant to enforce the controls the dashboard was reporting on.

### Policies implemented

| Policy | ID | State | Purpose |
|--------|----|-------|---------|
| Require MFA for All Users | KAG-CA-001 | Report only | Enforces MFA on every sign-in across all cloud apps |
| Block Legacy Authentication | KAG-CA-002 | Report only | Blocks SMTP, IMAP, POP3, Exchange ActiveSync — protocols that bypass MFA entirely |
| Require Compliant Device | KAG-CA-003 | Report only | Restricts access to Intune-enrolled, policy-compliant devices only |

All three policies were implemented in Report only mode — meaning they log what would have been blocked without enforcing it — following Microsoft's recommended rollout approach of monitoring impact before enabling enforcement.

Security defaults were disabled prior to policy creation, as Conditional Access and security defaults cannot run simultaneously in the same tenant.

### CA Policy audit script

`Scripts/Security/Get-CAPolicy-Report.ps1` queries all Conditional Access policies in the tenant via Microsoft Graph and exports a CSV audit report — useful for compliance documentation and change tracking.

```powershell
# Requires Policy.Read.All application permission
Get-MgIdentityConditionalAccessPolicy
```

### Screenshots

| | |
|---|---|
| Security defaults disabled | ![Security defaults](./Docs/screenshots/conditional-access/CA_SecurityDefaults_Disabled.png) |
| KAG-CA-001 Require MFA — policy overview | ![CA-001](./Docs/screenshots/conditional-access/CA-001-Require-MFA/CA_001_05_PolicyOverview.png) |
| KAG-CA-002 Block Legacy Auth — client apps condition | ![CA-002](./Docs/screenshots/conditional-access/CA-002-Block-Legacy-Auth/CA_002_04_ClientAppsCondition.png) |
| KAG-CA-003 Require Compliant Device — grant control | ![CA-003](./Docs/screenshots/conditional-access/CA-003-Require-Compliant-Device/CA_003_04_GrantControl.png) |
| All 3 policies visible in tenant | ![All policies](./Docs/screenshots/conditional-access/CA-002-Block-Legacy-Auth/CA_002_07_PolicyCreated.png) |
| PowerShell CA policy audit report | ![CA audit](./Docs/screenshots/conditional-access/CA_PolicyReport_PowerShell.png) |

## HR Provisioning Pipeline

Built as the operational complement to the dashboard and Conditional Access lab — once security policies are enforced, user lifecycle management needs to be equally automated. Two scripts handle the complete joiner/leaver process against the same tenant.

### What it automates

**Onboarding (`Scripts/HRProvisioning/Invoke-Onboarding.ps1`)**
Reads a CSV of new starters and for each one:
- Checks if the account already exists — skips duplicates gracefully
- Creates the user in Entra ID with correct attributes
- Assigns a Microsoft 365 Business Premium license
- Adds to the correct department security group (IT-Staff, Finance-Staff etc)
- Sends a formatted HTML welcome email via Microsoft Graph
- Logs every action to a timestamped CSV audit file

**Offboarding (`Scripts/HRProvisioning/Invoke-Offboarding.ps1`)**
Reads a CSV of leavers and for each one:
- Revokes all active sessions immediately — user is locked out instantly
- Disables the account — blocks any further sign-in attempts
- Removes all assigned licenses — frees them for reuse
- Removes from all security groups
- Logs every action to a timestamped CSV audit file

### Security groups created

Nine department groups were created in Entra ID to support automatic group assignment during onboarding:
`IT-Staff` · `Finance-Staff` · `HR-Staff` · `Sales-Staff` · `Engineering-Staff` · `Operations-Staff` · `Marketing-Staff` · `Legal-Staff` · `Analytics-Staff`

### Graph API permissions used

`User.ReadWrite.All` · `Group.ReadWrite.All` · `Organization.Read.All` · `Mail.Send`

### Screenshots

| | |
|---|---|
| 9 department security groups created in Entra ID | ![Groups created](./Docs/screenshots/hr-provisioning/HR_001_GroupsCreated.png) |
| Onboarding pipeline — both users created, licensed, grouped, emailed | ![Onboarding complete](./Docs/screenshots/hr-provisioning/HR_002_OnboardingComplete.png) |
| Welcome emails delivered to manager inbox | ![Welcome emails](./Docs/screenshots/hr-provisioning/HR_003_WelcomeEmails.png) |
| New users visible in M365 Admin Center with licenses | ![Admin center](./Docs/screenshots/hr-provisioning/HR_004_UsersInAdminCenter.png) |
| Onboarding audit log exported to CSV | ![Onboarding log](./Docs/screenshots/hr-provisioning/HR_005_OnboardingLog.png) |
| Offboarding pipeline — sessions revoked, accounts disabled, licenses removed | ![Offboarding complete](./Docs/screenshots/hr-provisioning/HR_008_OffboardingComplete.png) |
| Users showing as unlicensed in Admin Center after offboarding | ![Users disabled](./Docs/screenshots/hr-provisioning/HR_009_UsersDisabled.png) |
| Offboarding audit log exported to CSV | ![Offboarding log](./Docs/screenshots/hr-provisioning/HR_010_OffboardingLog.png) |

## Known limitations

- Trial tenant data — MFA and inactivity distributions reflect a small seeded user set, not a real organization
- Service health currently checks a defined list of core M365 services rather than the full catalog
