import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const pngSize = (path) => {
  const bytes = readFileSync(new URL(path, root));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${path} must be a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const manifest = read("app/manifest.ts");
for (const value of [
  'display: "standalone"',
  'sizes: "192x192"',
  'sizes: "512x512"',
  'purpose: "maskable"',
  'theme_color: "#5f1722"',
]) assert(manifest.includes(value), `PWA manifest must include ${value}`);

for (const [path, size] of [
  ["public/icons/her-africa-table-192.png", 192],
  ["public/icons/her-africa-table-512.png", 512],
  ["public/icons/her-africa-table-maskable-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
]) {
  assert(existsSync(new URL(path, root)), `${path} must exist`);
  assert.deepEqual(pngSize(path), [size, size], `${path} must be ${size}×${size}`);
}

const worker = read("public/sw.js");
for (const boundary of [
  'url.pathname.startsWith("/api/")',
  'request.mode === "navigate"',
  'fetch(request).catch(() => caches.match("/offline"))',
  'url.pathname.startsWith("/_next/static/")',
]) assert(worker.includes(boundary), `Service worker must include ${boundary}`);
assert(
  !worker.includes("cache.put(request, response)"),
  "Service worker must not cache arbitrary navigation or authenticated responses",
);

const provider = read("components/pwa/pwa-provider.tsx");
assert(provider.includes('navigator.serviceWorker.register("/sw.js"'), "PWA provider must register the service worker");
assert(provider.includes("beforeinstallprompt"), "PWA provider must support the browser install prompt");
assert(read("components/member/account-settings.tsx").includes("InstallAppCard"), "Members need a plain-language install action");
assert(read("app/page.tsx").includes("InstallAppButton"), "Public visitors need an install action");

console.log("PWA install, icon, privacy-safe caching and member guidance contracts passed.");
