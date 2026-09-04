"""
LinkedIn Company & Organization Publisher — Opus Overseas
Supports publishing text, link, and image posts to the Opus Overseas LinkedIn Company Page.
"""

import json
import os
import requests
import sys

TOKENS_FILE = os.path.join(os.path.dirname(__file__), "linkedin_company_tokens.json")

def load_company_tokens():
    if not os.path.exists(TOKENS_FILE):
        raise FileNotFoundError(f"Tokens file not found at: {TOKENS_FILE}. Run linkedin_company_auth.py first.")
    with open(TOKENS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def get_target_author():
    data = load_company_tokens()
    orgs = data.get("organizations", {}).get("elements", [])
    if orgs:
        # Select first active organization
        target_org = orgs[0].get("organizationalTarget")
        print(f"[TARGET] Publishing to Organization: {target_org}")
        return target_org
    else:
        # Fallback to person
        person_urn = f"urn:li:person:{data['user_info']['sub']}"
        print(f"[TARGET] No Organization URN found in token. Publishing to Member: {person_urn}")
        return person_urn

def publish_company_text_post(text_content):
    data = load_company_tokens()
    access_token = data["access_token"]
    author_urn = get_target_author()

    url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    payload = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": text_content
                },
                "shareMediaCategory": "NONE"
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code in [200, 201]:
        res_json = resp.json()
        print(f"[SUCCESS] Post published successfully to {author_urn}!")
        print(f"Post ID: {res_json.get('id')}")
        return res_json
    else:
        print(f"[ERROR] Failed to publish post ({resp.status_code}):")
        print(resp.text)
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
        publish_company_text_post(text)
    else:
        print("Usage: python3 scripts/linkedin_company_publisher.py \"Your company update here\"")
