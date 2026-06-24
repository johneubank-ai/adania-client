import Status from "./status";
import { signIn, signOut } from "./actions";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 28 }}>
      <h1 style={{ marginBottom: 4 }}>
        Adania Client <span style={{ fontSize: 13, color: "#7f8db0" }}>next.js · live</span>
      </h1>
      <p style={{ color: "#9fb0d8", marginTop: 0 }}>
        Cognito (PKCE) login + background reverse-WS + agent runner, in one Deno Desktop app.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <form action={signIn}>
          <button style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #2b3a64", background: "#16203c", color: "#e7ecff", cursor: "pointer" }}>
            Sign in with Cognito
          </button>
        </form>
        <form action={signOut}>
          <button style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #2b3a64", background: "transparent", color: "#9fb0d8", cursor: "pointer" }}>
            Sign out
          </button>
        </form>
      </div>
      <Status />
    </main>
  );
}
