# AGENTS.md — Asheville Condo Tracker (whats-in-asheville)

> **Self-maintenance rule.** If a change alters this repo's shape, stack, verification loop, or guardrails, update this file as part of the same change. This rule does not authorize creating a commit.

Tracks inventory and quick room/closet photos for Nick and Christina’s Asheville
condo and Morganton home. Asheville is the default: the primary use is checking
what is already there while packing for the hour drive. Room browsing and search
come first; item details, restock status, and trip reminders are secondary.
Single household, two allowed users (Nick + Christina). Local-first: inventory
works without Firebase via `localStorage` and syncs when signed in. A service
worker caches the public app shell for cold offline starts after the first online
visit; sharing and cloud photos need a connection. Keep changes conservative and
preserve the existing structure.

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

App entry files live at the **repo root**, with install icons under `icons/`.
There is no `public/` folder. Firebase Hosting's `public` in `firebase.json` is `.`
(the root itself), with `firebase.json`,
`.firebaserc`, `*.rules`, the preview PNG, Markdown, `.git/**`, and `.firebase/**`
excluded via `ignore`. Keep the explicit recursive dot-directory exclusions;
Firebase's general `**/.*` pattern does not exclude their contents.

- App entry / UI shell: `index.html`
- Main client logic (state, rendering, event wiring): `app.js`
- UI: “What’s where,” warm paper colors, room cards, native HTML dialogs, and
  swipe right Have it / swipe left Need it with undo. Room photos stand alone;
  users do not have to itemize a closet.
- State: `homes`, `items`, `places` (room photos/notes), `tasks`, `updatedAt`.
  Keep the original `asheville-condo-tracker-v1` localStorage key. Old items and
  tasks without `homeId` migrate to `asheville`; old backups remain importable.
  Both homes still share the original single Firestore household document.
- Styles: `styles.css`
- Installable app: `manifest.webmanifest`, `sw.js`, `pwa.js`, and `icons/` (the SVG
  mark, 192px/512px PNG icons, and 180px Apple touch icon). No native wrapper or
  build step. `pwa.js` also fits dialogs to the visual viewport above a keyboard.
- Item and room-photo forms scroll their fields independently; their Save footers
  remain visible. Keep this separation when editing these forms.
- Navigation: the History API tracks homes, rooms, views, and open dialogs.
  Browser Back closes a form before leaving its room. The standalone Home Screen
  app adds a right swipe from the leftmost 24px; item status swipes exclude this
  edge. Required shared-list decisions cannot be dismissed with Back.
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
   - **Local mode** (no sign-in): add/edit an item through the Add item dialog;
     use its status select for Have it/Running low/Need it/Not sure. Swipe right
     and left, then Undo. Delete through the edit dialog and check both cancel
     and confirm. Attach/replace/remove an item photo and open it full size.
   - **Room photos**: Quick photo creates a standalone room/closet card without
     item records. Test update/removal, full-size viewing, notes search, and
     renaming a photographed room (its items move along with it).
   - **Homes**: Asheville opens by default. Check Morganton stays separate,
     Both homes search identifies the home, and place names save in Settings.
   - **Bring & buy tab**: low/out/unknown inventory appears automatically. Add a
     reminder, toggle done, delete it, and Copy list (includes inventory needs).
   - **Search/filter**: search is at the top; typing searches all rooms in the
     selected home. Check status/room selects, no-results feedback, and Clear.
   - **Import/Export** (Settings): export/import round-trips both homes, room
     photos, and tasks; also import an old items/tasks-only backup. Check import
     cancel and confirm. Invalid backup entries must not replace existing data.
   - **Sign-in flow** (if `firebase-config.js` has real values and you can reach
     Firebase): Sign In, confirm sharing updates from On this device →
     Connecting → Shared & saved, add an item, confirm it round-trips through Firestore. If
     the device has signed-out changes, verify the explicit local-versus-shared
     choice before either list is replaced.
   - **Mobile viewport**: check 390px and 320px widths plus desktop. Search must
     appear in the first screen; dialogs must fit and swipe must not block vertical
     scrolling. This app is used from a phone while packing.
   - **Asset freshness**: index.html versions its CSS/app URLs and app.js versions
     its firebase-client import with matching release query strings. Bump them
     together when changing browser assets so cached versions cannot mix. Also
     bump the release in sw.js and update its explicit ASSETS list. Service-worker
     updates wait for all old app windows to close; never force-reload a form.
   - **Installation/offline**: check manifest fields and all icon dimensions;
     Settings must show installation instructions and offline readiness. After
     caching, stop the local HTTP server and cold-reload the app, then add/edit an
     item. The worker must bypass Firebase, authentication, cloud photos, and
     unknown routes. Verify cache update/cleanup separately from household data.
   - **Phone keyboard/back**: test a 390px-wide viewport with only 350px of height;
     scroll to Notes and save with the footer still visible. Check actual phone
     keyboard behavior after release. Back must restore rooms/views, close forms,
     and cancel a delete prompt; left-edge back must not change item status.
