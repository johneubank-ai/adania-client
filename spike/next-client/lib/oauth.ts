// Cognito Authorization-Code + PKCE for a native/desktop client (public client, no secret).
import { randomBytes, createHash } from "node:crypto";
import { COGNITO } from "./config";

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function genPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(challenge: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO.clientId,
    redirect_uri: COGNITO.redirectUri,
    scope: COGNITO.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://${COGNITO.domain}/oauth2/authorize?${p.toString()}`;
}

export async function exchangeCode(code: string, verifier: string): Promise<any> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO.clientId,
    code,
    redirect_uri: COGNITO.redirectUri,
    code_verifier: verifier,
  });
  const r = await fetch(`https://${COGNITO.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`token exchange failed ${r.status}: ${await r.text()}`);
  return await r.json();
}

export function emailFromIdToken(idToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return payload.email ?? payload["cognito:username"] ?? "unknown";
  } catch {
    return "unknown";
  }
}
