# Adania Client

The macOS desktop app an org member runs to host their assigned **Desktop-app** agents. It signs you in
(Cognito), fetches the agents assigned to you, holds a reverse **WebSocket** to the Adania relay, and runs
each turn locally via the Claude Agent SDK — so events from Slack/Linear/GitHub are answered on your machine
without exposing any inbound port. Built with **Deno Desktop** (Next.js UI + Deno runtime in one binary).

## Install (one command)

```sh
./install.sh
```

It ensures Deno (canary — `deno desktop`), ensures pnpm, builds the UI, compiles the native `.app` into
`dist/AdaniaClient.app`, confirms the Keychain is usable, and opens the app. Re-run any time to rebuild.

**Prereqs it can't auto-install:** Node.js 18+ (https://nodejs.org), and you must be **logged into Claude
Code on this machine** — the local runner uses that ambient login to run turns.

## Using it

1. **Sign in with Cognito** → the app shows your organizations, lets you pick one, and lists that org's
   **web channels** (the Desktop-app agents assigned to you).
2. Keep the app open — it holds the reverse-WS connection. The status row shows **Relay: connected**.
3. An org admin assigns you to a Desktop-app agent in the portal (`app.adania.johneubank.ai` → the agent's
   **Configure** page). When that agent is @-mentioned on its channel, the event routes through the Adania
   relay to your app, runs locally, and the reply is posted back as the agent. Undeliverable events are
   logged on the agent's **Missed events** page (with Retry).

## How it works

- **Auth:** Cognito Authorization-Code + PKCE (public desktop client, no secret). The id_token is
  JWKS/RS256-verified; the session token is stored in the macOS **Keychain** (0600-file fallback).
- **Transport:** the app dials `wss://app.adania.johneubank.ai/api/relay/ws` (the relay-gw), authenticates
  with a hello frame, receives `event` frames, runs them via the Agent SDK, and returns `reply` frames.
  The channel webhook is member-agnostic (points at the relay), so swapping the assignee needs no changes.
- **Config fetch:** `GET /api/bots` returns your orgs, your assigned agents + their AgentConfig, and the
  relay URL — no agent secrets ever reach the client.

## Layout

```
app/         the Deno Desktop app (Next.js: UI + lib/agent-node.ts reverse-WS node + OAuth)
install.sh   one-command macOS install/build/launch
dist/        built .app (gitignored)
```
