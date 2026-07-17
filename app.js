import { firebaseService } from "./firebase-client.js";

const STORAGE_KEY = "asheville-condo-tracker-v1";

const rooms = [
  "Kitchen",
  "Pantry",
  "Bathroom",
  "Bedroom",
  "Linens",
  "Cleaning",
  "Storage",
  "Tools",
  "Tech",
  "Other"
];

const categories = [
  "Food",
  "Paper goods",
  "Toiletries",
  "Linens",
  "Cleaning",
  "Appliances",
  "Tools",
  "Guest supplies",
  "Tech",
  "Other"
];

const starterItems = [
  {
    name: "Coffee filters",
    room: "Pantry",
    category: "Food",
    status: "Running low",
    quantity: "Half pack",
    location: "Pantry top shelf",
    notes: "Check before next weekend trip."
  },
  {
    name: "Bath towels",
    room: "Linens",
    category: "Linens",
    status: "In stock",
    quantity: "6",
    location: "Hall closet",
    notes: "Two guest sets and two extras."
  },
  {
    name: "Paper towels",
    room: "Kitchen",
    category: "Paper goods",
    status: "Out",
    quantity: "0",
    location: "Under sink",
    notes: "Buy a compact pack locally."
  },
  {
    name: "Phone charger",
    room: "Bedroom",
    category: "Tech",
    status: "Unknown",
    quantity: "",
    location: "Nightstand drawer",
    notes: "Confirm USB-C cable is still there."
  }
];

const starterTasks = [
  { text: "Bring AA batteries", type: "Bring", done: false },
  { text: "Buy paper towels", type: "Buy", done: false },
  { text: "Check shower supplies", type: "Check", done: false }
];

let state = loadState();
let activeStatus = "All";
let activeView = "inventory";
let applyingRemoteState = false;
let editingItemId = null;
let currentPhotoDataUrl = "";
let originalSelectedFile = null;

const els = {
  itemForm: document.querySelector("#itemForm"),
  taskForm: document.querySelector("#taskForm"),
  inventoryList: document.querySelector("#inventoryList"),
  emptyInventory: document.querySelector("#emptyInventory"),
  taskColumns: document.querySelector("#taskColumns"),
  photoGrid: document.querySelector("#photoGrid"),
  emptyPhotos: document.querySelector("#emptyPhotos"),
  itemTemplate: document.querySelector("#itemTemplate"),
  searchInput: document.querySelector("#searchInput"),
  roomFilter: document.querySelector("#roomFilter"),
  totalItems: document.querySelector("#totalItems"),
  attentionItems: document.querySelector("#attentionItems"),
  tripTaskCount: document.querySelector("#tripTaskCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  attentionList: document.querySelector("#attentionList"),
  syncDot: document.querySelector("#syncDot"),
  syncMode: document.querySelector("#syncMode"),
  syncMessage: document.querySelector("#syncMessage"),
  signInButton: document.querySelector("#signInButton"),
  signOutButton: document.querySelector("#signOutButton"),
  formHeading: document.querySelector("#formHeading"),
  itemFormSubmit: document.querySelector("#itemFormSubmit"),
  cancelEdit: document.querySelector("#cancelEdit"),
  photoPreviewContainer: document.querySelector("#photoPreviewContainer"),
  photoPreview: document.querySelector("#photoPreview"),
  removePhoto: document.querySelector("#removePhoto"),
  copyChecklist: document.querySelector("#copyChecklist"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImg: document.querySelector("#lightboxImg"),
  lightboxTitle: document.querySelector("#lightboxTitle"),
  lightboxMeta: document.querySelector("#lightboxMeta"),
  lightboxNotes: document.querySelector("#lightboxNotes"),
  lightboxClose: document.querySelector("#lightboxClose")
};

function loadState() {
  const fallback = { items: [], tasks: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();

  if (!applyingRemoteState) {
    await saveCloudState();
  }
}

async function saveCloudState() {
  try {
    await firebaseService.saveState(state);
  } catch (error) {
    updateSyncStatus({ mode: "error", message: `Cloud save failed: ${friendlyFirebaseError(error)}` });
  }
}

function id() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fillSelect(select, options, includeAll = false) {
  select.innerHTML = "";
  if (includeAll) {
    select.append(new Option("All rooms", "All"));
  }
  options.forEach((option) => select.append(new Option(option, option)));
}

function setup() {
  fillSelect(document.querySelector("#itemRoom"), rooms);
  fillSelect(document.querySelector("#itemCategory"), categories);
  fillSelect(els.roomFilter, rooms, true);

  els.itemForm.addEventListener("submit", handleItemFormSubmit);
  els.taskForm.addEventListener("submit", addTask);
  els.searchInput.addEventListener("input", renderInventory);
  els.roomFilter.addEventListener("change", renderInventory);
  document.querySelector("#clearFilters").addEventListener("click", clearFilters);
  document.querySelector("#seedExamples").addEventListener("click", addStarterSet);
  document.querySelector("#exportData").addEventListener("click", exportData);
  document.querySelector("#importData").addEventListener("change", importData);
  document.querySelector("[data-jump-view='trip']").addEventListener("click", () => switchView("trip"));
  els.signInButton.addEventListener("click", signIn);
  els.signOutButton.addEventListener("click", signOut);

  document.querySelector("#itemPhoto").addEventListener("change", handlePhotoSelect);
  els.removePhoto.addEventListener("click", handlePhotoRemove);
  els.cancelEdit.addEventListener("click", cancelEditMode);
  els.copyChecklist.addEventListener("click", copyChecklist);
  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", (e) => { if (e.target === els.lightbox) closeLightbox(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      activeStatus = button.dataset.status;
      document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.remove("active"));
      button.classList.add("active");
      renderInventory();
    });
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  render();
  startFirebase();
}

