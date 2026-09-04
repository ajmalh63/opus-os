import urllib.parse
import json
import os
import requests
import sys

CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "YOUR_LINKEDIN_CLIENT_ID")
CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "YOUR_LINKEDIN_CLIENT_SECRET")
REDIRECT_URI = "https://www.opusoverseas.com/"
SCOPES = ["openid", "profile", "w_member_social", "email"]

STATE = "opus_secure_auth_state_2026"

def get_authorization_url():
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "state": STATE,
        "scope": " ".join(SCOPES),
    }
    url = f"https://www.linkedin.com/oauth/v2/authorization?{urllib.parse.urlencode(params)}"
    return url

def exchange_code_for_token(code):
    # Strip any trailing characters or query string if full URL was pasted
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
        print("\n[SUCCESS] Access token obtained successfully!")
        print(f"Token TTL: {expires_in} seconds (~{int(expires_in)//86400} days)")

        # Verify token by fetching user profile
        user_info = get_user_profile(access_token)

        # Save credentials to json
        save_path = os.path.join(os.path.dirname(__file__), "linkedin_tokens.json")
        save_data = {
            "client_id": CLIENT_ID,
            "access_token": access_token,
            "expires_in": expires_in,
            "scope": token_data.get("scope"),
            "user_info": user_info,
        }
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, indent=2)
        print(f"[SAVED] Saved tokens and user profile to: {save_path}")
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
        print("\n--- Verified LinkedIn Profile ---")
        print(f"Name: {info.get('name')}")
        print(f"Email: {info.get('email')}")
        print(f"User URN (sub): {info.get('sub')}")
        return info
    else:
        print(f"[WARNING] Could not fetch user profile: {resp.status_code} {resp.text}")
        return {}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        code_input = sys.argv[1]
        exchange_code_for_token(code_input)
    else:
        print("=" * 70)
        print("LinkedIn OAuth 2.0 Authenticator — Opus Overseas")
        print("=" * 70)
        print("\nStep 1: Open this URL in your browser:\n")
        print(get_authorization_url())
        print("\n" + "=" * 70)
        print("Step 2: Sign in and click 'Allow'.")
        print("Step 3: LinkedIn will redirect to https://www.opusoverseas.com/?code=AQ...&state=...")
        print("Step 4: Copy that entire redirected URL or just the code value and run:")
        print(r"python 'E:\Opus OS\scripts\linkedin_auth.py' <PASTED_CODE_OR_URL>")
