import { firebaseService } from "./firebase-client.js?v=20261016-pwa2";

// Keep the original key so the redesign opens existing inventories in place.
const STORAGE_KEY = "asheville-condo-tracker-v1";
const DIRTY_KEY = `${STORAGE_KEY}-has-local-changes`;
const defaultHomes = [{ id: "asheville", name: "Asheville" }, { id: "morganton", name: "Morganton" }];
const defaultRooms = ["Kitchen", "Bedroom", "Bathroom", "Closets & storage"];
const categories = ["Other", "Food", "Paper goods", "Toiletries", "Linens", "Cleaning", "Appliances", "Tools", "Guest supplies", "Tech"];
const statuses = { "In stock": "Have it", "Running low": "Running low", "Out": "Need it", "Unknown": "Not sure" };
const $ = (selector) => document.querySelector(selector);
let loadFailure = false;
let state = loadState();
let durableState = structuredClone(state);
let activeHome = "asheville";
let activeRoom = "All";
let activeView = "inventory";
let navigationDepth = 0;
let navigationReady = false;
let restoringNavigation = false;
const allowedDialogClosures = new Set();
let editingItemId = null;
let itemPhoto = "";
let itemPhotoChanged = false;
let placePhoto = "";
let placePhotoChanged = false;
let editingPlaceId = null;
let photoJob = 0;
let resolvingRemoteState = false;
let toastTimer;
let undoAction = null;

function id() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function textNode(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, className, onClick, label) {
  const el = textNode("button", text, className);
  el.type = "button";
  if (label) el.setAttribute("aria-label", label);
  el.addEventListener("click", onClick);
  return el;
}
// Give browser/phone back gestures real places to return to, without URL routing.
function navigationSnapshot() {
  return { app: "whats-where", depth: navigationDepth, home: activeHome, room: activeRoom,
    view: activeView, search: $("#searchInput").value, status: $("#statusFilter").value,
    dialogs: [...document.querySelectorAll("dialog[open]")].map((dialog) => dialog.id) };
}
function rememberNavigation(replace = false) {
  if (!navigationReady || restoringNavigation) return;
  const next = navigationSnapshot();
  const current = history.state;
  const contents = (entry) => JSON.stringify({ ...entry, depth: 0 });
  if (!replace && current?.app === "whats-where" && contents(current) === contents(next)) return;
  if (!replace) next.depth = ++navigationDepth;
  history[replace ? "replaceState" : "pushState"](next, "");
}
function showDialog(dialog) {
  dialog.showModal();
  rememberNavigation();
}
function closeDialog(dialog) {
  if (!dialog.open) return Promise.resolve();
  const current = history.state;
  if (current?.app === "whats-where" && current.dialogs?.at(-1) === dialog.id && navigationDepth > 0) {
    allowedDialogClosures.add(dialog.id);
    // Forward navigation must not resurrect a submitted or discarded form.
    history.replaceState({ ...current, dialogs: current.dialogs.filter((id) => id !== dialog.id) }, "");
    return new Promise((resolve) => {
      dialog.addEventListener("close", resolve, { once: true });
      history.back();
    });
  }
  dialog.close();
  return Promise.resolve();
}
function goBack() {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (dialog) {
    if (dialog.dataset.requireChoice !== "true") closeDialog(dialog);
    return;
  }
  if (navigationDepth > 0) history.back();
}
function setupNavigation() {
  navigationReady = true;
  rememberNavigation(true);
  window.addEventListener("popstate", (event) => {
    const next = event.state;
    if (next?.app !== "whats-where") return;
    const required = document.querySelector('dialog[open][data-require-choice="true"]');
    if (required && !next.dialogs?.includes(required.id) && !allowedDialogClosures.has(required.id)) {
      history.pushState(navigationSnapshot(), "");
      return;
    }
    restoringNavigation = true;
    navigationDepth = next.depth || 0;
    activeHome = next.home || "asheville";
    activeRoom = next.room || "All";
    $("#searchInput").value = next.search || "";
    $("#statusFilter").value = Object.hasOwn(statuses, next.status) ? next.status : "All";
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      if (!next.dialogs?.includes(dialog.id)) {
        allowedDialogClosures.delete(dialog.id);
        dialog.close();
      }
    });
    switchView(next.view === "trip" ? "trip" : "inventory", false);
    render();
    restoringNavigation = false;
    // Never reopen a stale edit form when the user goes forward.
    rememberNavigation(true);
  });
  // Safari's normal browser uses its native history gesture. Home Screen apps
  // get a left-edge gesture here; middle-of-row swipes remain status actions.
  let edge = null;
  const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  document.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    edge = installed() && event.touches.length === 1 && touch.clientX <= 24 &&
      (navigationDepth > 0 || document.querySelector("dialog[open]"))
      ? { x: touch.clientX, y: touch.clientY, dx: 0 } : null;
  }, { passive: true });
  document.addEventListener("touchmove", (event) => {
    if (!edge || event.touches.length !== 1) { edge = null; return; }
    const touch = event.touches[0];
    const dx = touch.clientX - edge.x, dy = touch.clientY - edge.y;
    if (Math.abs(dy) > Math.max(12, Math.abs(dx))) { edge = null; return; }
    if (dx > 12) { edge.dx = dx; event.preventDefault(); }
  }, { passive: false });
  document.addEventListener("touchend", () => {
    const distance = edge?.dx || 0;
    edge = null;
    if (distance >= 72) goBack();
  });
  document.addEventListener("touchcancel", () => { edge = null; });
}

