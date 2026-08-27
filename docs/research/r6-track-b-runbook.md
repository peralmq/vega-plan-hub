# R6 — Track B Deployment Runbook (Sandboxed Agent on the M1)

Status: runbook draft, 2026-07-31 — executable once R3 picks the model
and runtime. Spike R6 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md);
the checklist it must satisfy is
[r4-data-model-security.md §5](r4-data-model-security.md).

## Topology (one laptop, three layers)

```
┌─ MacBook Pro M1 (dedicated non-admin macOS user "vega") ─────────┐
│                                                                  │
│  LLM server — NATIVE process (Metal needs bare metal; Docker     │
│  on macOS has no GPU): TurboFieldfare server or Ollama,          │
│  bound to 127.0.0.1 only. launchd-managed.                       │
│                                                                  │
│  Agent runtime — CONTAINER (Docker Desktop or colima):           │
│  long-polls api.telegram.org (no inbound ports), calls           │
│  host.docker.internal:<llm-port> + *.supabase.co.                │
│  no-new-privileges, read-only root, resource-capped.             │
│                                                                  │
│  Admin access — Tailscale only; nothing port-forwarded.          │
└──────────────────────────────────────────────────────────────────┘
```

The LLM server outside the sandbox is acceptable: it holds no secrets
and reaches nothing (localhost bind); the *agent* — which holds the bot
token and the Supabase session — is the thing in the cage.

## Setup sequence

1. **Machine prep**: create the `vega` standard (non-admin) macOS
   user; FileVault on; auto-login off;
   `sudo pmset -c sleep 0 disablesleep 1` for lid-closed 24/7 on AC
   (verify wake-after-power-loss behavior too).
2. **LLM layer**: install the R3 winner; launchd plist
   (`~/Library/LaunchAgents/se.vega.llm.plist`, `KeepAlive: true`)
   running the server on `127.0.0.1`; confirm
   `curl localhost:<port>/v1/models` after a forced reboot.
3. **Agent layer**: container from a pinned image; env carries the bot
   token + Supabase refresh token (from Docker secrets / env file
   `chmod 600`, owned by `vega`); `--cap-drop ALL
   --security-opt no-new-privileges --read-only --memory 1g`.
4. **Egress lockdown**: container network egress restricted to
   `api.telegram.org`, `*.supabase.co`, `host.docker.internal`
   (simplest robust mechanism: a proxy sidecar with a domain
   allow-list, since Docker-on-mac lacks per-container firewalling —
   evaluate in the spike; document what was actually enforceable).
5. **Verification pass** — run R4 §5 top to bottom and paste the
   evidence (`lsof -i -P | grep LISTEN`, egress test showing a blocked
   `curl https://example.com` from inside the container, secrets grep)
   into `r6-track-b-spike.md`.
6. **Revocation drill** (once): revoke the bot token via BotFather and
   the Supabase session from the dashboard; confirm the agent dies
   loudly; restore.

## The one-tool live trial

Per the research plan: wire exactly **`add_item`** end-to-end (Telegram
→ intent parse → `telegram_accounts` gate → insert into
`shopping_list_items` → 🥛 reaction) and live with it for a week, both
partners. Log every miss (wrong item, missed message, latency
complaint, laptop-asleep gap) — that log *is* the Track A vs. Track B
verdict input.

## Explicitly deferred to after the gate

Plan tools, preference learning, proactive sends (needs a scheduler
decision), memory layer wiring — the trial is capture-only on purpose.

## Amendments

- **p4-10 (2026-08-27), menu PDF — Playwright chromium.** The Swedish
  menu card's PDF (`bot/menuPdf.ts`, Playwright `page.pdf()`) needs a
  cached chromium binary on the M1: `npx playwright install chromium`
  (one-time; `@playwright/test` is already a project dependency, so no
  new package). No new egress beyond what the download itself needs —
  the render runs fully offline against local HTML once the binary is
  cached.
