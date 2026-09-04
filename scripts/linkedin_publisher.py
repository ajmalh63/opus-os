"""
LinkedIn Publishing Tool — Opus Overseas
Supports publishing text and rich image posts to LinkedIn.
"""

import json
import os
import requests
import sys

TOKENS_FILE = os.path.join(os.path.dirname(__file__), "linkedin_tokens.json")

def load_token_data():
    if not os.path.exists(TOKENS_FILE):
        raise FileNotFoundError(f"Tokens file not found at: {TOKENS_FILE}. Please authenticate first.")
    with open(TOKENS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def publish_text_post(text_content):
    """
    Publishes a text post to the authenticated member profile.
    """
    token_data = load_token_data()
    access_token = token_data["access_token"]
    user_urn = f"urn:li:person:{token_data['user_info']['sub']}"

    url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    payload = {
        "author": user_urn,
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
        post_id = res_json.get("id")
        print(f"[SUCCESS] Post published successfully!")
        print(f"Post ID: {post_id}")
        return res_json
    else:
        print(f"[ERROR] Failed to publish post ({resp.status_code}):")
        print(resp.text)
        return None

def upload_image(image_path):
    """
    Registers and uploads an image to LinkedIn asset storage.
    Returns the asset URN.
    """
    token_data = load_token_data()
    access_token = token_data["access_token"]
    user_urn = f"urn:li:person:{token_data['user_info']['sub']}"

    # Step 1: Register upload
    register_url = "https://api.linkedin.com/v2/assets?action=registerUpload"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }
    register_payload = {
        "registerUploadRequest": {
            "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
            "owner": user_urn,
            "serviceRelationships": [
                {
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent"
                }
            ]
        }
    }
    r = requests.post(register_url, headers=headers, json=register_payload)
    if r.status_code not in [200, 201]:
        print(f"[ERROR] Failed to register image upload: {r.status_code} {r.text}")
        return None

    reg_data = r.json()["value"]
    upload_url = reg_data["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]["uploadUrl"]
    asset_urn = reg_data["asset"]

    # Step 2: Upload binary
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    upload_headers = {"Authorization": f"Bearer {access_token}"}
    up_resp = requests.put(upload_url, data=img_bytes, headers=upload_headers)
    if up_resp.status_code in [200, 201]:
        print(f"[SUCCESS] Image uploaded successfully to LinkedIn asset: {asset_urn}")
        return asset_urn
    else:
        print(f"[ERROR] Binary upload failed: {up_resp.status_code} {up_resp.text}")
        return None

def publish_image_post(text_content, image_path):
    """
    Publishes a post with an attached image.
    """
    if not os.path.exists(image_path):
        print(f"[ERROR] Image file does not exist: {image_path}")
        return None

    asset_urn = upload_image(image_path)
    if not asset_urn:
        return None

    token_data = load_token_data()
    access_token = token_data["access_token"]
    user_urn = f"urn:li:person:{token_data['user_info']['sub']}"

    url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    payload = {
        "author": user_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": text_content
                },
                "shareMediaCategory": "IMAGE",
                "media": [
                    {
                        "status": "READY",
                        "description": {"text": "Opus Overseas Update"},
                        "media": asset_urn,
                        "title": {"text": "Opus Overseas"}
                    }
                ]
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code in [200, 201]:
        res_json = resp.json()
        print(f"[SUCCESS] Image post published successfully!")
        print(f"Post ID: {res_json.get('id')}")
        return res_json
    else:
        print(f"[ERROR] Failed to publish image post ({resp.status_code}):")
        print(resp.text)
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        msg = sys.argv[1]
        publish_text_post(msg)
    else:
        print("Usage:")
        print("  python linkedin_publisher.py \"Your post text here\"")
