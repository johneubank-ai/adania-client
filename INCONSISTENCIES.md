# adania-client / InterviewAssistant — inconsistencies & gaps

**Scope:** analysis only (no implementation). Cross-checked the brief + the two sequence diagrams against the local `adania` repo and current industry reality (Slack MCP, browser transcription). Grouped by area; each item says *what conflicts* and *why*.

> TL;DR — the **idea is sound and mostly buildable on what exists**, but five things in the brief don't line up with the current repo or with each other: (1) a "web" surface is structurally different from the 3 existing surfaces (app-less), (2) "send **as the interviewer**" needs a member Slack token the system throws away, (3) "configure the channel in the web UI" is an org-admin-only capability today but the interviewer is a member, (4) the "adania-resources repo on agent init" is ambiguous (whose org / whose token / why) and has no lifecycle hook, and (5) the detailed diagram's "Mac app, transcribe locally" contradicts the web-UI + transcription-service model you actually asked for.

---

## A. The two sequence diagrams disagree with each other (and with the brief)
1. **Mac app vs web UI.** The detailed diagram has `Mac App (Transcribe + UI)` doing `Transcribe locally (live)`. The brief + the minimal diagram you asked for have a **web UI with recording** + a **separate transcription service** actor. These are different architectures. The web confirms: in-browser local transcription (Whisper WASM/WebGPU, Web Speech API) is possible but heavy/inconsistent; the production-grade path streams audio to a **server-side** transcription service (OpenAI Realtime, Gladia, etc.). → The **minimal diagram is the consistent model**; drop "transcribe locally" if the client is a browser.
2. **Recording in a browser is fine; "live local transcription" in a browser is the weak point.** `MediaRecorder`/`getUserMedia` cover capture; transcription should be the dedicated service actor. Keep them separate (the minimal diagram already does).

## B. "web ui" surface ≠ the existing surface model (it's app-less)
3. **Every current surface is an external app + webhook + stored creds + install flow.** `Platform = "github" | "linear" | "slack"` (`lib/onboarding/types.ts:3`); per-surface app tables `web.{slack,linear,github_bot}_app`; per-surface webhook routes `app/api/{slack,linear,github}/webhook/[botId]`; install callbacks. A **"web" surface has none of these** — the adania-client is *inside* the org trust boundary (Cognito login) and talks to the runtime directly. So "add the web surface" is a **new *kind* of surface** (direct-API, no app/webhook/install), not just adding `"web"` to the enum.
4. **There is no authenticated per-bot session API for a web client.** `runBotTurn`/`bot_thread` are already surface-generic (a `surface="web"` + `threadKey=<uuid>` works), but the only session entrypoints today are the **demo** `POST /api/sessions` (no org, no auth) and `POST /api/sessions/[runId]/messages` (**no auth** — "know the runId = inject into the thread"). A web client needs: `POST /api/bots/[botId]/session` (org-membership-checked) + ownership-checked message append. Neither exists. (The internal `/api/bots/[botId]/message` is HMAC-signed for server-to-server, not a browser.)
5. **"not @'able on github/linear/slack" is consistent with web-only — but means no inbound ingress at all.** Fine, but then *every* trigger (start interview, append transcript, stop) must come from the authenticated web client; there's no webhook to lean on.

## C. "Send a Slack message **on behalf of the interviewer**" — the token isn't there
6. **A member's Slack token is *confirm-and-discard*.** Onboarding stores the **org-admin's** Slack **bot** token (`web.organization_oauth`, `lib/onboarding/flow.ts:138`); a **member** only gets a verified `user_identity` row — **no usable token** (`flow.ts:149` "members are confirm-and-discard"). The interviewer is explicitly a **member**, so there is no stored credential to post *as them*.
7. **So "on behalf of the interviewer" is currently impossible without new plumbing.** Two honest options:
   - **(a) Post as the org's Slack *bot*** (the stored org-admin bot token), with the interviewer's name in the text. Works today; it's "from the Adania bot", not literally the interviewer.
   - **(b) Capture the member's Slack *user* token** via a JIT OAuth (mirror the GitHub act-as-self vault — `web.user_oauth['slack']`, which is **never populated today**, GitHub-only) and a self-hosted Slack MCP authed by that per-member vault credential. This is the "really as the interviewer" path and is net-new.
