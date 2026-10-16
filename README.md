# What’s where

A small, local-first inventory for Nick and Christina’s Asheville condo and
Morganton home. Opens on Asheville so “do we already have this?” is easy to answer
while packing for the drive.

- Search at the top, or tap a room to look around.
- Add an item with a name and room; the home follows your current selection.
  Shelf, quantity, notes, category, and status live under optional details.
- Take a quick room/closet photo without listing every item. Photo notes are
  searchable. Open a room to view or update its photo.
- Swipe right for **Have it**, left for **Need it**; Undo is available afterwards.
  The labeled status select offers the same actions plus Running low / Not sure.
- **Bring & buy** includes low/missing/uncertain items and simple trip reminders.
- **Settings & sharing** holds install instructions, Google sign-in, home names,
  and backup import/export.
- On iPhone, open in Safari → Share → Add to Home Screen. Leave Open as Web App
  enabled if offered, then tap Add. On Android, use Install app in the browser
  menu (or the install button in Settings when available).
- Browser Back returns to the previous home/room/view and closes open forms.
  In the Home Screen app, swipe right from the left edge to go back. Swiping
  across the middle of an item still changes its status.
- Forms fit above the phone keyboard, scroll their fields, and keep Save visible.

Vanilla HTML, CSS, and browser ES modules. No build, npm dependencies, or framework.
Run `python3 -m http.server` from this folder and open the HTTP URL. See AGENTS.md
for the manual verification loop and deployment guardrails.

Existing local data uses the original storage key. Items and tasks from old
backups belong to Asheville. New backups include home names and room photos.
Both homes sync through the same private household document; the two-user access
rules and last-write-wins model are unchanged. Signed-out changes require an
explicit choice on sign-in before replacing either list. Local changes remain
on the device until signed in; photos are compressed locally and uploaded to
Storage before sharing.

## Firebase setup

Project: `lincoln-second-home`. Household: `asheville-condo`.

1. Enable Cloud Firestore in Native mode.
2. Enable Firebase Storage.
3. Enable Authentication → Google sign-in.
4. Deploy rules and hosting only when explicitly authorized:

```sh
firebase deploy --only firestore:rules,storage,hosting
```

Firebase is optional for local use. Shared inventory and cloud photo access need
sign-in. After one online visit, the service worker caches the app shell for offline
startup. Inventory saved on that device remains available. Sharing and cloud
photos need a connection. Reopen online to review and share offline changes.
The worker caches only public app assets, never Firebase or authentication
responses. Updates activate after all old app windows/tabs close; an open form
is never force-reloaded.

The manifest, service worker, and icons are static files; there are still no
build dependencies. The twelve-file Hosting allowlist is documented in AGENTS.md.
When changing app code, bump the release query strings in index.html/app.js and
the matching cache release and ASSETS list in sw.js.
