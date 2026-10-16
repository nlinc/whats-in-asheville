# What’s where

A small shared memory for Nick and Christina: what is already in Asheville,
and what needs to go in the car next time.

- Choose **I’m in Morganton** to pack, or **I’m in Asheville** to save thoughts for
  next time. The app remembers this choice on the device. Both show the same list.
- Capture a reminder with one text field and Add. Optional **Speak** fills that
  field for review; speech availability depends on the browser and may need an
  online browser speech service. No audio is stored by this app. Phone keyboard
  dictation is also available as a fallback.
- Check things off as you pack. **Packed & done** keeps them available to uncheck.
  Checking a box never changes what is saved as already in Asheville.
- **Already in Asheville** opens searchable items and closet/room photos. Add an
  item with just its name; room, shelf, quantity, notes, and category are optional.
  Existing data for both homes remains under **Other homes & filters**. Older
  other-home reminders remain available below the main packing list.
- In Asheville, **Took home** marks an item to bring next time; **Here now** records
  that it is present. Low/missing/uncertain items also appear on the packing list.
- **Leaving Asheville?** offers a short checkpoint: save a reminder, record what
  came home, or update a changed room photo. Only update what changed. A room’s
  **Still looks right** action checks that particular photo. Dates never imply
  that an unrelated save checked the whole inventory.
- **Settings & sharing** holds Google sign-in, home names, backup import/export,
  and Home Screen installation instructions.
- On iPhone: Safari → Share → Add to Home Screen, leaving Open as Web App enabled
  if offered. On Android use Install app in the browser menu or Settings button.
- Browser Back returns to the previous view/room and closes forms. In the Home
  Screen app, swipe right from the left edge. Middle-of-item swipes change status
  with Undo. Forms scroll above the phone keyboard and keep Save visible.

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
