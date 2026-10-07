import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const listeners = new Map();
const cleanups = [];
const navigations = [];
let epoch = 0;
globalThis.window = {
  location: { href: "https://example.test/communities/table", origin: "https://example.test", assign: url => navigations.push(url) },
  addEventListener: (name, callback) => listeners.set(name, callback),
  removeEventListener: name => listeners.delete(name),
};
globalThis.document = {
  addEventListener: (name, callback) => listeners.set(name, callback),
  removeEventListener: name => listeners.delete(name),
};
globalThis.__guardFixture = {
  useEffect: callback => cleanups.push(callback()),
  useRef: current => ({ current }),
  useRouter: () => ({ push: url => navigations.push(url) }),
  communityDraftEpoch: () => epoch,
};
let source = read("lib/use-community-file-guard.ts").replace(/^import .*;\n/gm, "");
source = "const {useEffect,useRef,useRouter,communityDraftEpoch}=globalThis.__guardFixture;\n" + source;
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { useCommunityFileGuard } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
let prompts = 0, discards = 0, blocked = 0, answer = false;
const options = (busy = false) => ({ busy, ask: async () => { prompts++; return answer; }, discard: () => discards++, blocked: () => blocked++ });
const event = (href = "/events", extra = {}) => ({
  target: { closest: () => ({ target: "", hasAttribute: () => false, getAttribute: () => href }) },
  button: 0, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra,
});
const reset = () => { while (cleanups.length) cleanups.pop()?.(); };

useCommunityFileGuard(true, options());
useCommunityFileGuard(true, options());
const unload = event(); listeners.get("beforeunload")(unload); assert(unload.prevented);
await listeners.get("click")(event());
assert.equal(prompts, 1); assert.equal(discards, 0); assert.equal(navigations.length, 0);
await listeners.get("click")(event("#photos"));
await listeners.get("click")(event("/events", { metaKey: true }));
await listeners.get("click")(event("mailto:hello@example.test"));
assert.equal(prompts, 1, "Hash links, new tabs and email links must not discard selected files");
answer = true;
await listeners.get("click")(event());
assert.equal(prompts, 2); assert.equal(discards, 2); assert.deepEqual(navigations, ["/events"]);
reset(); assert.equal(listeners.size, 0);
useCommunityFileGuard(true, options(true));
await listeners.get("click")(event()); assert.equal(blocked, 1); assert.equal(prompts, 2);
reset();
useCommunityFileGuard(true, options()); epoch++;
const signedOut = event(); await listeners.get("click")(signedOut); assert(!signedOut.prevented);
reset();
let resolve;
useCommunityFileGuard(true, { ...options(), ask: () => new Promise(done => { resolve = done; }) });
const pending = listeners.get("click")(event()); reset(); resolve(true); await pending;
assert.equal(navigations.length, 1, "An unmounted guard must not navigate after a late decision");
for (const file of ["components/member/community-feed.tsx", "components/member/community-branding-panel.tsx", "components/community/community-photo-albums.tsx"]) assert(read(file).includes("useCommunityFileGuard("), file);
for (const file of ["components/member/community-joining-settings.tsx", "components/member/community-gathering-room.tsx", "components/community/community-photo-albums.tsx"]) {
  const text = read(file); assert(text.includes("useCommunityDraft")); assert(text.includes("Discard changes"));
}
console.log("Community file guards passed: shared prompt, keep/discard, busy, sign-out, late decisions and listener cleanup. Form contracts passed; real browser acceptance is separate.");
