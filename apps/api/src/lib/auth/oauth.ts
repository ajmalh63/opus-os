/**
 * Native WebCrypto OAuth 2.0 PKCE Engine (RFC 7636)
 * Zero external dependencies: pure Edge-native PKCE authentication for Google & Microsoft 365.
 */

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'microsoft';
}

/**
 * Generates a cryptographically secure 43-128 character PKCE code verifier.
 */
export function generateCodeVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Generates an RFC 7636 S256 code challenge from a code verifier.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates a random state token to protect against CSRF attacks.
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds Google OAuth 2.0 Authorization URL with PKCE
 */
export function getGoogleAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scope: string = 'openid email profile'
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code with Google for tokens and user profile
 */
export async function exchangeGoogleCode(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ accessToken: string; userInfo: OAuthUserInfo }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${err}`);
  }

  const tokenData = (await tokenRes.json()) as any;
  const accessToken = tokenData.access_token;

  // Retrieve user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    throw new Error(`Google userinfo request failed: HTTP ${userRes.status}`);
  }

  const userData = (await userRes.json()) as any;

  return {
    accessToken,
    userInfo: {
      id: userData.sub,
      email: userData.email.toLowerCase(),
      name: userData.name || userData.email.split('@')[0],
      picture: userData.picture,
      provider: 'google',
    },
  };
}

/**
 * Builds Microsoft 365 / Entra ID Authorization URL with PKCE
 */
export function getMicrosoftAuthorizationUrl(
  clientId: string,
  tenantId: string = 'common',
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scope: string = 'openid email profile offline_access User.Read'
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code with Microsoft for tokens and user profile
 */
export async function exchangeMicrosoftCode(
  clientId: string,
  clientSecret: string,
  tenantId: string = 'common',
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ accessToken: string; userInfo: OAuthUserInfo }> {
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Microsoft token exchange failed (${tokenRes.status}): ${err}`);
  }

  const tokenData = (await tokenRes.json()) as any;
  const accessToken = tokenData.access_token;

  // Retrieve user info from Microsoft Graph
  const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!graphRes.ok) {
    throw new Error(`Microsoft Graph request failed: HTTP ${graphRes.status}`);
  }

  const graphData = (await graphRes.json()) as any;

  return {
    accessToken,
    userInfo: {
      id: graphData.id,
      email: (graphData.mail || graphData.userPrincipalName || '').toLowerCase(),
      name: graphData.displayName || graphData.givenName || 'Microsoft User',
      provider: 'microsoft',
    },
  };
}
