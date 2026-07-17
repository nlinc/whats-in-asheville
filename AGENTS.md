# AGENTS.md — Asheville Condo Tracker (whats-in-asheville)

> ⚙️ **Self-maintenance rule — do this automatically, every time.** If a change you make alters this repo's **shape** (files, entry points, structure), its **stack/dependencies**, the **build/test loop**, or a **guardrail**, you MUST update the matching section of THIS file in the *same commit* — before the task counts as done. This is not optional cleanup or a follow-up task.

Tracks inventory (closets, cabinets, pantry, supplies), restock status, trip-prep
tasks, and item photos for Nick's Asheville condo. Single household, two allowed
users (Nick + Christina). Local-first: works fully offline via `localStorage`,
and syncs to Firebase when signed in. Keep changes conservative and preserve the
existing structure.

## Stack (authoritative)

Vanilla static HTML/CSS/ES modules. No build step, no bundler, no framework.
This is NOT a React/Vite/Next project — do not add a build system, package.json,
or npm dependency unless explicitly asked.

- Firebase services in use: **Hosting, Firestore, Storage, Authentication (Google
  sign-in)**.
- **No Cloud Functions.** There is no `functions/` folder and none should be
  added without an explicit ask — all logic runs client-side in `app.js`.
- Firebase project: `lincoln-second-home` (see `.firebaserc`). Household doc id:
  `asheville-condo` (see `firebase-config.js`).
- Firebase SDK is loaded via versioned CDN ES module imports inside
  `firebase-client.js` (`https://www.gstatic.com/firebasejs/10.12.5/...`), not npm
  packages. Keep that pattern; don't switch to `npm install firebase`.

## Project shape

Everything lives at the **repo root** — there is no `public/` folder. Firebase
Hosting's `public` in `firebase.json` is `.` (the root itself), with `firebase.json`,
`.firebaserc`, `*.rules`, and `*.png` excluded via `ignore`.

- App entry / UI shell: `index.html`
- Main client logic (state, rendering, event wiring): `app.js`
- Styles: `styles.css`
- Firebase browser config (public config + `householdId`): `firebase-config.js`
- Firebase service wrapper (auth, Firestore sync, Storage photo upload): `firebase-client.js`
- Firestore rules: `firestore.rules` — locks `households/asheville-condo` to two
  hardcoded emails (`nlincoln28@gmail.com`, `cspritke@gmail.com`)
- Storage rules: `storage.rules` — same household and two-email lock, scoped to
  `households/asheville-condo/**`
- Hosting/Firestore/Storage config: `firebase.json`
- `.firebaserc`: points at project `lincoln-second-home`
- Project notes and Firebase setup: `README.md`
- Preview image: `asheville-tracker-preview.png` (not deployed — excluded in
  `firebase.json` `ignore`)
- Tests: none. There is no `package.json`, no test runner, no `node_modules`.
- Cloud Functions: none — do not add a `functions/` directory.

## The loop (run before declaring done)

There is no build, lint, or test command in this repo — don't invent one or add
a `package.json` just to have "a loop." Verify manually instead:

1. Serve the repo root over HTTP (`python3 -m http.server` works fine), then open
   it in a browser. Do not rely on opening `index.html` as a `file://` URL because
   the app uses ES modules. Exercise the flow you touched:
   - **Local mode** (no sign-in): add an item, edit it, mark it Running low/Out/In
     stock, delete it, attach a photo, confirm it lands in Photo Memory and the
     Next Trip Snapshot.
   - **Trip Prep tab**: add a task, toggle done, delete it, Copy Checklist.
   - **Search/filter**: search box, status chips, room filter, Clear.
   - **Import/Export**: Export Backup downloads JSON; Import Backup round-trips it.
   - **Sign-in flow** (if `firebase-config.js` has real values and you can reach
     Firebase): Sign In, confirm the sync pill updates (Local → Signed out →
     Syncing as ...), add an item, confirm it round-trips through Firestore. If
     the device has signed-out changes, verify the explicit local-versus-shared
     choice before either list is replaced.
   - **Mobile viewport**: resize / use device toolbar — this app is used from a
     phone while packing.
2. Check the browser console for errors on load and after each action above.
3. If you touched `firestore.rules` or `storage.rules`, re-read them line by
   line — there is no rules emulator/test harness wired up here, so a mistake
   ships straight to prod rules on deploy.

Never claim the work is complete without doing this manual pass, and state in
your report which of the flows above you actually exercised.

## Guardrails

- **Human owns the push by default.** The `origin` remote is
  `https://github.com/nlinc/whats-in-asheville.git`. A push to `main` is expected
  to auto-deploy Firebase Hosting like Nick's other Micro-Apps. Agents commit
  locally, report the SHA, and stop unless the user explicitly requests a push
  or Firebase deploy.
- **Surgical changes only.** No unrelated refactors, reformatting, or drive-by
  "cleanup."
- **Mobile first.** Verify the mobile layout after any UI change — this is a
  packing-list app used from a phone.
- **No plain `innerHTML` for user-entered data.** Prefer `textContent` or
  building DOM nodes, as most of `app.js` already does. `renderAttention` still
  uses an HTML string and runs every interpolated item field through the existing
  `escapeHtml()` helper. If you touch it or add a similar renderer, escape every
  field or build DOM nodes instead. This includes URLs imported from backups.
- **Two-user access model.** `firestore.rules` and `storage.rules` are both
  hardcoded to two literal emails. Don't genericize this into an open or
  role-based model without being asked — the whole point is it's a private
  household tracker.
- **Firebase config is public, not secret.** The values in `firebase-config.js`
  are normal client-side Firebase config, fine to commit. Don't add a `.env` or
  secrets manager for it. If real API secrets are ever introduced, those go in
  Firebase/Google secret management, never in this repo.
- **Local-first, cloud-optional.** The app must keep working with `firebaseConfig`
  fields empty/missing (pure `localStorage` mode — see `hasConfig` in
  `firebase-client.js`). Don't make Firebase a hard dependency for basic
  add/edit/delete.
- **Simple shared-state model.** Firestore stores the complete item/task state in
  one household document, so signed-in changes are last-write-wins. Changes made
  while signed out are marked locally; on the next sign-in, the user must choose
  whether to upload that device's list or discard it in favor of the shared list.
  Do not silently overwrite either side or add complex merge machinery without
  an explicit product decision.
- **Photos**: item photos are client-compressed to a data URL (`compressImage`)
  before either being stored inline (local mode) or uploaded to Storage under
  `households/{householdId}/items/{itemId}/...` (signed-in mode). Keep both
  paths working if you touch photo handling. When signed in, replacing, removing,
  or deleting an item's cloud photo must also remove the superseded Storage
  object after the new state saves successfully.
- **Destructive ops**: item deletion and backup import require confirmation.
  Task deletion is intentionally immediate because tasks are low-stakes. Don't
  remove the item/import confirmations without an explicit request.

## Maintaining this file

Update this AGENTS.md in the same commit whenever you change the project's
shape, stack, the manual verification steps, or a guardrail (e.g. a git remote
gets added, Cloud Functions get introduced, the two-user rules model changes).
A stale AGENTS.md is worse than none — it makes agents confidently wrong.