function startFirebase() {
  firebaseService.init({
    onStatus: updateSyncStatus,
    onState: async (remoteState) => {
      if (!remoteState) {
        if (state.items.length || state.tasks.length) {
          await saveCloudState();
        }
        return;
      }

      applyingRemoteState = true;
      state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      applyingRemoteState = false;
    }
  });
}

function updateSyncStatus(status) {
  const mode = status.mode || "local";
  els.syncDot.className = `sync-dot ${mode}`;
  els.syncMode.textContent = labelForSyncMode(mode);
  els.syncMessage.textContent = status.message || "";
  els.signInButton.classList.toggle("hidden", !firebaseService.enabled || Boolean(firebaseService.user));
  els.signOutButton.classList.toggle("hidden", !firebaseService.enabled || !firebaseService.user);
}

function labelForSyncMode(mode) {
  if (mode === "cloud") return "Cloud Sync";
  if (mode === "signed-out") return "Firebase Ready";
  if (mode === "error") return "Sync Needs Attention";
  return "Local Mode";
}

async function signIn() {
  try {
    await firebaseService.signIn();
  } catch (error) {
    updateSyncStatus({ mode: "error", message: `Sign in failed: ${friendlyFirebaseError(error)}` });
  }
}

async function signOut() {
  try {
    await firebaseService.signOut();
  } catch (error) {
    updateSyncStatus({ mode: "error", message: `Sign out failed: ${friendlyFirebaseError(error)}` });
  }
}

function compressImage(file, maxDimension = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
    };
  });
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  originalSelectedFile = file;
  
  const compressedDataUrl = await compressImage(file);
  currentPhotoDataUrl = compressedDataUrl;
  
  els.photoPreview.src = compressedDataUrl;
  els.photoPreviewContainer.classList.remove("hidden");
}

function handlePhotoRemove() {
  currentPhotoDataUrl = "";
  originalSelectedFile = null;
  document.querySelector("#itemPhoto").value = "";
  els.photoPreview.src = "";
  els.photoPreviewContainer.classList.add("hidden");
}

