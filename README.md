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
- **Settings & sharing** holds Google sign-in, home names, and backup import/export.

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
sign-in. A loaded app can keep local changes without a connection; a fresh offline
load is subject to the browser’s resource cache (there is no service worker).
