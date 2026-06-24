import { startAgentNode } from "../../../lib/agent-node";
import { readState } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  startAgentNode(); // idempotent; binds the loopback listener + reverse-WS once
  const { pkceVerifier, ...safe } = await readState(); // don't leak the PKCE verifier to the UI
  return Response.json(safe);
}