let confirmationQueue = Promise.resolve();
function confirmAction({ title, message, accept = "Continue", cancel = "Keep it", requireChoice = false }) {
  const next = confirmationQueue.then(() => new Promise((resolve) => {
    const dialog = $("#confirmationDialog");
    dialog.dataset.requireChoice = String(requireChoice);
    $("#confirmationTitle").textContent = title;
    $("#confirmationMessage").textContent = message;
    $("#confirmationAccept").textContent = accept;
    $("#confirmationCancel").textContent = cancel;
    let answer = false;
    const close = () => { dialog.removeEventListener("cancel", onCancel); dialog.removeEventListener("close", close); $("#confirmationAccept").onclick = null; $("#confirmationCancel").onclick = null; delete dialog.dataset.requireChoice; resolve(answer); };
    const onCancel = (event) => { if (requireChoice) event.preventDefault(); };
    $("#confirmationAccept").onclick = () => { answer = true; closeDialog(dialog); };
    $("#confirmationCancel").onclick = () => closeDialog(dialog);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", close);
    showDialog(dialog);
  }));
  confirmationQueue = next.catch(() => {});
  return next;
}
function homeName(homeId) { return state.homes.find((home) => home.id === homeId)?.name || "Asheville"; }
function isHere(entry) { return activeHome === "All" || entry.homeId === activeHome; }
function statusClass(status) { return status === "Out" ? "out" : status === "Running low" ? "low" : status === "Unknown" ? "unknown" : ""; }
function safePhoto(value) {
  if (typeof value !== "string") return "";
  if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(value)) return value;
  try { return new URL(value).protocol === "https:" ? value : ""; } catch { return ""; }
}
function normalizeState(raw = {}) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items) || !Array.isArray(raw.tasks)) throw new Error("This is not a tracker backup.");
  const homes = Array.isArray(raw.homes) && raw.homes.length ? raw.homes.map((home) => {
    if (!home || typeof home.id !== "string" || !home.id || typeof home.name !== "string" || !home.name.trim()) throw new Error("A home is missing its name.");
    return { id: home.id, name: home.name.trim().slice(0, 80) };
  }) : defaultHomes.map((home) => ({ ...home }));
  if (!homes.some((home) => home.id === "asheville")) homes.unshift({ ...defaultHomes[0] });
  if (new Set(homes.map((home) => home.id)).size !== homes.length) throw new Error("Duplicate home IDs in backup.");
  const homeIds = new Set(homes.map((home) => home.id));
  const field = (value) => typeof value === "string" ? value : "";
  const items = raw.items.map((item) => {
    if (!item || typeof item.name !== "string" || !item.name.trim()) throw new Error("An item is missing its name.");
    return { ...item, id: field(item.id) || id(), name: item.name.trim(), homeId: homeIds.has(item.homeId) ? item.homeId : "asheville", room: field(item.room).trim() || "Unsorted", category: categories.includes(item.category) ? item.category : "Other", status: Object.hasOwn(statuses, item.status) ? item.status : "Unknown", quantity: field(item.quantity), location: field(item.location), notes: field(item.notes), photo: safePhoto(item.photo) };
  });
  const tasks = raw.tasks.map((task) => {
    if (!task || typeof task.text !== "string" || !task.text.trim()) throw new Error("A trip reminder is missing its text.");
    return { ...task, id: field(task.id) || id(), text: task.text.trim(), type: ["Bring", "Buy", "Check"].includes(task.type) ? task.type : "Check", done: Boolean(task.done), homeId: homeIds.has(task.homeId) ? task.homeId : "asheville" };
  });
  const places = (Array.isArray(raw.places) ? raw.places : []).map((place) => {
    if (!place || typeof place.name !== "string" || !place.name.trim()) throw new Error("A room photo is missing its location.");
    return { id: field(place.id) || id(), name: place.name.trim(), homeId: homeIds.has(place.homeId) ? place.homeId : "asheville", photo: safePhoto(place.photo), notes: field(place.notes), updatedAt: field(place.updatedAt) };
  });
  for (const records of [items, tasks, places]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate record IDs in backup.");
  }
  return { homes, items, tasks, places, updatedAt: field(raw.updatedAt) || new Date().toISOString() };
}
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));
  } catch (error) {
    // Leave the original stored data intact so it can be recovered.
    loadFailure = true;
    window.setTimeout(() => showToast(`Could not open saved data: ${error.message} Export the original from settings or import a valid backup.`), 0);
  }
  return normalizeState({ items: [], tasks: [] });
}
function setDirty(dirty) { localStorage.setItem(DIRTY_KEY, String(dirty)); }
function hasLocalChanges() { return localStorage.getItem(DIRTY_KEY) === "true"; }
async function saveState() {
  if (loadFailure) { showToast("Saved data could not be opened. Export it from settings or import a valid backup first."); return null; }
  state.updatedAt = new Date().toISOString();
  try {
    setDirty(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    durableState = structuredClone(state);
  } catch {
    state = structuredClone(durableState);
    render();
    showToast("Device storage is full. Nothing was changed. Export a backup.");
    return null;
  }
  render();
  if (navigator.onLine === false) {
    updateSyncStatus({ mode: "local", message: "Offline. Changes are saved on this device. Reopen when connected to review and share them." });
    return true;
  }
  if (!firebaseService.user) return true;
  return saveCloudState();
}
async function saveCloudState() {
  if (!firebaseService.ready) return false;
  updateSyncStatus({ mode: "saving", message: "Saving your changes to the shared list…" });
  try {
    // Photos captured while signed out move to Storage before sharing the document.
    // Keep data URLs intact locally if any upload fails.
    for (const collection of ["items", "places"]) {
      for (const entry of [...state[collection]]) {
        if (!entry.photo.startsWith("data:")) continue;
        const localPhoto = entry.photo;
        const uploaded = await cloudPhoto(localPhoto, true, entry.id);
        const current = state[collection].find((record) => record.id === entry.id);
        if (current?.photo === localPhoto) current.photo = uploaded;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    durableState = structuredClone(state);
    render();
    await firebaseService.saveState(state);
    setDirty(false);
    updateSyncStatus({ mode: "cloud", message: `Shared as ${firebaseService.user.displayName || firebaseService.user.email}. Your changes are saved.` });
    return true;
  } catch (error) {
    setDirty(true);
    updateSyncStatus({ mode: "error", message: `Saved on this device. Sharing needs attention: ${error.message}` });
    return false;
  }
}
function showToast(message, undo = null) {
  clearTimeout(toastTimer);
  $("#toastText").textContent = message;
  undoAction = undo;
  $("#toastUndo").classList.toggle("hidden", !undo);
  $("#toast").classList.remove("hidden");
  toastTimer = window.setTimeout(() => { $("#toast").classList.add("hidden"); undoAction = null; }, undo ? 9000 : 5000);
}
function savedMessage(saved, message) { if (saved !== null) showToast(saved ? message : "Saved on this device. Check sharing in settings."); }
function updateSyncStatus(status) {
  $("#syncDot").className = `sync-dot ${status.mode}`;
  $("#syncMode").textContent = ({ cloud: "Shared & saved", saving: "Saving…", loading: "Connecting…", "signed-out": "On this device", error: "Check sharing", local: "On this device" })[status.mode] || "On this device";
  $("#syncMessage").textContent = status.mode === "signed-out" ? "Sign in with Google so you both see the same list. Until then, changes stay on this device." : status.message;
  $("#signInButton").classList.toggle("hidden", !firebaseService.enabled || Boolean(firebaseService.user));
  $("#signOutButton").classList.toggle("hidden", !firebaseService.user);
}
function startFirebase() {
  firebaseService.init({
    onStatus: updateSyncStatus,
    onState: async (rawRemote) => {
      if (resolvingRemoteState || loadFailure) return;
      if (!rawRemote) {
        if (state.items.length || state.tasks.length || state.places.length || hasLocalChanges()) await saveCloudState();
        return;
      }
      let remote;
      try { remote = normalizeState(rawRemote); } catch (error) {
        updateSyncStatus({ mode: "error", message: `Could not read the shared list: ${error.message}` });
        return;
      }
      const contents = ({ homes, items, tasks, places }) => JSON.stringify({ homes, items, tasks, places });
      if (hasLocalChanges() && contents(state) !== contents(remote)) {
        resolvingRemoteState = true;
        const useLocal = await confirmAction({ title: "Which list should you both use?", message: "This device has changes that are not shared yet. Using the device list replaces the shared list. Using the shared list discards this device’s changes. Choose before either list is replaced.", accept: "Use device list", cancel: "Use shared list", requireChoice: true });
        if (useLocal) {
          await saveCloudState();
          resolvingRemoteState = false;
          return;
        }
        resolvingRemoteState = false;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        setDirty(false);
        state = remote;
        durableState = structuredClone(state);
        render();
      } catch {
        updateSyncStatus({ mode: "error", message: "Could not store the shared list on this device. Free some storage and reload." });
      }
    }
  });
}
function fillHomeSelect(select, selected) {
  select.replaceChildren(...state.homes.map((home) => new Option(home.name, home.id)));
  select.value = selected && selected !== "All" ? selected : "asheville";
}
function selectHome(homeId) {
  activeHome = homeId;
  activeRoom = "All";
  $("#statusFilter").value = "All";
  render();
  rememberNavigation();
}
function renderHomes() {
  if (activeHome !== "All" && !state.homes.some((home) => home.id === activeHome)) activeHome = "asheville";
  $("#homeNav").replaceChildren();
  [...state.homes, { id: "All", name: "Both homes" }].forEach((home) => {
    const el = button("", `home-button${activeHome === home.id ? " active" : ""}`, () => selectHome(home.id));
    el.append(textNode("span", "", "home-dot"), textNode("span", home.name), textNode("span", "↗", "nav-arrow"));
    el.setAttribute("aria-pressed", String(activeHome === home.id));
    $("#homeNav").append(el);
  });
  $("#homeEyebrow").textContent = activeHome === "All" ? "A little memory for both homes" : `The ${homeName(activeHome)} place`;
  $("#heroDescription").textContent = activeHome === "All" ? `Find it in ${state.homes.map((home) => home.name).join(" or ")}. One less thing to remember.` : activeHome === "asheville" ? `Know what’s in ${homeName(activeHome)}. Leave the extra packing behind.` : `Know what’s in ${homeName(activeHome)}. Everything has its place.`;
  const reminderHome = $("#taskHome").value;
  fillHomeSelect($("#taskHome"), reminderHome || activeHome);
  $("#taskHome").classList.toggle("hidden", activeHome !== "All");
  $("#taskForm").classList.toggle("both-homes", activeHome === "All");
  $("#roomSuggestions").replaceChildren(...[...new Set([...defaultRooms, ...state.items.filter(isHere).map((item) => item.room), ...state.places.filter(isHere).map((place) => place.name)])].map((room) => new Option(room)));
}
// Drawings are static, code-native assets; no household content enters SVG markup.
const roomPaths = {
  kitchen: '<path d="M12 58h76M18 58V28h64v30M18 40h64M37 40v18M61 40v18M24 17h20v14H24zM48 18h8m-4-4v8M64 28V16h9v12M24 47h5m15 0h9m15 0h6M15 64h70"/><path d="M29 12h10"/>',
  bedroom: '<path d="M12 57V37c0-4 4-6 8-6h58c5 0 8 2 8 6v20M12 44h74M18 57v7m61-7v7M21 31V14h55v17M28 22h16v9H28zM51 22h16v9H51zM6 64h86"/>',
  bathroom: '<path d="M17 36h65l-5 20H24zM29 56v7m43-7v7M23 36V15c0-9 15-9 15 0v7M30 22h16M54 15h24v15H54zM64 15v15M11 64h77"/><path d="M33 27v3m9-3v3"/>',
  storage: '<path d="M23 8h54v56H23zM23 37h54M49 8v56M29 18h14v12H29zM56 19h14v11H56zM30 46h12v13H30zM55 46h16v13H55zM18 64h64M45 23v5m8-5v5"/>',
  living: '<path d="M14 37v21h72V37h-9v12H23V37zM23 40V23h54v17M49 23v26M20 58v6m60-6v6M8 64h84M84 32V13m-7 0h14l-4-9h-6z"/>'
};
function cameraIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "camera-icon");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attributes] of [["path", { d: "M8 7l2-4h4l2 4M6 7h12a3 3 0 013 3v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a3 3 0 013-3z" }], ["circle", { cx: "12", cy: "13.5", r: "3.5" }]]) {
    const part = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => part.setAttribute(key, value));
    svg.append(part);
  }
  return svg;
}
function roomArt(name) {
  const key = /kitchen|pantry/i.test(name) ? "kitchen" : /bed/i.test(name) ? "bedroom" : /bath/i.test(name) ? "bathroom" : /living|lounge/i.test(name) ? "living" : "storage";
  const art = document.createElement("span");
  art.className = "room-art";
  art.setAttribute("aria-hidden", "true");
  art.innerHTML = `<svg viewBox="0 0 100 72">${roomPaths[key]}</svg>`;
  return art;
}
function roomEntries() {
  const entries = new Map();
  const ensure = (homeId, name) => {
    const key = JSON.stringify([homeId, name]);
    if (!entries.has(key)) entries.set(key, { homeId, name, count: 0, place: null });
    return entries.get(key);
  };
  state.items.filter(isHere).forEach((item) => { ensure(item.homeId, item.room).count++; });
  state.places.filter(isHere).forEach((place) => { ensure(place.homeId, place.name).place = place; });
  if (!entries.size && activeHome !== "All") defaultRooms.forEach((name) => ensure(activeHome, name));
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function renderRooms() {
  const entries = roomEntries();
  const roomNames = [...new Set(entries.map((entry) => entry.name))].sort();
  $("#roomFilter").replaceChildren(new Option("All rooms", "All"), ...roomNames.map((room) => new Option(room, room)));
  if (activeRoom !== "All" && !roomNames.includes(activeRoom)) activeRoom = "All";
  $("#roomFilter").value = activeRoom;
  $("#roomGrid").replaceChildren();
  entries.forEach((entry) => {
    const card = textNode("article", "", `room-card${entry.place?.photo ? " has-photo" : ""}`);
    const open = button("", "room-open", () => { if (activeHome === "All") activeHome = entry.homeId; activeRoom = entry.name; $("#searchInput").value = ""; render(); rememberNavigation(); });
    open.setAttribute("aria-label", `Open ${entry.name}${activeHome === "All" ? ` in ${homeName(entry.homeId)}` : ""}`);
    if (entry.place?.photo) {
      const img = document.createElement("img"); img.className = "room-image"; img.src = entry.place.photo; img.alt = ""; img.loading = "lazy"; open.append(img);
    } else open.append(roomArt(entry.name));
    open.append(textNode("span", entry.name, "room-title"), textNode("span", `${activeHome === "All" ? `${homeName(entry.homeId)} · ` : ""}${entry.count === 0 && entry.place?.photo ? "Photo memory" : `${entry.count} ${entry.count === 1 ? "item" : "items"}${entry.place?.photo ? " · photo" : ""}`}`, "room-count"), textNode("span", "↗", "room-arrow"));
    const photoAction = button("", "room-add-photo", () => openPlace(entry.name, entry.homeId), `${entry.place?.photo ? "Update" : "Add"} photo of ${entry.name}`);
    photoAction.append(cameraIcon());
    card.append(open, photoAction);
    $("#roomGrid").append(card);
  });
  const searching = Boolean($("#searchInput").value.trim());
  $("#roomsSection").classList.toggle("hidden", activeRoom !== "All" || searching);
  $("#roomDetail").classList.toggle("hidden", activeRoom === "All" || searching);
  $("#roomOverview").replaceChildren();
  if (activeRoom !== "All" && !searching) {
    const place = state.places.find((entry) => isHere(entry) && entry.name === activeRoom);
    const card = textNode("div", "", "room-overview-card");
    if (place?.photo) {
      const photoButton = button("", "overview-photo", () => openLightbox({ ...place, room: place.name }), `View photo of ${activeRoom}`);
      const img = document.createElement("img"); img.src = place.photo; img.alt = `${activeRoom} overview`; photoButton.append(img); card.append(photoButton);
    } else card.append(roomArt(activeRoom));
    const info = textNode("div", "");
    info.append(textNode("p", homeName(activeHome), "eyebrow"), textNode("h2", activeRoom), textNode("p", place?.notes || "A photo is an easy way to remember what’s in here."), button(place?.photo ? "Update room photo ↗" : "▧ Take a quick photo", "text-button", () => openPlace(activeRoom)));
    card.append(info); $("#roomOverview").append(card);
  }
}
function filteredItems() {
  const term = $("#searchInput").value.trim().toLocaleLowerCase();
  const status = $("#statusFilter").value;
  return state.items.filter((item) => isHere(item) && (activeRoom === "All" || item.room === activeRoom) && (status === "All" || item.status === status) && [item.name, item.room, item.location, item.notes, item.quantity, homeName(item.homeId)].join(" ").toLocaleLowerCase().includes(term));
}
function metaText(item) { return [activeHome === "All" ? homeName(item.homeId) : "", item.room, item.location, item.quantity].filter(Boolean).join(" · "); }
function renderInventory() {
  renderRooms();
  const items = filteredItems();
  const term = $("#searchInput").value.trim();
  $("#listHeading").textContent = term ? `Results for “${term}”` : activeRoom !== "All" ? "What’s in here" : activeHome === "All" ? "Everything, everywhere" : "Everything here";
  $("#listEyebrow").textContent = term ? "One less thing to wonder about" : "The little things, remembered";
  $("#resultCount").textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  const filtered = Boolean(term || activeRoom !== "All" || $("#statusFilter").value !== "All");
  $("#clearFilters").classList.toggle("hidden", !filtered);
  $("#inventoryList").replaceChildren();
  items.forEach((item) => {
    const shell = textNode("div", "", "item-shell");
    const underlay = textNode("div", "", "swipe-underlay"); underlay.setAttribute("aria-hidden", "true"); underlay.append(textNode("span", "✓ Have it"), textNode("span", "Need it +"));
    const card = textNode("article", "", "item-card");
    const thumb = button("", "item-thumb", () => item.photo ? openLightbox(item) : editItem(item.id), item.photo ? `View photo of ${item.name}` : `Edit ${item.name}`);
    if (item.photo) { const img = document.createElement("img"); img.src = item.photo; img.alt = ""; img.loading = "lazy"; thumb.append(img); }
    else thumb.textContent = item.name.slice(0, 1).toLocaleLowerCase();
    const copy = textNode("div", "", "item-copy");
    copy.append(button(item.name, "item-name", () => editItem(item.id)), textNode("p", metaText(item), "item-meta"));
    if (item.notes) copy.append(textNode("p", item.notes, "item-notes"));
    const status = document.createElement("select"); status.className = `item-status ${statusClass(item.status)}`; status.setAttribute("aria-label", `Status of ${item.name}`);
    Object.entries(statuses).forEach(([value, label]) => status.append(new Option(label, value))); status.value = item.status;
    status.addEventListener("change", () => updateStatus(item.id, status.value));
    card.append(thumb, copy, status, button("···", "edit-button", () => editItem(item.id), `More options for ${item.name}`));
    setupSwipe(card, item.id); shell.append(underlay, card); $("#inventoryList").append(shell);
  });
  // Photo-only rooms also participate in search, without inventing item records.
  const places = term ? state.places.filter((place) => isHere(place) && (activeRoom === "All" || place.name === activeRoom) && $("#statusFilter").value === "All" && [place.name, place.notes, homeName(place.homeId)].join(" ").toLocaleLowerCase().includes(term)) : [];
  places.forEach((place) => {
    const card = textNode("article", "", "item-card photo-result");
    const thumb = button("▧", "item-thumb", () => openPlace(place.name, place.homeId), `View ${place.name}`);
    if (place.photo) { const img = document.createElement("img"); img.src = place.photo; img.alt = ""; thumb.replaceChildren(img); }
    const copy = textNode("div", "", "item-copy"); copy.append(button(place.name, "item-name", () => { activeHome = place.homeId; activeRoom = place.name; $("#searchInput").value = ""; render(); rememberNavigation(); }), textNode("p", `${homeName(place.homeId)} · Room photo${place.notes ? ` · ${place.notes}` : ""}`, "item-meta"));
    card.append(thumb, copy); $("#inventoryList").append(card);
  });
  if (places.length) $("#resultCount").textContent = `${items.length + places.length} ${items.length + places.length === 1 ? "result" : "results"}`;
  const empty = items.length === 0 && places.length === 0;
  $("#emptyInventory").classList.toggle("visible", empty);
  const photoOnlyRoom = activeRoom !== "All" && !term && $("#statusFilter").value === "All" && state.places.some((place) => isHere(place) && place.name === activeRoom && place.photo);
  $("#emptyInventory h3").textContent = photoOnlyRoom ? "The photo has you covered." : filtered ? "Nothing on this list yet." : "A little less to remember.";
  $("#emptyInventory p").textContent = photoOnlyRoom ? "List individual items only when you want to find them by name. A photo is enough to start." : filtered ? "Try another search, clear the filters, or add what belongs here." : "Add something you always wonder about when packing. Or just take a photo of a closet.";
  $("#emptyInventory [data-add-item]").textContent = photoOnlyRoom ? "+ Add an item (optional)" : filtered ? "+ Add an item here" : "+ Your first item";
  $("#swipeHint").classList.toggle("hidden", !items.length);
}
function setupSwipe(card, itemId) {
  let start = null;
  let offset = 0;
  let suppressClick = false;
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.clientX <= 24 || event.target.closest("select")) return;
    suppressClick = false;
    start = { x: event.clientX, y: event.clientY }; offset = 0;
  });
  card.addEventListener("pointermove", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!offset && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { start = null; return; }
    if (Math.abs(dx) > 12) {
      event.preventDefault();
      offset = Math.max(-100, Math.min(100, dx)); card.classList.add("dragging"); card.style.transform = `translateX(${offset}px)`;
      if (!card.hasPointerCapture(event.pointerId)) card.setPointerCapture(event.pointerId);
    }
  });
  const reset = () => { start = null; offset = 0; card.classList.remove("dragging"); card.style.transform = ""; };
  card.addEventListener("pointerup", () => { const delta = offset; suppressClick = Math.abs(delta) > 12; reset(); if (Math.abs(delta) >= 64) updateStatus(itemId, delta > 0 ? "In stock" : "Out"); });
  card.addEventListener("pointercancel", reset);
  card.addEventListener("click", (event) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
}
async function updateStatus(itemId, status) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || status === item.status) return;
  const previous = item.status;
  item.status = status; item.updatedAt = new Date().toISOString();
  const saved = await saveState();
  if (saved === null) return;
  showToast(saved ? `${item.name}: ${statuses[status].toLowerCase()}` : "Saved on this device. Check sharing in settings.", async () => {
    const current = state.items.find((entry) => entry.id === itemId);
    if (current && current.status === status) { current.status = previous; current.updatedAt = new Date().toISOString(); savedMessage(await saveState(), "Undone."); }
  });
}
function clearFilters() { activeRoom = "All"; $("#searchInput").value = ""; $("#statusFilter").value = "All"; renderInventory(); rememberNavigation(); }
function switchView(view, remember = true) {
  activeView = view;
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("active", tab.dataset.view === view); tab.setAttribute("aria-pressed", String(tab.dataset.view === view)); });
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `${view}View`));
  if (remember) rememberNavigation();
}
function render() {
  renderHomes(); renderInventory(); renderTasks();
  const pending = state.tasks.filter((task) => isHere(task) && !task.done).length + state.items.filter((item) => isHere(item) && item.status !== "In stock").length;
  $("#tripTaskCount").textContent = pending;
  const date = new Date(state.updatedAt);
  $("#lastUpdated").textContent = Number.isNaN(date.getTime()) ? "" : `Updated ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}`;
}
function openItem() {
  editingItemId = null; itemPhoto = ""; itemPhotoChanged = false; photoJob++;
  $("#itemForm").reset(); $("#itemFormSubmit").disabled = false; $("#itemFormError").textContent = ""; $("#itemDetails").open = false;
  $("#formHeading").textContent = "Remember this."; $("#itemFormSubmit").textContent = "Save item";
  $("#deleteEditingItem").classList.add("hidden");
  fillHomeSelect($("#itemHome"), activeHome);
  $("#itemRoom").value = activeRoom === "All" ? "" : activeRoom;
  updatePhotoPreview("item", "");
  showDialog($("#itemDialog"));
}
function editItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId); if (!item) return;
  openItem(); editingItemId = itemId;
  $("#formHeading").textContent = "Right where it belongs.";
  $("#itemFormSubmit").textContent = "Save changes";
  $("#deleteEditingItem").classList.remove("hidden");
  for (const [field, selector] of Object.entries({ name: "#itemName", homeId: "#itemHome", room: "#itemRoom", category: "#itemCategory", status: "#itemStatus", quantity: "#itemQuantity", location: "#itemLocation", notes: "#itemNotes" })) $(selector).value = item[field] || "";
  itemPhoto = item.photo; updatePhotoPreview("item", itemPhoto);
}
function updatePhotoPreview(kind, photo) {
  const isItem = kind === "item";
  $(isItem ? "#photoPreviewContainer" : "#placePreviewContainer").classList.toggle("hidden", !photo);
  const img = $(isItem ? "#photoPreview" : "#placePreview");
  if (photo) img.src = photo; else img.removeAttribute("src");
  $(isItem ? "#photoInputText" : "#placePhotoLabel").textContent = photo ? "Choose a different photo" : isItem ? "Add a photo (optional)" : "Choose or take a photo";
}
function compressImage(file, maxDimension = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that photo. Try another image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not open that photo. Try a JPEG or PNG."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not prepare the photo.")); return; }
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      }; img.src = reader.result;
    }; reader.readAsDataURL(file);
  });
}
async function selectPhoto(event, kind) {
  const file = event.target.files[0]; if (!file) return;
  const job = ++photoJob;
  const submit = $(kind === "item" ? "#itemFormSubmit" : "#savePlace");
  submit.disabled = true;
  try {
    const photo = await compressImage(file);
    if (job !== photoJob) return;
    if (kind === "item") { itemPhoto = photo; itemPhotoChanged = true; } else { placePhoto = photo; placePhotoChanged = true; }
    updatePhotoPreview(kind, photo);
  } catch (error) { $(kind === "item" ? "#itemFormError" : "#placeFormError").textContent = error.message; }
  finally { if (job === photoJob) submit.disabled = false; }
}
async function cloudPhoto(photo, changed, recordId) {
  if (!changed || !photo.startsWith("data:") || !firebaseService.user) return photo;
  const blob = await (await fetch(photo)).blob();
  return firebaseService.uploadPhoto(new File([blob], "photo.jpg", { type: "image/jpeg" }), recordId);
}
async function deleteCloudPhoto(photo) {
  if (!photo || photo.startsWith("data:") || !firebaseService.user) return;
  try { await firebaseService.deletePhoto(photo); } catch (error) { console.warn("Could not remove the old cloud photo", error); }
}
async function submitItem(event) {
  event.preventDefault();
  if ($("#itemFormSubmit").disabled) return;
  const form = new FormData(event.target);
  const name = form.get("name").trim(); if (!name) { $("#itemName").focus(); return; }
  const recordId = editingItemId || id();
  const oldItem = state.items.find((item) => item.id === editingItemId);
  $("#itemFormSubmit").disabled = true; $("#itemFormError").textContent = "";
  try {
    const photo = await cloudPhoto(itemPhoto, itemPhotoChanged, recordId);
    const item = { ...oldItem, id: recordId, name, homeId: form.get("homeId"), room: form.get("room").trim() || "Unsorted", category: form.get("category"), status: form.get("status"), quantity: form.get("quantity").trim(), location: form.get("location").trim(), notes: form.get("notes").trim(), photo, updatedAt: new Date().toISOString() };
    if (oldItem) state.items = state.items.map((entry) => entry.id === recordId ? item : entry); else state.items.unshift(item);
    const saved = await saveState();
    if (saved === null) { $("#itemFormError").textContent = "Device storage is full. Your item was not saved. Export a backup in settings."; return; }
    await closeDialog($("#itemDialog"));
    activeHome = item.homeId; activeRoom = item.room; $("#searchInput").value = ""; $("#statusFilter").value = "All";
    render(); switchView("inventory");
    if (saved && oldItem?.photo && oldItem.photo !== photo) await deleteCloudPhoto(oldItem.photo);
    savedMessage(saved, `Remembered in ${homeName(item.homeId)} · ${item.room}.`);
  } catch (error) { $("#itemFormError").textContent = `Could not save the photo. ${error.message}`; }
  finally { $("#itemFormSubmit").disabled = false; }
}
async function deleteItem() {
  const item = state.items.find((entry) => entry.id === editingItemId);
  if (!item || !await confirmAction({ title: `Delete ${item.name}?`, message: "This removes the item and its photo from your inventory. This cannot be undone.", accept: "Delete item", cancel: "Keep item" })) return;
  state.items = state.items.filter((entry) => entry.id !== item.id);
  const saved = await saveState(); if (saved === null) return; await closeDialog($("#itemDialog"));
  if (saved) await deleteCloudPhoto(item.photo);
  savedMessage(saved, "Item removed.");
}
function openPlace(name = "", homeId = activeHome) {
  $("#placeForm").reset(); photoJob++; $("#savePlace").disabled = false; $("#placeFormError").textContent = "";
  fillHomeSelect($("#placeHome"), homeId);
  $("#placeName").value = name;
  const existing = state.places.find((place) => place.homeId === $("#placeHome").value && place.name === name);
  editingPlaceId = existing?.id || null; placePhoto = existing?.photo || ""; placePhotoChanged = false;
  $("#placeNotes").value = existing?.notes || "";
  updatePhotoPreview("place", placePhoto); showDialog($("#placeDialog"));
}
async function submitPlace(event) {
  event.preventDefault(); if ($("#savePlace").disabled) return;
  const homeId = $("#placeHome").value, name = $("#placeName").value.trim(); if (!name) return;
  const existing = state.places.find((place) => place.id === editingPlaceId);
  const sameName = state.places.find((place) => place.homeId === homeId && place.name.toLocaleLowerCase() === name.toLocaleLowerCase() && place.id !== editingPlaceId);
  if (sameName) { $("#placeFormError").textContent = "That spot already has a photo. Open it from the room card to update it."; return; }
  if (!placePhoto && !existing) { $("#placeFormError").textContent = "Choose a photo first. No item list needed."; return; }
  $("#savePlace").disabled = true;
  try {
    const recordId = existing?.id || id();
    const photo = await cloudPhoto(placePhoto, placePhotoChanged, recordId);
    const place = { id: recordId, homeId, name, photo, notes: $("#placeNotes").value.trim(), updatedAt: new Date().toISOString() };
    // Renaming a photographed room moves its items along with it.
    if (existing && (existing.name !== name || existing.homeId !== homeId)) state.items = state.items.map((item) => item.homeId === existing.homeId && item.room === existing.name ? { ...item, homeId, room: name } : item);
    if (existing) state.places = state.places.map((entry) => entry.id === recordId ? place : entry); else state.places.push(place);
    const saved = await saveState();
    if (saved === null) { $("#placeFormError").textContent = "Device storage is full. Your photo was not saved. Export a backup in settings."; return; }
    await closeDialog($("#placeDialog"));
    activeHome = homeId; activeRoom = name; $("#searchInput").value = "";
    render(); switchView("inventory");
    if (saved && existing?.photo && existing.photo !== photo) await deleteCloudPhoto(existing.photo);
    savedMessage(saved, `A little memory of ${name}.`);
  } catch (error) { $("#placeFormError").textContent = `Could not save the photo. ${error.message}`; }
  finally { $("#savePlace").disabled = false; }
}
function openLightbox(entry) {
  $("#lightboxImg").src = entry.photo;
  $("#lightboxImg").alt = entry.name;
  $("#lightboxTitle").textContent = entry.name;
  $("#lightboxMeta").textContent = [homeName(entry.homeId), entry.room, entry.location].filter(Boolean).join(" · ");
  $("#lightboxNotes").textContent = entry.notes || "";
  showDialog($("#lightbox"));
}
function renderTasks() {
  $("#attentionList").replaceChildren();
  state.items.filter((item) => isHere(item) && item.status !== "In stock").forEach((item) => {
    const row = textNode("article", "", "attention-item");
    const copy = textNode("div", "", "attention-copy"); copy.append(textNode("strong", item.name), textNode("p", `${statuses[item.status]} · ${homeName(item.homeId)} · ${item.room}`));
    row.append(copy, button("Have it ✓", "secondary-button", () => updateStatus(item.id, "In stock"), `Mark ${item.name} as have it`));
    $("#attentionList").append(row);
  });
  $("#taskColumns").replaceChildren();
  ["Bring", "Buy", "Check"].forEach((type) => {
    const column = textNode("section", "", "task-column"); column.append(textNode("h3", type));
    const tasks = state.tasks.filter((task) => isHere(task) && task.type === type);
    if (!tasks.length) column.append(textNode("p", "Nothing to remember here.", "task-empty"));
    tasks.forEach((task) => {
      const row = textNode("div", "", `task-item${task.done ? " done" : ""}`);
      const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = task.done;
      checkbox.addEventListener("change", async () => { task.done = checkbox.checked; await saveState(); });
      label.append(checkbox, textNode("span", `${task.text}${activeHome === "All" ? ` · ${homeName(task.homeId)}` : ""}`));
      row.append(label, button("×", "close-button", async () => { state.tasks = state.tasks.filter((entry) => entry.id !== task.id); await saveState(); }, `Delete reminder: ${task.text}`)); column.append(row);
    });
    $("#taskColumns").append(column);
  });
}
async function addTask(event) {
  event.preventDefault(); const text = $("#taskText").value.trim(); if (!text) return;
  state.tasks.unshift({ id: id(), text, type: $("#taskType").value, done: false, homeId: activeHome === "All" ? $("#taskHome").value : activeHome });
  $("#taskText").value = ""; savedMessage(await saveState(), "Added to your list.");
}
async function copyChecklist() {
  const tasks = state.tasks.filter((task) => isHere(task) && !task.done);
  const attention = state.items.filter((item) => isHere(item) && item.status !== "In stock");
  const lines = [...attention.map((item) => `- [ ] ${item.status === "Unknown" ? "Check" : "Bring or buy"} ${item.name} (${homeName(item.homeId)} · ${item.room})`), ...tasks.map((task) => `- [ ] ${task.type}: ${task.text}${activeHome === "All" ? ` (${homeName(task.homeId)})` : ""}`)];
  if (!lines.length) { showToast("Nothing on your trip list. Travel light."); return; }
  try { await navigator.clipboard.writeText(`${activeHome === "All" ? "Both homes" : homeName(activeHome)} · Trip list\n\n${lines.join("\n")}`); showToast("Trip list copied."); }
  catch { showToast("Copy wasn’t available. Try from your usual browser."); }
}
function openSettings() {
  $("#homeFields").replaceChildren(...state.homes.map((home) => {
    const label = textNode("label", home.id === "asheville" ? "Weekend place" : "Main home");
    const input = document.createElement("input"); input.name = home.id; input.value = home.name; input.required = true; input.maxLength = 80; label.append(input); return label;
  })); showDialog($("#settingsDialog"));
}
function exportData() {
  const url = URL.createObjectURL(new Blob([loadFailure ? localStorage.getItem(STORAGE_KEY) : JSON.stringify(state, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `whats-where-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const next = normalizeState(JSON.parse(await file.text()));
    if (!await confirmAction({ title: "Replace your inventory?", message: "This backup will replace both homes, room photos, and your trip list. Export a copy of the current list first if you want to keep it.", accept: "Import and replace", cancel: "Keep current list" })) return;
    loadFailure = false;
    state = next; activeRoom = "All"; $("#searchInput").value = ""; $("#statusFilter").value = "All";
    savedMessage(await saveState(), "Backup imported.");
  } catch (error) { showToast(`Could not import this file: ${error.message}`); }
  finally { event.target.value = ""; }
}
function setup() {
  $("#quickPhoto span").replaceWith(cameraIcon());
  document.querySelectorAll(".photo-input-label").forEach((label) => label.firstChild.replaceWith(cameraIcon()));
  $("#itemCategory").replaceChildren(...categories.map((category) => new Option(category, category)));
  $("#jumpToAddItem").addEventListener("click", openItem);
  document.querySelectorAll("[data-add-item]").forEach((el) => el.addEventListener("click", openItem));
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => closeDialog($("#" + el.dataset.close))));
  document.querySelectorAll("dialog:not(#confirmationDialog)").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } }));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (dialog.dataset.requireChoice !== "true") closeDialog(dialog);
  }));
  $("#itemDialog").addEventListener("close", () => { photoJob++; });
  $("#placeDialog").addEventListener("close", () => { photoJob++; });
  $("#itemForm").addEventListener("submit", submitItem);
  $("#deleteEditingItem").addEventListener("click", deleteItem);
  $("#itemPhoto").addEventListener("change", (event) => selectPhoto(event, "item"));
  $("#removePhoto").addEventListener("click", () => { photoJob++; itemPhoto = ""; itemPhotoChanged = true; $("#itemPhoto").value = ""; $("#itemFormSubmit").disabled = false; updatePhotoPreview("item", ""); });
  $("#quickPhoto").addEventListener("click", () => openPlace());
  $("#photoInstead").addEventListener("click", async () => { const room = $("#itemRoom").value, home = $("#itemHome").value; await closeDialog($("#itemDialog")); openPlace(room, home); });
  $("#placePhoto").addEventListener("change", (event) => selectPhoto(event, "place"));
  $("#removePlacePhoto").addEventListener("click", () => { photoJob++; placePhoto = ""; placePhotoChanged = true; $("#placePhoto").value = ""; $("#savePlace").disabled = false; updatePhotoPreview("place", ""); });
  $("#placeForm").addEventListener("submit", submitPlace);
  $("#searchInput").addEventListener("input", () => { const wasTrip = activeView !== "inventory"; if ($("#searchInput").value.trim()) activeRoom = "All"; switchView("inventory", false); renderInventory(); rememberNavigation(!wasTrip); });
  $("#roomFilter").addEventListener("change", (event) => { activeRoom = event.target.value; renderInventory(); rememberNavigation(); });
  $("#statusFilter").addEventListener("change", () => { renderInventory(); rememberNavigation(true); });
  $("#clearFilters").addEventListener("click", clearFilters);
  $("#backToRooms").addEventListener("click", clearFilters);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("#taskForm").addEventListener("submit", addTask);
  $("#copyChecklist").addEventListener("click", copyChecklist);
  $("#openSettings").addEventListener("click", openSettings);
  $("#homesForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.target); const names = state.homes.map((home) => String(form.get(home.id)).trim()); if (names.some((name) => !name)) return; state.homes.forEach((home, i) => { home.name = names[i]; }); savedMessage(await saveState(), "Place names saved."); });
  $("#exportData").addEventListener("click", exportData); $("#importData").addEventListener("change", importData);
  $("#signInButton").addEventListener("click", async () => { try { await firebaseService.signIn(); } catch (error) { updateSyncStatus({ mode: "error", message: `Could not sign in: ${error.message}` }); } });
  $("#signOutButton").addEventListener("click", async () => { try { await firebaseService.signOut(); } catch (error) { showToast(`Could not sign out: ${error.message}`); } });
  $("#lightboxClose").addEventListener("click", () => closeDialog($("#lightbox")));
  $("#toastUndo").addEventListener("click", () => { const action = undoAction; undoAction = null; if (action) action(); });
  render(); setupNavigation(); startFirebase();
}
setup();
