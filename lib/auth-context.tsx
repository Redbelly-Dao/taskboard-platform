"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  signInWithCustomToken,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { TaskCategory } from "./tasks";

export type UserRole = "contributor" | "reviewer" | "admin";

export interface AppUser {
  uid: string;
  walletAddress: string;
  email: string;
  role: UserRole;
  discordHandle?: string;
  username?: string; // unique platform username (can differ from DC)
  suspended?: boolean;
  approved?: boolean;
  createdAt: Date;
  submittedTaskIds?: string[]; // every taskId this user has ever submitted to; backs the reviewer conflict-of-interest rule
  cycleCounts?: Record<string, number>; // submissions made per cycle, e.g. { "3": 2 }; backs the per-cycle submission cap
}

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  register: (walletAddress: string, password: string, discordHandle?: string, username?: string) => Promise<void>;
  login: (walletAddress: string, password: string) => Promise<void>;
  walletRegister: (walletAddress: string, signature: string, message: string, discordHandle?: string, username?: string, acceptedTermsVersion?: string) => Promise<void>;
  walletLogin: (walletAddress: string, signature: string, message: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Turns a thrown auth error into something a contributor can act on.
 *
 * Without this the register and login forms print the SDK string verbatim, so a blocked request reads as
 * "Firebase: Error (auth/network-request-failed)." and tells the person nothing about what to do.
 *
 * The network case matters most. /api/wallet-auth creates the Auth user, writes users/{uid} and consumes any
 * pending grant before it mints the custom token, so by the time the client sign-in can fail the account already
 * exists. Telling them registration failed is wrong: they are registered, and signing in will work once whatever
 * is blocking googleapis.com is out of the way.
 */
export function describeAuthError(err: unknown, context: "register" | "login"): string {
  const e = err as { code?: string; shortMessage?: string; message?: string };
  const code = e?.code || "";

  if (code === "auth/network-request-failed") {
    const tail =
      "Your browser could not reach Google's sign-in service. An ad blocker, privacy extension, VPN or network firewall is the usual cause. Turn it off for this site and try again.";
    return context === "register"
      ? `Your account was created, but signing you in did not finish. ${tail} Use Sign in with the same wallet once it is.`
      : tail;
  }

  switch (code) {
    case "auth/too-many-requests":
      return "Too many attempts from this device. Wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been suspended. Reach out in the #DAO TASKBOARD channel.";
    case "auth/invalid-custom-token":
    case "auth/custom-token-mismatch":
      return "The sign-in token was rejected. Refresh the page and try again, and tell an admin if it keeps happening.";
    default:
      // wagmi and viem put the useful sentence in shortMessage; Firebase and everything else use message.
      return e?.shortMessage || e?.message || "Something went wrong. Please try again.";
  }
}

// We use wallet address as the "email" in Firebase Auth by appending a domain to make it a valid email format
const walletToEmail = (wallet: string) =>
  `${wallet.toLowerCase()}@redbelly-taskboard.dao`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setAppUser(snap.data() as AppUser);
          }
        } catch (err) {
          // Firestore unreachable (e.g. ad-blocker on localhost).
          // Auth still works: the user is logged in but appUser stays null until reload.
          console.warn("Could not load user profile from Firestore:", err);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const register = async (walletAddress: string, password: string, discordHandle?: string, username?: string) => {
    const email = walletToEmail(walletAddress);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser: AppUser = {
      uid: cred.user.uid,
      walletAddress: walletAddress.toLowerCase(),
      email,
      role: "contributor",
      discordHandle: discordHandle || "",
      username: username || "",
      createdAt: new Date(),
    };
    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        ...newUser,
        createdAt: serverTimestamp(),
      });
    } catch (firestoreErr) {
      // Roll back the Auth user so the email isn't orphaned for future attempts
      await cred.user.delete();
      throw firestoreErr;
    }
    setAppUser(newUser);
  };

  const login = async (walletAddress: string, password: string) => {
    const email = walletToEmail(walletAddress);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    setAppUser(null);
  };

  const walletRegister = async (walletAddress: string, signature: string, message: string, discordHandle?: string, username?: string, acceptedTermsVersion?: string) => {
    const res = await fetch("/api/wallet-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, message, signature, isRegister: true, discordHandle, username, acceptedTermsVersion }),
    });
    const data = await res.json();
    if (!res.ok || !data.customToken) throw new Error(data.error || "Wallet auth failed");

    const cred = await signInWithCustomToken(auth, data.customToken);

    // Server now handles profile (including pending pre-grant and wallet-based migration).
    // Guarded for the same reason as the read in onAuthStateChanged: the custom token has already been accepted,
    // so the account IS signed in, and letting a Firestore read throw here aborts the redirect and shows the raw
    // Firestore message on the login form, which reads as "signing in failed" when it did not.
    let snap;
    try {
      snap = await getDoc(doc(db, "users", cred.user.uid));
    } catch (err) {
      console.warn("Signed in, but the profile read failed. onAuthStateChanged will retry it:", err);
      return;
    }
    if (snap.exists()) {
      setAppUser(snap.data() as AppUser);
    } else {
      const fallback: AppUser = {
        uid: cred.user.uid,
        walletAddress: walletAddress.toLowerCase(),
        email: `${walletAddress.toLowerCase()}@redbelly-taskboard.dao`,
        role: "contributor",
        createdAt: new Date(),
      };
      setAppUser(fallback);
    }
  };

  const walletLogin = async (walletAddress: string, signature: string, message: string) => {
    const res = await fetch("/api/wallet-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, message, signature, isRegister: false }),
    });
    const data = await res.json();
    if (!res.ok || !data.customToken) throw new Error(data.error || "Wallet auth failed");

    const cred = await signInWithCustomToken(auth, data.customToken);

    // Fetch existing profile (role etc may have been pre-granted or migrated).
    // Guarded: see walletRegister above. A failed read must not undo a successful sign-in.
    let snap;
    try {
      snap = await getDoc(doc(db, "users", cred.user.uid));
    } catch (err) {
      console.warn("Signed in, but the profile read failed. onAuthStateChanged will retry it:", err);
      return;
    }
    if (snap.exists()) {
      setAppUser(snap.data() as AppUser);
    } else {
      // fallback
      const fallback: AppUser = {
        uid: cred.user.uid,
        walletAddress: walletAddress.toLowerCase(),
        email: `${walletAddress.toLowerCase()}@redbelly-taskboard.dao`,
        role: "contributor",
        createdAt: new Date(),
      };
      setAppUser(fallback);
    }
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, register, login, walletRegister, walletLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