async function handleItemFormSubmit(event) {
  event.preventDefault();
  const form = new FormData(els.itemForm);
  const name = form.get("name").trim();
  const room = form.get("room");
  const category = form.get("category");
  const status = form.get("status");
  const quantity = form.get("quantity").trim();
  const location = form.get("location").trim();
  const notes = form.get("notes").trim();

  let photo = "";
  const itemId = editingItemId || id();

  if (currentPhotoDataUrl) {
    if (currentPhotoDataUrl.startsWith("data:")) {
      if (firebaseService.enabled && firebaseService.user && originalSelectedFile) {
        try {
          const blob = dataURLtoBlob(currentPhotoDataUrl);
          const fileToUpload = new File([blob], originalSelectedFile.name || "photo.jpg", { type: "image/jpeg" });
          photo = await firebaseService.uploadPhoto(fileToUpload, itemId);
        } catch (error) {
          console.error("Cloud photo upload failed, using local fallback", error);
          photo = currentPhotoDataUrl;
        }
      } else {
        photo = currentPhotoDataUrl;
      }
    } else {
      photo = currentPhotoDataUrl;
    }
  }

  if (editingItemId) {
    state.items = state.items.map((item) =>
      item.id === editingItemId
        ? {
            ...item,
            name,
            room,
            category,
            status,
            quantity,
            location,
            notes,
            photo: photo || item.photo,
            updatedAt: new Date().toISOString()
          }
        : item
    );
    cancelEditMode();
  } else {
    state.items.unshift({
      id: itemId,
      name,
      room,
      category,
      status,
      quantity,
      location,
      notes,
      photo,
      updatedAt: new Date().toISOString()
    });
    
    els.itemForm.reset();
    handlePhotoRemove();
  }

  await saveState();
}

function editItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  editingItemId = itemId;
  
  document.querySelector("#itemName").value = item.name;
  document.querySelector("#itemRoom").value = item.room;
  document.querySelector("#itemCategory").value = item.category;
  document.querySelector("#itemStatus").value = item.status;
  document.querySelector("#itemQuantity").value = item.quantity || "";
  document.querySelector("#itemLocation").value = item.location || "";
  document.querySelector("#itemNotes").value = item.notes || "";
  
  document.querySelector("#itemPhoto").value = "";
  
  if (item.photo) {
    currentPhotoDataUrl = item.photo;
    els.photoPreview.src = item.photo;
    els.photoPreviewContainer.classList.remove("hidden");
  } else {
    currentPhotoDataUrl = "";
    els.photoPreview.src = "";
    els.photoPreviewContainer.classList.add("hidden");
  }

  els.formHeading.textContent = "Edit Item";
  els.itemFormSubmit.textContent = "Save Changes";
  els.cancelEdit.classList.remove("hidden");

  els.itemForm.scrollIntoView({ behavior: "smooth" });
}

function cancelEditMode() {
  editingItemId = null;
  els.itemForm.reset();
  handlePhotoRemove();

  els.formHeading.textContent = "Add Item";
  els.itemFormSubmit.textContent = "Add item";
  els.cancelEdit.classList.add("hidden");
}

async function addPrepTaskFromItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  let taskType = "Check";
  if (item.status === "Out" || item.status === "Running low") {
    const buyCategories = ["Food", "Paper goods", "Toiletries", "Cleaning"];
    if (buyCategories.includes(item.category)) {
      taskType = "Buy";
    } else {
      taskType = "Bring";
    }
  } else {
    if (item.status === "In stock") {
      taskType = "Check";
    } else {
      taskType = "Bring";
    }
  }

  const taskText = `${item.status === "Out" ? "Buy" : item.status === "Running low" ? "Restock" : "Check"} ${item.name} (${item.room}${item.location ? ` - ${item.location}` : ""})`;

  state.tasks.unshift({
    id: id(),
    text: taskText,
    type: taskType,
    done: false
  });

  await saveState();
}

async function addTask(event) {
  event.preventDefault();
  const textInput = document.querySelector("#taskText");
  const text = textInput.value.trim();
  if (!text) return;

  state.tasks.unshift({
    id: id(),
    text,
    type: document.querySelector("#taskType").value,
    done: false
  });
  els.taskForm.reset();
  await saveState();
}

async function addStarterSet() {
  if (state.items.length || state.tasks.length) {
    const confirmed = window.confirm("Add the starter examples to your current tracker?");
    if (!confirmed) return;
  }

  state.items = [
    ...starterItems.map((item) => ({ ...item, id: id(), photo: "", updatedAt: new Date().toISOString() })),
    ...state.items
  ];
  state.tasks = [
    ...starterTasks.map((task) => ({ ...task, id: id() })),
    ...state.tasks
  ];
  await saveState();
}

function render() {
  renderSummary();
  renderAttention();
  renderInventory();
  renderTasks();
  renderPhotos();
}

function renderSummary() {
  const attention = state.items.filter((item) => ["Running low", "Out", "Unknown"].includes(item.status)).length;
  const openTasks = state.tasks.filter((task) => !task.done).length;
  els.totalItems.textContent = state.items.length;
  els.attentionItems.textContent = attention;
  els.tripTaskCount.textContent = openTasks;
  els.lastUpdated.textContent = formatDate(state.updatedAt);
}

