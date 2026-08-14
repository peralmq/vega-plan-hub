---
id: p4-07-local-runtime-connectivity
title: Household M1 ↔ Supabase/admin connectivity (Tailscale)
phase: P4
status: todo
depends_on: [p4-02-capture-bot]
---

## Goal

The household M1 (the Track B inference host) gets a defined,
sandbox-compliant network posture:

- **Outbound (the easy part, verify + pin it)**: the runtime reaches
  Supabase and Telegram over plain outbound HTTPS — long-polling
  topology, zero inbound ports (r6 runbook / research-plan §4). Encode
  this as a default-deny egress allow-list (Telegram API + the
  Supabase project URL only) on the runtime's sandbox.
- **Inbound (what Tailscale is actually for)**: admin/ops access to
  the M1 — dashboard, logs, SSH — joins a Tailscale tailnet instead
  of any port-forward/public exposure. LAN/Tailscale-only admin is
  the hard requirement from the research plan's sandbox baseline.
- Ops story documented: what runs where (launchd), how to reach it
  away from home, what the household experience is when the machine
  sleeps or leaves the house (feeds the R6 lid-closed/caffeinate
  checklist).

## Non-goals

- No inbound webhook path to the M1 — if Track A capture stays in the
  hybrid, its webhook terminates at the Supabase edge function, never
  at the house.
- No Supabase "direct database" network peering — the runtime talks
  to the same public Supabase API as everything else (Lovable Cloud
  gives no private networking anyway).
- No third-party remote-desktop/tunnel services beyond Tailscale.

## Context

Misconception to keep buried: connecting the M1 *to* Supabase needs
no tunnel at all (outbound HTTPS works from any network); Tailscale
solves the reverse direction — humans reaching the M1's admin
surfaces safely. Sandbox baseline: research plan §4 (no inbound
exposure, egress allow-list, secrets outside repo) and the r4
security checklist. The backend is Lovable Cloud
(r2-track-a-spike.md): service keys go in via Lovable's secrets
form; the runtime's Supabase credentials on the M1 live in the
sandbox env, never in the repo.

## Progress

- [ ] Tailscale tailnet up (M1 + both phones), admin bound to it
- [ ] Default-deny egress allow-list verified with a canary
- [ ] Runtime → Supabase credential decided, stored, rotating
- [ ] launchd + lid-closed operation verified
- [ ] Ops runbook written

## Steps

1. Install Tailscale on the M1; create the household tailnet and
   join both phones; bind SSH + any admin dashboard to
   tailnet/LAN interfaces only.
2. Egress allow-list on the runtime sandbox: Telegram API + the
   Supabase project URL only, default-deny; verify with a canary
   (a request to any other domain must fail).
3. Runtime → Supabase auth: decide the credential (shared-user
   session per p4-02 vs a scoped key), store it in the sandbox env
   outside the repo, document rotation.
4. launchd unit for the runtime; `caffeinate`/pmset lid-closed test
   (ties into the R6 always-on checklist).
5. Ops runbook: "the box is down" playbook, patching cadence, backup
   story, away-from-home admin walkthrough.

## Verification

- End-to-end: the sandboxed runtime writes a `shopping_list_items`
  row over the allow-listed egress path.
- Negative: canary egress to a non-allow-listed domain is blocked;
  no listening ports are reachable from the WAN side.
- Admin dashboard and SSH reachable from a phone on the tailnet,
  unreachable from the public internet.
- `./harness check` passes (runbook lint / any config validation the
  harness grows for this).

## Evidence

(recorded during implementation)
