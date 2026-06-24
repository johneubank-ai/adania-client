// adania-customers-dev Cognito (us-east-1) + the dedicated PUBLIC desktop client (PKCE, no secret).
// All values here are non-secret (public client id + hosted-UI domain).
export const COGNITO = {
  domain: "adania-customers-660601648861.auth.us-east-1.amazoncognito.com",
  region: "us-east-1",
  poolId: "us-east-1_XinOnJ2F4",
  clientId: "1c05scns13a3nofh7tj7v6ccp9",
  redirectUri: "http://127.0.0.1:8976/callback",
  scope: "openid profile email",
};
export const CALLBACK_PORT = 8976;
export const GATEWAY_URL = process.env.GATEWAY_URL ?? "ws://localhost:8799";
export const HELLO_TOKEN = process.env.HELLO_TOKEN ?? "dev-secret";
export const APP_DIR = `${process.env.HOME ?? "/tmp"}/.adania-client`;