function renderAttention() {
  const attentionItems = state.items
    .filter((item) => ["Running low", "Out", "Unknown"].includes(item.status))
    .slice(0, 6);

  els.attentionList.innerHTML = "";

  if (!attentionItems.length) {
    const empty = document.createElement("div");
    empty.className = "attention-empty";
    empty.textContent = "Nothing needs attention right now.";
    els.attentionList.append(empty);
    return;
  }

  attentionItems.forEach((item) => {
    const row = document.createElement("article");
    row.className = "attention-item";
    row.innerHTML = `
      <span class="status-dot ${statusClass(item.status)}"></span>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.status)} / ${escapeHtml(item.room)}${item.location ? ` / ${escapeHtml(item.location)}` : ""}</p>
      </div>
    `;
    els.attentionList.append(row);
  });
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === activeView));
  document.querySelectorAll(".view").forEach((viewEl) => viewEl.classList.toggle("active", viewEl.id === `${activeView}View`));
}

function renderInventory() {
  const filtered = getFilteredItems();
  els.inventoryList.innerHTML = "";
  els.emptyInventory.classList.toggle("visible", filtered.length === 0);

  filtered.forEach((item) => {
    const card = els.itemTemplate.content.firstElementChild.cloneNode(true);
    const photo = card.querySelector(".item-photo");
    photo.src = item.photo || "";
    photo.alt = item.photo ? `${item.name} photo` : "";

    if (item.photo) {
      photo.style.cursor = "pointer";
      photo.addEventListener("click", () => openLightbox(item));
    }

    card.querySelector("h3").textContent = item.name;
    card.querySelector(".status-pill").textContent = item.status;
    card.querySelector(".status-pill").className = `status-pill ${statusClass(item.status)}`;
    card.querySelector(".item-meta").textContent = metaText(item);
    card.querySelector(".item-notes").textContent = item.notes || "";

    card.querySelector(".edit-item").addEventListener("click", () => editItem(item.id));
    card.querySelector(".prep-item").addEventListener("click", () => addPrepTaskFromItem(item.id));
    card.querySelector(".mark-low").addEventListener("click", () => updateStatus(item.id, "Running low"));
    card.querySelector(".mark-out").addEventListener("click", () => updateStatus(item.id, "Out"));
    card.querySelector(".mark-stock").addEventListener("click", () => updateStatus(item.id, "In stock"));
    card.querySelector(".delete-item").addEventListener("click", () => deleteItem(item.id));

    els.inventoryList.append(card);
  });
}

function getFilteredItems() {
  const term = els.searchInput.value.trim().toLowerCase();
  const room = els.roomFilter.value;

  return state.items.filter((item) => {
    const matchesStatus = activeStatus === "All" || item.status === activeStatus;
    const matchesRoom = room === "All" || item.room === room;
    const haystack = [item.name, item.room, item.category, item.quantity, item.location, item.notes].join(" ").toLowerCase();
    return matchesStatus && matchesRoom && haystack.includes(term);
  });
}

function metaText(item) {
  const parts = [item.room, item.category];
  if (item.quantity) parts.push(`Qty: ${item.quantity}`);
  if (item.location) parts.push(item.location);
  return parts.join(" / ");
}

function statusClass(status) {
  if (status === "Running low") return "low";
  if (status === "Out") return "out";
  if (status === "Unknown") return "unknown";
  return "";
}

async function updateStatus(itemId, status) {
  state.items = state.items.map((item) => item.id === itemId ? { ...item, status, updatedAt: new Date().toISOString() } : item);
  await saveState();
}

async function deleteItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !window.confirm(`Delete ${item.name}?`)) return;
  state.items = state.items.filter((entry) => entry.id !== itemId);
  if (editingItemId === itemId) {
    cancelEditMode();
  }
  await saveState();
}

function clearFilters() {
  activeStatus = "All";
  els.searchInput.value = "";
  els.roomFilter.value = "All";
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.status === "All"));
  renderInventory();
}

