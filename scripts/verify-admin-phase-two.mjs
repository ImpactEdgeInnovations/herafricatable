import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
async function factory(file, symbol, names) {
  const source = read(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const body = tree.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(tree)).join("\n").replace(/^export default /gm, "").replace(/^export /gm, "");
  const code = ts.transpileModule(`export function harness(context) { const { ${names.join(",")} } = context; ${body}; return ${symbol}; }`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).harness;
}
function runtime() {
  let cursor = 0;
  const slots = [];
  return {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useMemo(fn) { return fn(); }, useCallback(fn) { return fn; }, useEffect() {},
    render(fn) { cursor = 0; return fn(); },
  };
}
const React = { Fragment: "Fragment", createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
const safeError = () => "We could not confirm this change.";
const operationFactory = await factory("lib/use-admin-operation.ts", "useAdminOperation", ["useRef", "useState", "adminErrorMessage"]);
function operationContext() {
  const hooks = runtime();
  const useOperation = operationFactory({ ...hooks, adminErrorMessage: safeError });
  let message = "";
  const cleared = [];
  const render = () => hooks.render(() => useOperation("", "pending", (next) => { message = typeof next === "function" ? next(message) : next; }, (key) => cleared.push(key)));
  return { render, cleared, message: () => message };
}
let ctx = operationContext();
let release;
let calls = 0;
let action = ctx.render();
const pending = action.runAdminAction("first", async () => { calls++; await new Promise((resolve) => { release = resolve; }); });
await action.runAdminAction("second", async () => { calls++; });
assert.equal(calls, 1, "lock must work before a React rerender");
assert.equal(ctx.render().busy, "pending");
release(); await pending; assert.equal(ctx.render().busy, "");
for (const saved of [false, true]) {
  ctx = operationContext(); action = ctx.render();
  await action.runAdminAction("target", async () => { if (saved) action.markSaved(); throw Error("offline"); });
  assert.equal(ctx.render().busy, "", "thrown failures must release controls");
  assert.equal(ctx.cleared.length, saved ? 1 : 0, "only a confirmed save clears decision notes");
  assert.match(ctx.message(), saved ? /saved.*view could not update/i : /check its current status/);
}
ctx = operationContext(); action = ctx.render();
const holding = action.runAdminAction("holding", async () => { action.setBusy(""); await new Promise((resolve) => { release = resolve; }); });
assert.equal(ctx.render().busy, "pending", "a row reset cannot unlock an unfinished operation");
release(); await holding;

const dialogFactory = await factory("components/ui/action-dialog.tsx", "useActionDialog", ["useState", "useRef", "useCallback", "useEffect", "useId", "React"]);
const dialogHooks = runtime();
const useDialog = dialogFactory({ ...dialogHooks, useId: () => "dialog", React });
const dialogRender = () => dialogHooks.render(() => useDialog({ retainDrafts: true }));
const options = (key) => ({ draftKey: key, title: "Decision", description: "Confirm", confirmLabel: "Save", fields: [{ name: "note", label: "Note", initialValue: "" }] });
let dialog = dialogRender(); let decision = dialog.ask(options("member-a:decline"));
dialogRender().dialog.props.settle({ note: "Please update your details" }); await decision;
decision = dialogRender().ask(options("member-b:decline"));
assert.equal(dialogRender().dialog.props.pending.fields[0].initialValue, "", "notes must never cross recipients");
dialogRender().dialog.props.settle(null); await decision;
decision = dialogRender().ask(options("member-a:decline"));
assert.equal(dialogRender().dialog.props.pending.fields[0].initialValue, "Please update your details");
dialogRender().dialog.props.settle(null); await decision;
dialogRender().clearDraft("member-a:decline");
decision = dialogRender().ask(options("member-a:decline"));
assert.equal(dialogRender().dialog.props.pending.fields[0].initialValue, "");
dialogRender().dialog.props.settle(null); await decision;

const supportFactory = await factory("components/admin/support-inbox.tsx", "SupportInbox", ["useState", "useEffect", "useMemo", "useRouter", "createClient", "useAdminOperation", "Link", "React"]);
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) { const match = find(child, predicate); if (match) return match; }
  return null;
}
const ticket = (id) => ({ ticket_id: id, email: `${id}@hat-test.invalid`, display_name: id, subject: id, reference: id, category: "other", description: "Test request", status: "open", priority: "normal", created_at: "2026-10-16T00:00:00Z" });
function supportContext() {
  const hooks = runtime(); const calls = []; let mode = "ok"; let resolve;
  const useOperation = operationFactory({ ...hooks, adminErrorMessage: safeError });
  const component = supportFactory({ ...hooks, useAdminOperation: useOperation, useRouter: () => ({ refresh() {} }), createClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); if (mode === "throw") throw Error("offline"); if (mode === "error") return { error: Error("denied") }; if (mode === "hold") return new Promise((done) => { resolve = done; }); return { error: null }; } }), Link: "Link", React });
  let props = { adminEmail: "admin@hat-test.invalid", tickets: [ticket("a"), ticket("b")], messages: [], selectedTicketId: "a", messagesReady: true };
  const render = (patch = {}) => { props = { ...props, ...patch }; return hooks.render(() => component(props)); };
  return { render, calls, mode: (value) => { mode = value; }, release: () => resolve({ error: null }) };
}
const composer = (tree) => find(tree, (node) => node.type === "form" && node.props.className === "support-composer");
const textarea = (tree) => find(composer(tree), (node) => node.type === "textarea");
const submit = (tree) => composer(tree).props.onSubmit({ preventDefault() {} });
for (const mode of ["throw", "error"]) {
  const support = supportContext();
  textarea(support.render()).props.onChange({ target: { value: "Private reply for A" } });
  support.mode(mode); await submit(support.render());
  const tree = support.render();
  assert.equal(textarea(tree).props.value, "Private reply for A", "failed sends retain the correct draft");
  assert.equal(textarea(tree).props.disabled, false, "failed send restores controls");
}
const support = supportContext();
textarea(support.render({ selectedTicketId: "b" })).props.onChange({ target: { value: "Reply for B" } });
textarea(support.render({ selectedTicketId: "a" })).props.onChange({ target: { value: "Reply for A" } });
support.mode("hold"); const sending = submit(support.render());
await submit(support.render()); assert.equal(support.calls.length, 1);
assert.equal(support.calls[0].args.p_ticket_id, "a");
assert.equal(support.calls[0].args.p_body, "Reply for A");
assert.equal(textarea(support.render({ selectedTicketId: "b" })).props.value, "Reply for B");
support.release(); await sending;
assert.equal(textarea(support.render()).props.value, "Reply for B", "late completion must not clear another member's reply");
assert.equal(textarea(support.render({ selectedTicketId: "a" })).props.value, "");
const failed = support.render({ messagesReady: false });
assert.equal(textarea(failed).props.disabled, true);
await submit(failed); assert.equal(support.calls.length, 1, "do not reply to an unread conversation");
assert(find(failed, (node) => node.props.role === "alert"));