8. **Slack's official MCP server (GA Feb 2026) doesn't dodge this.** It acts with the **connecting user's** Slack OAuth — same requirement as (b): you still need the interviewer's Slack auth. (A self-hosted `/api/mcp/slack` mirroring our `/api/mcp/github` is the cleaner fit with the per-user vault we already built.)
9. **"a channel configured in the web UI" has no home + needs channel discovery.** Existing surfaces derive the channel from the inbound event; a web-initiated post has none. Need a config store (`bot.config_overrides` or a new `bot_surface_config`) **and** a channel picker (needs the org Slack bot token + `channels:read`). Also: an org has **one** `slack_team_id` — if the interviewer is in a different workspace, the bot can't reach them (single-workspace-per-org assumption).

## D. "adania-resources repo on first managed-agent init" — ambiguous + no hook
10. **No "agent first initialized" lifecycle hook exists.** `ensureOrgWorkspace` runs at onboarding + lazily per turn (`lib/onboarding/workspace.ts`); there is **no event** for "this agent was first initialized." Repo-on-init would need a new hook (in `createBot`, or first `agentSessionWorkflow` start, or org onboarding).
11. **Whose org? Whose token? Why GitHub for a Slack agent?** "within the user's github org" — but (i) the **member** interviewer may have no GitHub org; (ii) the org's GitHub org belongs to the **org-admin**; (iii) creating a repo needs the **`administration`** permission (just added) on the **org's** GitHub App installation token, not the member's. And the InterviewAssistant is Slack-focused — a GitHub repo is orthogonal. → If the intent is a **per-org shared "resources/memory" repo for all agents**, that's an **org-level** provisioning step (at onboarding / first bot) using the **org GitHub App installation token**, *not* "when THIS member's agent initializes."
12. **Repo-as-storage duplicates the native memory model.** Managed agents already retain thread state (durable workflow + session). What writes to `adania-resources`, in what format, via which tool (the GitHub MCP `put_file`?) is undefined — define the purpose before the repo.

## E. Interviewer-is-a-member vs org-admin-gated config
13. **Configuration is org-admin-gated today.** Creating/installing the Slack app, creating the GitHub App, picking channels, managing bots — all `requireOrganization` + org-admin paths (`/portal/bots/*`, `/portal/connect/github`, `/portal/local`). A **member** can log in and *use* a bot but can't *configure* it. "The interviewer configures the Slack channel in the web UI" therefore needs a **new member-allowed setting**, or the channel is pre-set by the org-admin and the member only picks from an allowed list.

## F. Cadence + agent-definition expressiveness (minor)
14. **"every 10 minutes" is client-driven, not agent-autonomous.** The agent is request/response (append transcript → return questions); the web UI runs the 10-min timer and drives `chatMessageHook.resume`. That matches the durable thread-resume model — just be clear the **client owns the cadence**. Reply latency is fine (the agent answers in seconds), but the current reply path polls `session_turns` at 800 ms / 90 s cap — a chat-feel UI would want SSE.
15. **The YAML AgentConfig probably can't declare MCP toolsets.** The dev-agent's GitHub MCP is wired in **code** (`managed-agents.ts` `githubMcp` flag, keyed on act-as-self), **not** in the YAML/`AgentConfig` (`@adania/config-schema`). "Slack MCP tools **in the agent configuration**" likely needs either a schema extension (declare `mcp_servers`/`tools` in `AgentConfig`) or another code-level flag (`slackMcp`). Today it's the latter.

---

## What already fits (so you don't over-build)
- `web.bot_thread` is **surface-generic** — `surface="web"` + a UUID `threadKey` resumes a thread with zero schema change.
- The **Cognito customers pool** can back `adania-client` login for **members** too (`requireOrganization` already resolves member memberships) — same pool, new client.
- The **MCP + per-user vault** pattern (just shipped for GitHub) is a clean template for a `/api/mcp/slack` authed by a per-member Slack vault credential.
- The **managed-agent thread + 10-min append/questions** loop maps directly onto `agentSessionWorkflow` + `chatMessageHook.resume`.

## Recommended reconciliations (one line each)
- Web surface = **app-less direct-API** surface: add `"web"` + an **authenticated** `/api/bots/[botId]/session(+messages)` (membership-checked, ownership-checked). 
- "On behalf of the interviewer" → decide **(a) bot-with-name** (ship now) vs **(b) member Slack vault + `/api/mcp/slack`** (net-new, mirrors GitHub).
- Channel config → store on the bot, **picker fed by the org Slack bot token**, expose as a **member-allowed** setting.
- `adania-resources` → make it an **org-level provisioning** step (org GitHub App token), with a defined purpose, not a per-member agent-init side effect.
- Use the **minimal (web-UI + transcription-service)** diagram; retire "transcribe locally."
