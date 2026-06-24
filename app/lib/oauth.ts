// Cognito Authorization-Code + PKCE for a native/desktop client (public client, no secret).
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
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

// JWKS RS256 verification of the Cognito id_token (replaces decode-only). Fetches the pool's JWKS, matches
// kid, verifies the signature, and checks iss + aud + exp. Throws on any failure. Returns the claims.
let _jwks: { keys: any[]; at: number } | null = null;
async function jwks(): Promise<any[]> {
  if (_jwks && Date.now() - _jwks.at < 3_600_000) return _jwks.keys;
  const r = await fetch(`${COGNITO.issuer}/.well-known/jwks.json`);
  if (!r.ok) throw new Error(`jwks fetch ${r.status}`);
  const j = (await r.json()) as { keys: any[] };
  _jwks = { keys: j.keys ?? [], at: Date.now() };
  return _jwks.keys;
}
export async function verifyIdToken(idToken: string): Promise<Record<string, unknown>> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new Error("unexpected alg");
  const jwk = (await jwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("no matching signing key");
  const pub = createPublicKey({ key: jwk, format: "jwk" });
  const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), pub, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp) throw new Error("expired");
  if (payload.iss !== COGNITO.issuer) throw new Error("issuer mismatch");
  if (payload.aud && payload.aud !== COGNITO.clientId) throw new Error("audience mismatch");
  return payload;
}

export function emailFromIdToken(idToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return payload.email ?? payload["cognito:username"] ?? "unknown";
  } catch {
    return "unknown";
  }
}
