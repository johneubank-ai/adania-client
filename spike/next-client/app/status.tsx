"use client";
import { useEffect, useState } from "react";

type State = Record<string, string | number>;
const ROWS: [string, string][] = [
  ["Runtime", "runtime"], ["Login", "login"], ["Account", "email"], ["Socket", "socket"],
  ["Turns handled", "turns"], ["Last event", "lastEvent"], ["Last reply", "lastReply"],
];

export default function Status() {
  const [s, setS] = useState<State>({});
  useEffect(() => {
    const tick = async () => {
      try { setS(await (await fetch("/api/state", { cache: "no-store" })).json()); } catch {}
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, marginTop: 16 }}>
      <tbody>
        {ROWS.map(([label, k]) => {
          const v = String(s[k] ?? "…");
          const green = (k === "socket" && v === "connected") || (k === "login" && v === "signed in");
          return (
            <tr key={k}>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", color: "#9fb0d8", whiteSpace: "nowrap" }}>{label}</td>
              <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", fontFamily: "ui-monospace,monospace", color: green ? "#4ade80" : undefined }}>{v}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
