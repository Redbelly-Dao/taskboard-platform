import { Storage } from "@google-cloud/storage";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const corsConfig = JSON.parse(
  readFileSync(resolve(root, "storage.cors.json"), "utf8")
);

const keyPath = resolve(root, "service-account-key.json");
const storage = new Storage({ keyFilename: keyPath });

const bucket = storage.bucket("dao-taskboard.firebasestorage.app");

await bucket.setCorsConfiguration(corsConfig);
console.log("CORS configured successfully on dao-taskboard.firebasestorage.app");
