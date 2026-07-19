import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Guard against SSR pre-rendering without credentials:
// Firebase auth validates the API key on initialization and throws at build time otherwise.
const hasConfig = Boolean(firebaseConfig.apiKey);

let app: FirebaseApp | undefined;
let auth: Auth;
let db: Firestore;

if (hasConfig) {
  const isNewApp = getApps().length === 0;
  app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  // ignoreUndefinedProperties lets writes omit `undefined` fields instead of throwing
  // (e.g. optional username/discordHandle on pre-grant and profile saves).
  // initializeFirestore can only run once per app, so reuse the instance otherwise.
  db = isNewApp
    ? initializeFirestore(app, { ignoreUndefinedProperties: true })
    : getFirestore(app);
} else {
  auth = {} as Auth;
  db = {} as Firestore;
}

export { auth, db };
export default app;