// Execute real decision-handler bodies, not just their source wiring.
async function handler(file, name, names) {
  const source = read(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.getText(tree); ts.forEachChild(node, visit); }
  visit(tree); assert(body, `Missing ${name}`);
  const code = ts.transpileModule(`export function harness(context) { const { ${names.join(",")} } = context; ${body}; return ${name}; }`, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).harness;
}
const lifecycleFactory = await handler("components/admin/event-command-centre.tsx", "manageLifecycle", ["event", "lifecycleReady", "ask", "runAdminAction", "setBusy", "setMessage", "supabase", "markSaved", "router", "adminErrorMessage"]);
for (const mode of ["cancel", "error", "throw", "refresh-failed", "ok"]) {
  const operation = operationContext(); const controls = operation.render(); let mutated = 0; let notice = "";
  const run = lifecycleFactory({ ...controls, event: { id: "test-event", title: "Test event" }, lifecycleReady: true, ask: async () => mode === "cancel" ? null : { reason: "Operational reason", memberMessage: "An update for our guests" }, setMessage: (value) => { notice = value; }, supabase: { rpc: async (name, args) => { mutated++; assert.equal(name, "manage_event_lifecycle"); assert.equal(args.p_event_id, "test-event"); if (mode === "throw") throw Error("offline"); return { error: mode === "error" ? Error("denied") : null }; } }, router: { refresh() { if (mode === "refresh-failed") throw Error("offline"); } }, adminErrorMessage: safeError });
  await run("suspend"); assert.equal(mutated, mode === "cancel" ? 0 : 1);
  assert.equal(operation.render().busy, "");
  assert.equal(operation.cleared.length, ["ok", "refresh-failed"].includes(mode) ? 1 : 0);
  if (mode === "refresh-failed") assert.match(operation.message(), /saved.*view could not update/i);
  if (mode === "error") assert.equal(notice, safeError());
}

const supportPageFactory = await factory("app/admin/support/page.tsx", "AdminSupportPage", ["createClient", "getActiveAdminRole", "redirect", "AdminHeader", "SupportInbox", "React"]);
for (const mode of ["empty", "error", "throw"]) {
  const query = { select() { return this; }, eq() { return this; }, async order() { if (mode === "throw") throw Error("offline"); return { data: [], error: mode === "error" ? Error("offline") : null }; } };
  const page = supportPageFactory({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "admin@hat-test.invalid" } } }) }, rpc: async () => ({ data: [ticket("a")], error: null }), from: () => query }), getActiveAdminRole: async () => ({ data: { role: "super_admin" } }), redirect() { throw Error("unexpected redirect"); }, AdminHeader: "AdminHeader", SupportInbox: "SupportInbox", React });
  const rendered = await page({ searchParams: Promise.resolve({ ticket: "a" }) });
  assert.equal(find(rendered, (node) => node.type === "SupportInbox").props.messagesReady, mode === "empty", "empty and unreadable conversations must differ");
}

for (const file of ["member-command-centre", "community-command-centre", "event-command-centre", "member-review", "community-manager", "community-host-application-manager", "member-event-proposal-manager", "community-event-proposal-manager", "event-host-review-manager", "table-invitation-manager", "registration-manager", "privacy-operations"]) {
  const source = read(`components/admin/${file}.tsx`);
  assert(source.includes("useAdminOperation"), `${file} must use the shared recovery guard`);
  assert(source.includes("markSaved()"), `${file} must distinguish saved from unknown outcomes`);
  assert(source.includes("retainDrafts: true"), `${file} must retain confirmed notes after failure`);
}
console.log("L1 Admin phase two passed: synchronous duplicate lock, finally recovery, saved/unknown outcomes, recipient-scoped retained notes, failed support reads/sends and late responses. All services mocked; not L2/L3 acceptance.");
