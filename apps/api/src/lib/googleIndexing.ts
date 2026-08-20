/**
 * Google Instant Indexing API Client (v3)
 * Edge-compatible (Cloudflare Workers Web Crypto RS256 JWT Assertion)
 * 100% Free - Automatically requests Google to crawl & index updated/new URLs.
 */

function base64UrlEncode(str: string | Uint8Array): string {
  const bytes = typeof str === 'string' ? new TextEncoder().encode(str) : str;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToBinary(pem: string): Uint8Array {
  const cleanPem = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const binaryString = atob(cleanPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

/**
 * Generates an OAuth2 access token for Google Indexing API using Web Crypto API (RS256)
 */
export async function getGoogleIndexingAccessToken(credentials: GoogleServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  // Import PKCS8 private key
  const binaryKey = pemToBinary(credentials.private_key);
  const keyBuffer = binaryKey.buffer.slice(
    binaryKey.byteOffset,
    binaryKey.byteOffset + binaryKey.byteLength
  ) as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataToSign);
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  // Exchange JWT for Google OAuth Access Token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google OAuth Token Exchange Failed (${tokenResponse.status}): ${errorText}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };
  return tokenData.access_token;
}

export type IndexingNotificationType = 'URL_UPDATED' | 'URL_DELETED';

export interface IndexingResult {
  url: string;
  type: IndexingNotificationType;
  status: 'submitted' | 'failed';
  response?: any;
  error?: string;
}

/**
 * Publishes a URL notification to Google Indexing API
 */
export async function submitUrlForGoogleIndexing(
  url: string,
  type: IndexingNotificationType = 'URL_UPDATED',
  credentials?: GoogleServiceAccountCredentials
): Promise<IndexingResult> {
  if (!credentials?.client_email || !credentials?.private_key) {
    return {
      url,
      type,
      status: 'failed',
      error: 'Google Service Account credentials not provided (GCP_SERVICE_ACCOUNT_KEY missing)',
    };
  }

  try {
    const token = await getGoogleIndexingAccessToken(credentials);

    const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url,
        type,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        url,
        type,
        status: 'failed',
        error: `Google Indexing API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      url,
      type,
      status: 'submitted',
      response: data,
    };
  } catch (err: any) {
    return {
      url,
      type,
      status: 'failed',
      error: err.message,
    };
  }
}
