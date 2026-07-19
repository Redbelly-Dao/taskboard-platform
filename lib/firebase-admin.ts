import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { resolve } from 'path';
import dns from 'node:dns';

// Force IPv4-first DNS resolution.
// Some environments (notably WSL2) resolve oauth2.googleapis.com to an IPv6 address that Node tries first and hangs on,
// causing the Admin SDK token fetch to fail with
// "request to https://oauth2.googleapis.com/token failed, reason:" (an ETIMEDOUT).
dns.setDefaultResultOrder('ipv4first');

let adminApp: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (adminApp) return adminApp;

  if (admin.apps.length > 0) {
    adminApp = admin.apps[0]!;
    return adminApp;
  }

  try {
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PROJECT_ID) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      // Fallback for local development using the service account key file
      // The file should be at the project root: service-account-key.json
      const serviceAccountPath = resolve(process.cwd(), 'service-account-key.json');
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        throw new Error(
          `Firebase Admin credentials not found. ` +
          `Either set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY env vars, ` +
          `or place a service-account-key.json file in the project root (${serviceAccountPath}).`
        );
      }
    }
    return adminApp;
  } catch (err: any) {
    console.error('Failed to initialize Firebase Admin:', err);
    throw new Error(err.message || 'Firebase Admin initialization failed. Check your service account credentials.');
  }
}

export function getAdminAuth() {
  return admin.auth(getAdminApp());
}

export function getAdminFirestore() {
  return admin.firestore(getAdminApp());
}
