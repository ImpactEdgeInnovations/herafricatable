import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("lib/community-photo-cleanup.ts").replace(/^import .*;\n/gm, "");
const js = ts.transpileModule("const createAdminClient=()=>globalThis.__photoAdmin;\n" + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { cleanCommunityPhotos } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
let calls = [];
function mock({ storageFailure = false, stale = false, queueFailure = false, healthFailure = false } = {}) {
  calls = [];
  globalThis.__photoAdmin = {
    storage: { from: bucket => ({ remove: async paths => { calls.push(["remove", bucket, paths]); return { error: storageFailure ? new Error("Storage unavailable") : null }; } }) },
    rpc: async (name, params) => {
      calls.push([name, params]);
      if (name === "claim_community_photo_deletions") return { data: [{ id: "deleted", path: "community/deleted", token: "lease" }], error: queueFailure ? new Error("Queue unavailable") : null };
      if (name === "claim_community_photo_cleanup") return { data: [{ id: "normal", path: "community/normal" }], error: null };
      if (name === "finish_community_photo_deletion") return { data: !stale, error: null };
      if (name === "record_community_photo_cleanup_health" && healthFailure) throw new Error("Health unavailable");
      return { data: null, error: null };
    },
  };
}
mock(); assert.deepEqual(await cleanCommunityPhotos(), { removed: 2, failed: 0 });
assert(calls.findIndex(call => call[0] === "remove") < calls.findIndex(call => call[0] === "finish_community_photo_deletion"));
assert.deepEqual(calls.find(call => call[0] === "finish_community_photo_deletion")[1], { p_photo_id: "deleted", p_claim_token: "lease" });
assert.deepEqual(calls.find(call => call[0] === "record_community_photo_cleanup_health")[1], { p_removed: 2, p_failed: 0 });
mock({ storageFailure: true }); assert.deepEqual(await cleanCommunityPhotos(), { removed: 0, failed: 2 });
assert(!calls.some(call => call[0].startsWith("finish_")), "Never clear a manifest after Storage failure");
mock({ stale: true }); assert.deepEqual(await cleanCommunityPhotos(), { removed: 1, failed: 1 });
mock({ queueFailure: true }); assert.deepEqual(await cleanCommunityPhotos(), { removed: 1, failed: 1 });
mock({ healthFailure: true }); assert.deepEqual(await cleanCommunityPhotos(), { removed: 2, failed: 1 });
mock(); assert.deepEqual(await cleanCommunityPhotos("member"), { removed: 2, failed: 0 });
assert(!calls.some(call => call[0] === "record_community_photo_cleanup_health"));
assert.equal(calls.find(call => call[0] === "claim_community_photo_deletions")[1].p_uploader_id, "member");
const sql = read("supabase/migrations/20261007220000_community_photo_deletion_manifest.sql");
for (const token of ["enable row level security", "before delete", "for update skip locked", "interval '5 minutes'", "claim_token = p_claim_token", "on conflict(photo_id) do nothing", "hat_private.preserve_community_photo_deletion", "from public, anon, authenticated"]) assert(sql.includes(token), token);
assert(!sql.includes("references public."), "Deletion manifests must survive parent cascades");
assert(read("supabase/tests/042_community_photo_deletion_manifest.sql").endsWith("rollback;\n"));
console.log("Photo deletion worker behaviour passed: Storage-before-completion, failure retention, stale claims, legacy cleanup and per-account health isolation. SQL rollback rehearsal is separate.");
