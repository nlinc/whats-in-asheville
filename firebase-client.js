import { firebaseConfig, householdId } from "./firebase-config.js";

const sdkVersion = "10.12.5";
const hasConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let auth;
let db;
let storage;
let docRef;
let unsubscribeState = null;

const service = {
  enabled: hasConfig,
  user: null,
  ready: false,
  async init({ onStatus, onState }) {
    if (!hasConfig) {
      onStatus({ mode: "local", message: "Saved on this device. Shared lists are not configured." });
      return;
    }

    if (navigator.onLine === false) {
      onStatus({ mode: "local", message: "Offline. Your saved inventory is available on this device. Connect to share changes." });
      window.addEventListener("online", () => service.init({ onStatus, onState }), { once: true });
      return;
    }

    try {
      const appModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-app.js`);
      const authModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-auth.js`);
      const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-firestore.js`);
      const storageModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-storage.js`);

      const app = appModule.initializeApp(firebaseConfig);
      auth = authModule.getAuth(app);
      db = firestoreModule.getFirestore(app);
      storage = storageModule.getStorage(app);
      docRef = firestoreModule.doc(db, "households", householdId);

      await authModule.setPersistence(auth, authModule.browserLocalPersistence);

      authModule.onAuthStateChanged(auth, (user) => {
        service.user = user;
        service.ready = false;

        if (unsubscribeState) {
          unsubscribeState();
          unsubscribeState = null;
        }

        if (!user) {
          onStatus({ mode: "signed-out", message: "Sign in to sync with Firebase." });
          return;
        }

        onStatus({ mode: "loading", message: `Opening the shared list for ${user.displayName || user.email}…` });
        unsubscribeState = firestoreModule.onSnapshot(docRef, (snapshot) => {
          service.ready = true;
          onStatus({ mode: "cloud", message: `Shared as ${user.displayName || user.email}.` });
          if (!snapshot.exists()) {
            onState(null);
            return;
          }
          const data = snapshot.data();
          onState({
            homes: data.homes,
            places: data.places,
            items: Array.isArray(data.items) ? data.items : [],
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            updatedAt: data.updatedAt || new Date().toISOString()
          });
        }, (error) => {
          onStatus({ mode: "error", message: `Firebase sync error: ${error.message}` });
        });
      });

      onStatus({ mode: "signed-out", message: "Firebase ready. Sign in to sync." });
    } catch (error) {
      onStatus({ mode: "error", message: `Firebase setup failed: ${friendlyFirebaseError(error)}` });
    }
  },
  async signIn() {
    if (!auth) throw new Error("Sharing is still connecting. Try again in a moment.");
    const authModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-auth.js`);
    const provider = new authModule.GoogleAuthProvider();
    await authModule.signInWithPopup(auth, provider);
  },
  async signOut() {
    if (!auth) throw new Error("Sharing is still connecting. Try again in a moment.");
    const authModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-auth.js`);
    await authModule.signOut(auth);
  },
  async saveState(state) {
    if (!docRef || !service.user || !service.ready) throw new Error("The shared list is still loading. Your changes are saved on this device.");
    const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-firestore.js`);
    await firestoreModule.setDoc(docRef, {
      ...state,
      householdId,
      updatedAt: new Date().toISOString(),
      updatedBy: {
        uid: service.user.uid,
        email: service.user.email || "",
        name: service.user.displayName || ""
      }
    }, { merge: true });
  },
  async uploadPhoto(file, itemId) {
    if (!storage || !service.user || !file || !file.size) return "";
    const storageModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-storage.js`);
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    const photoRef = storageModule.ref(storage, `households/${householdId}/items/${itemId}/${Date.now()}-${safeName}`);
    await storageModule.uploadBytes(photoRef, file, { contentType: file.type });
    return storageModule.getDownloadURL(photoRef);
  },
  async deletePhoto(photoUrl) {
    if (!storage || !service.user || !photoUrl || photoUrl.startsWith("data:")) return;
    const storageModule = await import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-storage.js`);
    await storageModule.deleteObject(storageModule.ref(storage, photoUrl));
  }
};

function friendlyFirebaseError(error) {
  const message = error?.message || String(error);
  const code = error?.code || "";

  if (code.includes("configuration-not-found") || message.includes("configuration-not-found")) {
    return "Firebase Authentication is not enabled yet. Open Authentication, click Get started, then enable Google sign-in.";
  }

  if (message.includes("firestore.googleapis.com") || message.includes("Cloud Firestore API")) {
    return "Cloud Firestore is not enabled yet. Open Firestore Database and create the database.";
  }

  if (message.includes("storage") || message.includes("bucket")) {
    return "Firebase Storage is not set up yet. Open Storage and click Get started.";
  }

  return message;
}

export { service as firebaseService };
