import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Database } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export interface GoogleUserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
}

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
  authApi: typeof import("firebase/auth");
  db: typeof import("firebase/database");
}

interface FirebaseContext extends FirebaseServices {
  user: User;
}

let servicesPromise: Promise<FirebaseServices> | null = null;

function isGoogleUser(user: User | null): user is User {
  return Boolean(user?.providerData.some((provider) => provider.providerId === "google.com"));
}

function profile(user: User): GoogleUserProfile {
  return {
    uid: user.uid,
    displayName: user.displayName?.trim() || user.email?.split("@")[0] || "Google user",
    email: user.email ?? "",
    photoURL: user.photoURL,
  };
}

async function getFirebaseServices(): Promise<FirebaseServices> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase environment variables are not configured.");
  }
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [appApi, authApi, db] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/database"),
      ]);
      const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(firebaseConfig);
      const auth = authApi.getAuth(app);
      await authApi.setPersistence(auth, authApi.browserLocalPersistence);
      return { app, auth, database: db.getDatabase(app), authApi, db };
    })();
  }
  return servicesPromise;
}

export async function getFirebaseContext(): Promise<FirebaseContext> {
  const services = await getFirebaseServices();
  await services.auth.authStateReady();
  const user = services.auth.currentUser;
  if (!isGoogleUser(user)) {
    throw new Error("Sign in with Google to use multiplayer.");
  }
  return { ...services, user };
}

export async function signInWithGoogle(): Promise<GoogleUserProfile> {
  const { auth, authApi } = await getFirebaseServices();
  await auth.authStateReady();
  const provider = new authApi.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  let result;
  if (auth.currentUser?.isAnonymous) {
    try {
      result = await authApi.linkWithPopup(auth.currentUser, provider);
    } catch (reason) {
      const code = (reason as { code?: string }).code;
      if (code !== "auth/credential-already-in-use" && code !== "auth/email-already-in-use") {
        throw reason;
      }
      result = await authApi.signInWithPopup(auth, provider);
    }
  } else {
    result = await authApi.signInWithPopup(auth, provider);
  }
  if (!isGoogleUser(result.user)) throw new Error("Google sign-in did not complete.");
  return profile(result.user);
}

export async function signOutFirebase(): Promise<void> {
  const { auth, authApi } = await getFirebaseServices();
  await authApi.signOut(auth);
}

export async function observeGoogleUser(
  listener: (user: GoogleUserProfile | null) => void,
): Promise<() => void> {
  const { auth, authApi } = await getFirebaseServices();
  return authApi.onAuthStateChanged(auth, (user) => listener(isGoogleUser(user) ? profile(user) : null));
}