function renderTasks() {
  const taskTypes = ["Bring", "Buy", "Check"];
  els.taskColumns.innerHTML = "";

  taskTypes.forEach((type) => {
    const column = document.createElement("section");
    column.className = "task-column";
    column.innerHTML = `<h3>${type}</h3>`;

    state.tasks
      .filter((task) => task.type === type)
      .forEach((task) => {
        const row = document.createElement("div");
        row.className = `task-item ${task.done ? "done" : ""}`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.done;
        checkbox.addEventListener("change", () => toggleTask(task.id));

        const text = document.createElement("span");
        text.textContent = task.text;

        const remove = document.createElement("button");
        remove.className = "icon-button";
        remove.type = "button";
        remove.title = "Delete task";
        remove.setAttribute("aria-label", "Delete task");
        remove.textContent = "X";
        remove.addEventListener("click", () => deleteTask(task.id));

        row.append(checkbox, text, remove);
        column.append(row);
      });

    els.taskColumns.append(column);
  });
}

async function toggleTask(taskId) {
  state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
  await saveState();
}

async function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  await saveState();
}

function renderPhotos() {
  const itemsWithPhotos = state.items.filter((item) => item.photo);
  els.photoGrid.innerHTML = "";
  els.emptyPhotos.classList.toggle("visible", itemsWithPhotos.length === 0);

  itemsWithPhotos.forEach((item) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.innerHTML = `
      <img src="${item.photo}" alt="${escapeHtml(item.name)} photo">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.room)} / ${escapeHtml(item.location || item.category)}</p>
      </div>
    `;

    const img = card.querySelector("img");
    img.style.cursor = "pointer";
    img.addEventListener("click", () => openLightbox(item));

    els.photoGrid.append(card);
  });
}

function openLightbox(item) {
  els.lightboxImg.src = item.photo;
  els.lightboxImg.alt = `${item.name} photo`;
  els.lightboxTitle.textContent = item.name;
  els.lightboxMeta.textContent = `${item.room} / ${item.location || item.category}`;
  els.lightboxNotes.textContent = item.notes || "No notes provided.";
  els.lightbox.classList.remove("hidden");
}

function closeLightbox() {
  els.lightbox.classList.add("hidden");
}

async function copyChecklist() {
  const activeTasks = state.tasks.filter((task) => !task.done);
  if (!activeTasks.length) {
    window.alert("No incomplete tasks in your prep checklist to copy!");
    return;
  }

  const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  let text = `# Asheville Condo Prep Checklist - ${dateStr}\n\n`;

  const types = ["Bring", "Buy", "Check"];
  types.forEach((type) => {
    const typeTasks = activeTasks.filter((t) => t.type === type);
    if (typeTasks.length) {
      text += `## ${type}\n`;
      typeTasks.forEach((t) => {
        text += `- [ ] ${t.text}\n`;
      });
      text += `\n`;
    }
  });

  try {
    await navigator.clipboard.writeText(text.trim());
    els.copyChecklist.classList.add("copied");
    const originalText = els.copyChecklist.textContent;
    els.copyChecklist.textContent = "Copied!";
    setTimeout(() => {
      els.copyChecklist.classList.remove("copied");
      els.copyChecklist.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error("Clipboard copy failed", err);
    window.alert("Could not copy checklist to clipboard. Please copy manually.");
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `asheville-condo-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const nextState = JSON.parse(await file.text());
    if (!Array.isArray(nextState.items) || !Array.isArray(nextState.tasks)) {
      throw new Error("Invalid tracker backup");
    }
    state = {
      items: nextState.items,
      tasks: nextState.tasks,
      updatedAt: new Date().toISOString()
    };
    await saveState();
  } catch (error) {
    window.alert(`Could not import this file: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function formatDate(value) {
  if (!value) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function friendlyFirebaseError(error) {
  const message = error?.message || String(error);
  const code = error?.code || "";

  if (code.includes("configuration-not-found") || message.includes("configuration-not-found")) {
    return "Firebase Authentication is not enabled yet. In Firebase, open Authentication, click Get started, then enable Google sign-in.";
  }

  if (message.includes("firestore.googleapis.com") || message.includes("Cloud Firestore API")) {
    return "Cloud Firestore is not enabled yet. In Firebase, open Firestore Database and create the database.";
  }

  if (message.includes("storage") || message.includes("bucket")) {
    return "Firebase Storage is not set up yet. In Firebase, open Storage and click Get started.";
  }

  return message;
}

setup();
