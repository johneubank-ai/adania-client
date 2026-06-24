import { counter } from "../lib/counter";
import { bump } from "./actions";

export const dynamic = "force-dynamic"; // always re-render so the Server Action result shows

export default function Page() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 28 }}>
      <h1>Next.js on Deno Desktop</h1>
      <p style={{ color: "#9fb0d8" }}>App Router + React Server Components + a <code>use server</code> Server Action.</p>
      <p style={{ fontSize: 20 }}>
        Server Action count: <b style={{ color: "#4ade80", fontFamily: "ui-monospace,monospace" }}>{counter.n}</b>
      </p>
      <form action={bump}>
        <button style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #2b3a64", background: "#16203c", color: "#e7ecff", cursor: "pointer" }}>
          Bump (runs a `use server` action)
        </button>
      </form>
    </main>
  );
}
