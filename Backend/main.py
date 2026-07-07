# =============================================
# KAG SecOps Dashboard — FastAPI Backend
# Created by: Aman Kag
# Date: July 2026
# Description: Serves M365 security data as
#              JSON for the React dashboard
# =============================================

import csv
import os
import subprocess

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PWSH_PATH = "/usr/local/microsoft/powershell/7-preview/pwsh"
BASE_DIR = os.path.expanduser("~/Documents/KAGSecOps")

SCRIPTS = {
    "mfa": f"{BASE_DIR}/Scripts/Security/Get-MFAStatus.ps1",
    "license": f"{BASE_DIR}/Scripts/Security/Export-LicenseReport.ps1",
    "inactive": f"{BASE_DIR}/Scripts/Security/Get-InactiveUsers.ps1",
    "servicehealth": f"{BASE_DIR}/Scripts/Security/Get-ServiceHealth.ps1",
}

CSV_PATHS = {
    "mfa": f"{BASE_DIR}/Docs/MFA-Report.csv",
    "license": f"{BASE_DIR}/Docs/License-Report.csv",
    "inactive": f"{BASE_DIR}/Docs/Inactive-Users-Report.csv",
    "servicehealth": f"{BASE_DIR}/Docs/ServiceHealth-Report.csv",
}

# Maps the raw Graph API status string (as exported in the CSV) to the
# label + colour category the frontend already expects.
SERVICE_STATUS_MAP = {
    "serviceOperational": "serviceOperational",
    "serviceDegradation": "serviceDegradation",
    "serviceInterruption": "serviceInterruption",
    "serviceRestored": "serviceOperational",
}


def run_powershell(script_path: str):
    """Run a PowerShell script and raise if it fails, instead of failing silently."""
    result = subprocess.run(
        [PWSH_PATH, "-File", os.path.expanduser(script_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"PowerShell script failed ({script_path}): {result.stderr.strip()}",
        )
    return result.stdout


def read_csv(csv_path: str, key: str):
    """Read a report CSV, regenerating it first if missing."""
    if not os.path.exists(csv_path):
        run_powershell(SCRIPTS[key])

    if not os.path.exists(csv_path):
        # Script ran but still didn't produce the file
        raise HTTPException(
            status_code=502,
            detail=f"Expected report at {csv_path} was not created by {SCRIPTS[key]}",
        )

    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def last_modified(csv_path: str):
    if not os.path.exists(csv_path):
        return None
    return os.path.getmtime(csv_path)


@app.get("/")
def root():
    return {
        "status": "KAG SecOps Dashboard API Running",
        "reports": {
            key: {
                "path": path,
                "lastUpdated": last_modified(path),
            }
            for key, path in CSV_PATHS.items()
        },
    }


@app.get("/api/mfa-status")
def get_mfa_status():
    users = read_csv(CSV_PATHS["mfa"], "mfa")

    total = len(users)
    enabled = len([u for u in users if u["MFAStatus"] == "Enabled"])
    not_registered = total - enabled

    return {
        "total": total,
        "enabled": enabled,
        "notRegistered": not_registered,
        "coveragePercent": round((enabled / total) * 100, 1) if total > 0 else 0,
        "users": users,
    }


@app.get("/api/license-report")
def get_license_report():
    users = read_csv(CSV_PATHS["license"], "license")

    total = len(users)
    licensed = len([u for u in users if u["LicenseStatus"] == "Licensed"])

    return {
        "total": total,
        "licensed": licensed,
        "unlicensed": total - licensed,
        "users": users,
    }


@app.get("/api/inactive-users")
def get_inactive_users():
    users = read_csv(CSV_PATHS["inactive"], "inactive")

    return {
        "total": len(users),
        "users": users,
    }


@app.get("/api/service-health")
def get_service_health():
    rows = read_csv(CSV_PATHS["servicehealth"], "servicehealth")

    services = [
        {
            "service": row["Service"],
            "status": SERVICE_STATUS_MAP.get(row["Status"], row["Status"]),
        }
        for row in rows
    ]

    degraded = len([s for s in services if s["status"] != "serviceOperational"])

    return {
        "total": len(services),
        "degraded": degraded,
        "services": services,
    }


@app.post("/api/refresh")
def refresh_all():
    """Force-regenerate every CSV report by re-running the PowerShell scripts."""
    results = {}
    for key, script_path in SCRIPTS.items():
        run_powershell(script_path)
        results[key] = {
            "regenerated": True,
            "lastUpdated": last_modified(CSV_PATHS[key]),
        }
    return {"status": "refreshed", "reports": results}