2. Check the browser console for errors on load and after each action above.
3. If you touched `firestore.rules` or `storage.rules`, re-read them line by
   line — there is no rules emulator/test harness wired up here, so a mistake
   ships straight to prod rules on deploy.
4. If you touched `firebase.json` or deploy Hosting, inspect
   `.firebase/hosting..cache` after deployment. It must list exactly twelve public
   assets: `index.html`, `styles.css`, `app.js`, `firebase-client.js`,
   `firebase-config.js`, `pwa.js`, `sw.js`, `manifest.webmanifest`,
   `icons/app-icon.svg`, `icons/icon-192.png`, `icons/icon-512.png`, and
   `icons/apple-touch-icon.png`. Never deploy `.git`, `.firebase`, docs, rules, or preview
   files from the root-hosted project.

Never claim the work is complete without doing this manual pass, and state in
your report which of the flows above you actually exercised.

## Guardrails

- **Human owns the push by default.** The `origin` remote is
  `https://github.com/nlinc/whats-in-asheville.git`. This repository
  does not currently have a GitHub auto-deploy workflow; publishing requires a
  Firebase Hosting deploy. Do not commit,
  push, or deploy unless the user explicitly requests that exact action.
- **Surgical changes only.** No unrelated refactors, reformatting, or drive-by
  "cleanup."
- **Mobile first.** Verify the mobile layout after any UI change — this is a
  packing-list app used from a phone.
- **No plain `innerHTML` for user-entered data.** Use `textContent` or DOM nodes.
  The only HTML-string renderer is `roomArt`, using fixed SVG path constants.
  Never interpolate household data into it. Imported photo URLs are restricted
  to HTTPS URLs or supported raster data URLs.
- **Two-user access model.** `firestore.rules` and `storage.rules` are both
  hardcoded to two literal emails. Don't genericize this into an open or
  role-based model without being asked — the whole point is it's a private
  household tracker.
- **Firebase config is public, not secret.** The values in `firebase-config.js`
  are normal client-side Firebase config, fine to commit. Don't add a `.env` or
  secrets manager for it. If real API secrets are ever introduced, those go in
  Firebase/Google secret management, never in this repo.
- **Service worker scope.** Cache only the allowlisted public shell assets.
  Never cache Firebase API/authentication responses or cloud photo URLs. Retire
  only caches with the `whats-where-shell-` prefix. Household data stays in the
  original localStorage/Firestore paths. Offline changes remain local; reopening
  online preserves the explicit local-versus-shared choice.
- **Local-first, cloud-optional.** The app must keep working with `firebaseConfig`
  fields empty/missing (pure `localStorage` mode — see `hasConfig` in
  `firebase-client.js`). Don't make Firebase a hard dependency for basic
  add/edit/delete.
- **Simple shared-state model.** Firestore stores the complete home/item/room-photo/task state in
  one household document, so signed-in changes are last-write-wins. Changes made
  while signed out are marked locally; on the next sign-in, the user must choose
  whether to upload that device's list or discard it in favor of the shared list.
  Do not silently overwrite either side or add complex merge machinery without
  an explicit product decision.
- **Photos**: item and standalone room photos are client-compressed by
  `compressImage`, stored inline locally, or uploaded to Storage under
  `households/{householdId}/items/{recordId}/...` when signed in. Local photos
  also upload before sharing on sign-in. Keep both paths working. Replacing,
  removing, or deleting a signed-in cloud photo removes the superseded Storage
  object only after the new shared state saves successfully.
- **Destructive ops**: item deletion and backup import require explicit labeled
  confirmation in the app’s confirmation dialog; retain safe cancel behavior.
  Task deletion is intentionally immediate because tasks are low-stakes. Don't
  remove the item/import confirmations without an explicit request.

## Maintaining this file

Update this AGENTS.md in the same commit whenever you change the project's
shape, stack, the manual verification steps, or a guardrail (e.g. a git remote
gets added, Cloud Functions get introduced, the two-user rules model changes).
A stale AGENTS.md is worse than none — it makes agents confidently wrong.
