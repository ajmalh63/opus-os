import urllib.parse
import json
import os
import requests
import sys

CLIENT_ID = os.getenv("LINKEDIN_COMPANY_CLIENT_ID", "YOUR_LINKEDIN_COMPANY_CLIENT_ID")
CLIENT_SECRET = os.getenv("LINKEDIN_COMPANY_CLIENT_SECRET", "YOUR_LINKEDIN_COMPANY_CLIENT_SECRET")
REDIRECT_URI = "https://www.opusoverseas.com/"

# Standard Organization and Community Management API Scopes
SCOPES = [
    "openid",
    "profile",
    "email",
    "w_member_social",
    "w_organization_social",
    "r_organization_social",
    "rw_organization_admin"
]

# Fallback scopes if Community Management API is still pending approval
MEMBER_SCOPES = [
    "openid",
    "profile",
    "email",
    "w_member_social"
]

STATE = "opus_company_auth_state_2026"

def get_authorization_url(use_org_scopes=True):
    scopes_to_use = SCOPES if use_org_scopes else MEMBER_SCOPES
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "state": STATE,
        "scope": " ".join(scopes_to_use),
    }
    url = f"https://www.linkedin.com/oauth/v2/authorization?{urllib.parse.urlencode(params)}"
    return url

def exchange_code_for_token(code):
    code = code.strip()
    if "code=" in code:
        parsed = urllib.parse.urlparse(code)
        query_params = urllib.parse.parse_qs(parsed.query)
        if "code" in query_params:
            code = query_params["code"][0]

    token_url = "https://www.linkedin.com/oauth/v2/accessToken"
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    response = requests.post(token_url, data=payload, headers=headers)
    if response.status_code == 200:
        token_data = response.json()
        access_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in")
        granted_scope = token_data.get("scope", "")
        print("\n[SUCCESS] Access token obtained for App 2 (Company App)!")
        print(f"Token TTL: {expires_in} seconds (~{int(expires_in)//86400} days)")
        print(f"Granted Scopes: {granted_scope}")

        user_info = get_user_profile(access_token)
        orgs_info = get_accessible_organizations(access_token)

        save_path = os.path.join(os.path.dirname(__file__), "linkedin_company_tokens.json")
        save_data = {
            "client_id": CLIENT_ID,
            "access_token": access_token,
            "expires_in": expires_in,
            "scope": granted_scope,
            "user_info": user_info,
            "organizations": orgs_info
        }
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, indent=2)
        print(f"[SAVED] Saved tokens and organization profiles to: {save_path}")
        return token_data
    else:
        print(f"\n[ERROR] Failed to exchange code ({response.status_code}):")
        print(response.text)
        return None

def get_user_profile(access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get("https://api.linkedin.com/v2/userinfo", headers=headers)
    if resp.status_code == 200:
        info = resp.json()
        print("\n--- Verified User Profile ---")
        print(f"Name: {info.get('name')}")
        print(f"Email: {info.get('email')}")
        print(f"User URN: {info.get('sub')}")
        return info
    else:
        print(f"[WARNING] Could not fetch user profile: {resp.status_code} {resp.text}")
        return {}

def get_accessible_organizations(access_token):
    headers = {
        "Authorization": f"Bearer {access_token}",
        "X-Restli-Protocol-Version": "2.0.0"
    }
    url = "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee"
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        org_data = resp.json()
        print("\n--- Accessible LinkedIn Organization / Company Pages ---")
        elements = org_data.get("elements", [])
        print(f"Total Organization Entities Found: {len(elements)}")
        for el in elements:
            org_urn = el.get("organizationalTarget")
            role = el.get("role")
            state = el.get("state")
            print(f" -> Organization URN: {org_urn} | Role: {role} | State: {state}")
        return org_data
    else:
        print(f"\n[INFO] Organizational Entity ACL check returned {resp.status_code}: {resp.text}")
        return {"status": resp.status_code, "error": resp.text}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        code_input = sys.argv[1]
        exchange_code_for_token(code_input)
    else:
        print("=" * 75)
        print("LinkedIn Company & Organization App Authenticator — Opus Overseas")
        print(f"App Client ID: {CLIENT_ID}")
        print("=" * 75)
        print("\nOption A: Authorization URL (With Full Organization Scopes):")
        print(get_authorization_url(use_org_scopes=True))
        print("\nOption B: Authorization URL (Fallback Member Scopes):")
        print(get_authorization_url(use_org_scopes=False))
        print("\n" + "=" * 75)
        print("Instructions:")
        print("1. Open Option A in your browser and click 'Allow'.")
        print("2. When redirected to https://www.opusoverseas.com/?code=AQ... copy the code.")
        print("3. Run: python3 'scripts/linkedin_company_auth.py' <PASTED_CODE_OR_URL>")
