# AGENTS.md — Asheville Condo Tracker (whats-in-asheville)

> **Self-maintenance rule.** If a change alters this repo's shape, stack, verification loop, or guardrails, update this file as part of the same change. This rule does not authorize creating a commit.

Remembers what is in Asheville and what to bring next time for Nick and Christina.
The main view follows the device’s current location: Morganton → pack for Asheville;
Asheville → capture next-time and take-home reminders, plus a short departure checkpoint. Location
selection is a device preference, not an inventory filter or a shared household
setting. Asheville memory (items and room photos) is secondary; saved Morganton
inventory and older reminders remain accessible. Single household, two allowed
users. Local-first via the original localStorage key, with optional Firebase sync.
The service worker supports cold offline starts after one online visit. Sharing,
cloud photos, and some browser voice services need a connection.


## Shared workspace workflow

Within Nicholas's personal workspace or its linked checkouts, also read
`/Users/nicholaslincoln/dev/dev-hq/WORKFLOW.md`. Its verification/evidence,
release-identity, atomic task-link, handoff/triage and recovery rules apply.
Root AGENTS.md supplies standing authority; this app's specific safety deltas,
paused scopes and scheduled-worker restrictions remain binding. The root
senior-dev review-branch exception does not grant commits/main/merge/deploy,
new resources, live-data/device operations or wider scheduled-worker powers.
Generic push prohibitions below concern production/main; explicit narrower
local/retired/pilot restrictions retain their own scope. Existing owner authority
continues within its bounds; do not ask for the same approval again.
Outside this workspace, retain the repository contract and restrictions rather
than inventing shared services. A structural check is not app-health acceptance.

## Stack and required routes

Static HTML/CSS/browser ES modules served from repository root. Firebase Hosting/Auth/Firestore/Storage and local mode. No build/package manager/Functions.

Before implementation, QA, diagnosis or release, read the [full current project contract](docs/agent-reference/project-contract.md), including its data, domain, update and acceptance safeguards. Read its relevant sections for documentation-only work. All previous detailed rules and history remain there; moving them does not waive gates or resume paused work.

## Verification loop

```sh
# No automated build/lint/test command.
python3 -m http.server 4173 --bind 127.0.0.1
```

The full contract names runtime prerequisites, emulator ownership, clean-clone setup, browser/manual checks, failure reporting and production-sensitive exclusions. These commands do not replace those checks. Reserve ports/fixtures first; never test with owner data by default.

## Authority and safety

Follow root/shared publication authority and the full contract. No commit without explicit instruction; code approval is not main/merge/deploy permission. Keep focused changes, server/data authorization, secret handling, private history and explicit refresh/recovery intact. This process adoption does not itself publish code or change app behavior.

## Traps and maintenance

Current device location is a local preference, not a shared inventory/home assignment. Preserve reminders, photos and undo/reload behavior; use the complete manual acceptance checklist.

Maintain the matching contract and routed commands with related changes. Use the existing app work record, exact source/evidence and task links; no duplicate completion ledger. Keep CLAUDE.md linked to this entry point.

## Portable process gate and release identity

Read [the project engineering process](docs/workspace-process.md).
`node scripts/hosting-release.mjs gate` runs this app’s declared checks plus
source/artifact regression controls. `candidate` stages only committed reviewed
assets after that gate; `check` and `verify-url` prove intended artifact/served
bytes. Existing app/manual/emulator/device and private-data guards above remain
binding. Release preparation is tooling, not a frontend framework or new backend.
