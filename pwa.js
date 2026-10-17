// Installation and keyboard layout are optional: the inventory works without them.
const installButton = document.querySelector("#installApp");
const installHelp = document.querySelector("#installHelp");
const offlineStatus = document.querySelector("#offlineStatus");
const standalone = window.matchMedia("(display-mode: standalone)");
let installPrompt = null;

function updateInstallHelp() {
  const installed = standalone.matches || navigator.standalone === true;
  installButton.classList.toggle("hidden", installed || !installPrompt);
  if (installed) installHelp.textContent = "You’re using the Home Screen app. Everything is right here.";
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallHelp();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installHelp.textContent = "Added to your apps. Open What’s where from your Home Screen.";
  installButton.classList.add("hidden");
});
standalone.addEventListener("change", updateInstallHelp);
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  installButton.classList.add("hidden");
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { /* The browser menu and Safari instructions remain available. */ }
});
updateInstallHelp();

const refreshButton = document.querySelector("#refreshApp");
const refreshStatus = document.querySelector("#refreshStatus");
let appRegistration = null;
let requestedUpdate = false;
let refreshTimer;
let statusTimer;
function refreshMessage(message) {
  clearTimeout(statusTimer);
  document.querySelector("#toast")?.classList.add("hidden");
  refreshStatus.textContent = message;
  refreshStatus.classList.remove("hidden");
  statusTimer = setTimeout(() => refreshStatus.classList.add("hidden"), 9000);
}
function canRefresh() {
  const check = new CustomEvent("whatswhere:before-refresh", { cancelable: true, detail: { message: "" } });
  const safe = document.dispatchEvent(check);
  // Also protect drafts/forms if the main app has not initialized yet.
  if (!safe || document.querySelector("dialog[open]") || document.querySelector("#taskText").value.trim()) {
    refreshMessage(check.detail.message || "Finish the open form or save your reminder before refreshing.");
    return false;
  }
  return true;
}
function reloadWhenSafe() {
  requestedUpdate = false; clearTimeout(refreshTimer);
  refreshButton.disabled = false;
  if (canRefresh()) window.location.reload();
}
function finishInstalling(worker) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (["installed", "activated"].includes(worker.state)) { cleanup(); resolve(); }
      else if (worker.state === "redundant") { cleanup(); reject(new Error("Update could not be installed.")); }
    };
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener("statechange", finish); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Update check timed out.")); }, 15000);
    worker.addEventListener("statechange", finish); finish();
  });
}
refreshButton.addEventListener("click", async () => {
  if (refreshButton.disabled || !canRefresh()) return;
  if (navigator.onLine === false) { refreshMessage("You’re offline. Connect to check for an app update."); return; }
  refreshButton.disabled = true;
  refreshMessage("Checking for updates…");
  try {
    const registration = appRegistration || await navigator.serviceWorker?.getRegistration();
    if (!registration) { reloadWhenSafe(); return; }
    await registration.update();
    if (registration.installing) await finishInstalling(registration.installing);
    if (!canRefresh()) return;
    if (registration.waiting) {
      requestedUpdate = true;
      refreshTimer = setTimeout(() => {
        requestedUpdate = false; refreshButton.disabled = false;
        refreshMessage("The update hasn’t finished yet. Tap Refresh again in a moment.");
      }, 15000);
      registration.waiting.postMessage({ type: "APPLY_UPDATE" });
    } else reloadWhenSafe();
  } catch {
    refreshMessage("Couldn’t check for an update. Your saved list is still here. Try again when connected.");
  } finally { if (!requestedUpdate) refreshButton.disabled = false; }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only the window whose user tapped Refresh may reload. Other windows keep
    // their open forms; a newly typed draft in this window also prevents reload.
    if (requestedUpdate) reloadWhenSafe();
  });
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      appRegistration = registration;
      const updateStatus = () => {
        offlineStatus.textContent = registration.waiting
          ? "An update is ready. Save what you’re doing, close this panel, then tap ↻ Refresh app."
          : registration.active
            ? "Ready to open offline. Your saved inventory stays on this device; sharing and cloud photos need a connection."
            : "Preparing this device for offline use…";
      };
      updateStatus();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", updateStatus);
      });
      navigator.serviceWorker.addEventListener("controllerchange", updateStatus);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => {});
      });
    } catch {
      offlineStatus.textContent = "Offline setup isn’t available in this browser. You can still use the inventory here.";
    }
  });
}

let viewportFrame;
function fitViewport() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(() => {
    const viewport = window.visualViewport;
    if (viewport && viewport.scale !== 1) return; // Preserve normal pinch-to-zoom.
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    const keyboardInset = Math.max(0, window.innerHeight - height - top);
    const focused = document.activeElement;
    const editing = focused?.matches("input:not([type=file]), textarea, select");
    const root = document.documentElement;
    root.style.setProperty("--visible-height", `${height}px`);
    root.style.setProperty("--visible-top", `${top}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
    root.classList.toggle("keyboard-open", Boolean(editing && window.innerHeight - height > 100));
    requestAnimationFrame(() => {
      const scroller = focused?.closest("#itemForm, #placeForm");
      if (!scroller) return;
      const field = focused.getBoundingClientRect();
      const frame = scroller.getBoundingClientRect();
      if (field.bottom > frame.bottom - 12) scroller.scrollTop += field.bottom - frame.bottom + 12;
      else if (field.top < frame.top + 12) scroller.scrollTop -= frame.top + 12 - field.top;
    });
  });
}
window.visualViewport?.addEventListener("resize", fitViewport);
window.visualViewport?.addEventListener("scroll", fitViewport);
window.addEventListener("resize", fitViewport);
document.addEventListener("focusin", fitViewport);
document.addEventListener("focusout", fitViewport);
fitViewport();
