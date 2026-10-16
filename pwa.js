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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      const updateStatus = () => {
        offlineStatus.textContent = registration.waiting
          ? "An update is ready. Close all What’s where windows and reopen to use it."
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
