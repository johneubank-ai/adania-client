"use client";
import { useEffect, useState } from "react";

type Org = { organizationId: string; organizationName: string; role: string };
type Bot = { id: string; name: string; organizationId: string; organizationName: string; channels: string[]; config?: { model?: string } | null };
type State = {
  login?: string; email?: string; socket?: string; turns?: number; lastReply?: string;
  orgsJson?: string; botsJson?: string;
};

function parse<T>(s: string | undefined): T[] {
  try { return JSON.parse(s ?? "[]"); } catch { return []; }
}

export default function Status() {
  const [s, setS] = useState<State>({});
  const [org, setOrg] = useState<string | null>(null);
  useEffect(() => {
    const tick = async () => {
      try { setS(await (await fetch("/api/state", { cache: "no-store" })).json()); } catch {}
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  const orgs = parse<Org>(s.orgsJson);
  const bots = parse<Bot>(s.botsJson);
  const selected = org ?? orgs[0]?.organizationId ?? null;
  const orgBots = bots.filter((b) => b.organizationId === selected);

  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, marginTop: 16 }}>
        <tbody>
          {([["Login", s.login], ["Account", s.email], ["Relay", s.socket], ["Turns handled", String(s.turns ?? 0)], ["Last reply", s.lastReply]] as [string, string | undefined][]).map(([k, v]) => {
            const green = (k === "Relay" && v === "connected") || (k === "Login" && v === "signed in");
            return (
              <tr key={k}>
                <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", color: "#9fb0d8", whiteSpace: "nowrap" }}>{k}</td>
                <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", fontFamily: "ui-monospace,monospace", color: green ? "#4ade80" : undefined }}>{String(v ?? "…")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {orgs.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 8 }}>Your organizations</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {orgs.map((o) => (
              <button
                key={o.organizationId}
                onClick={() => setOrg(o.organizationId)}
                style={{
                  padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                  border: o.organizationId === selected ? "1px solid #4ade80" : "1px solid #2b3a64",
                  background: o.organizationId === selected ? "#16203c" : "transparent",
                  color: "#e7ecff",
                }}
              >
                {o.organizationName} <span style={{ color: "#7f8db0" }}>· {o.role}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Web channels {orgs.find((o) => o.organizationId === selected)?.organizationName ? `— ${orgs.find((o) => o.organizationId === selected)?.organizationName}` : ""}</h3>
          {orgBots.length === 0 ? (
            <p style={{ color: "#9fb0d8", fontSize: 13 }}>No Desktop-app bots assigned to you in this org yet.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead><tr>{["agent", "channels", "model"].map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #2b3a64", padding: "6px 10px", color: "#9fb0d8" }}>{h}</th>)}</tr></thead>
              <tbody>
                {orgBots.map((b) => (
                  <tr key={b.id}>
                    <td style={cell}>{b.name}</td>
                    <td style={cell}>{(b.channels ?? []).join(", ") || "—"}</td>
                    <td style={cell}><code>{b.config?.model ?? "—"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
const cell = { padding: "6px 10px", borderBottom: "1px solid #1d2742", fontFamily: "ui-monospace,monospace" } as const;
