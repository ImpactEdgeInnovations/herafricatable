import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = source => ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const load = (path, name, values = {}) => new Function(...Object.keys(values), `${compile(read(path))};return ${name};`)(...Object.values(values));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const adminRowsReady = load('lib/admin-read-state.ts', 'adminRowsReady');
const adminCountReady = load('lib/admin-read-state.ts', 'adminCountReady');
for (const result of [null, {}, { data: null }, { data: [], error: 'offline' }, { data: [{}], count: 2 }]) assert.equal(adminRowsReady(result), false);
assert(adminRowsReady({ data: [], count: 0 }));
assert(adminRowsReady({ data: [{}], count: 1 }));
for (const count of [null, undefined, -1, NaN, Infinity, 1.5]) assert.equal(adminCountReady({ count }), false);
assert(adminCountReady({ count: 0 }));
assert(!adminCountReady({ count: 3, error: 'denied' }));

const ActionCentre = load('components/admin/admin-action-centre.tsx', 'AdminActionCentre', { React });
const queues = { role: 'super_admin', draftEvents: 0, hasEvents: false, openReports: 0, pendingMembers: 0, memberCountsReady: true, pendingCommunityApplications: 0, pendingRefunds: 0, pendingRegistrations: 0 };
assert(render(ActionCentre, queues).includes('All clear'));
for (const key of ['draftEvents', 'openReports', 'pendingCommunityApplications', 'pendingRefunds', 'pendingRegistrations', 'memberCountsReady']) {
  const html = render(ActionCentre, { ...queues, [key]: key === 'memberCountsReady' ? false : null });
  assert(!html.includes('All clear') && !html.includes('Nothing needs a decision'), key);
  assert(html.includes('couldn’t load') && html.includes('Open list'), key);
}
assert(render(ActionCentre, { ...queues, pendingRefunds: 2, openReports: null }).includes('At least 2 open tasks'));
assert(!render(ActionCentre, { ...queues, role: 'event_staff', memberCountsReady: false, openReports: null }).includes('Member requests unavailable'));

const Summary = load('components/admin/launch-readiness-summary.tsx', 'LaunchReadinessSummary', { React });
const summaryProps = {
  environmentSignals: [{ label: 'Email setup', ready: true }],
  metrics: [{ metric_key: 'members', label: 'Active members', current_value: 1, target_value: 1, status: 'ready' }],
  databaseChecks: [{ module_key: 'core', label: 'Core database', ready: true, missing_items: [] }],
  moduleChecks: [{ feature_key: 'community', feature_sort_order: 1, feature_label: 'Communities', database_ready: true, release_ready: true, status: 'passed' }],
  launchChecks: [{ check_key: 'rehearsal', label: 'Rehearsal', required: true, status: 'passed' }],
  migrationsReady: { database: true, modules: true, launch: true, reporting: true },
};
assert(render(Summary, summaryProps).includes('100%'));
for (const key of ['environmentSignals', 'metrics', 'databaseChecks', 'moduleChecks', 'launchChecks']) {
  const html = render(Summary, { ...summaryProps, [key]: [] });
  assert(html.includes('Snapshot incomplete') && !html.includes('100%') && !html.includes('All recorded checks are ready'), key);
}
for (const key of ['database', 'modules', 'launch', 'reporting']) {
  const html = render(Summary, { ...summaryProps, migrationsReady: { ...summaryProps.migrationsReady, [key]: false } });
  assert(html.includes('Snapshot incomplete') && !html.includes('100%') && !html.includes('Apply the'), key);
}
assert(render(Summary, { ...summaryProps, moduleChecks: [...summaryProps.moduleChecks, { ...summaryProps.moduleChecks[0], check_key: 'other', release_ready: false, status: 'blocked' }] }).includes('80%'));
assert(render(Summary, { ...summaryProps, metrics: [{ ...summaryProps.metrics[0], current_value: 0, status: 'action_required' }] }).includes('80%'));
assert(render(Summary, { ...summaryProps, launchChecks: [{ ...summaryProps.launchChecks[0], required: false }] }).includes('Snapshot incomplete'));

const Link = ({ children, ...props }) => React.createElement('a', props, children);
async function home(mode, role = 'super_admin') {
  const calls = [];
  const members = mode === 'zero' ? [] : [{ user_id: 'member', access_status: 'pending', application_status: 'submitted' }];
  const client = {
    auth: { getUser: async () => ({ data: { user: mode === 'signed_out' ? null : { id: 'admin' } } }) },
    async rpc(name, args, options) {
      calls.push({ name, options });
      const failures = { member: ['list_admin_members_v3', 'list_admin_members_v2'], events: ['list_managed_events'], community: ['list_community_host_applications_admin'], safety: ['list_member_reports'], intake: ['get_membership_intake_admin'] };
      if (failures[mode]?.includes(name)) return { data: null, error: 'unavailable' };
      if (mode === 'legacy_fallback' && name === 'list_admin_members_v3') return { data: null, error: 'unavailable' };
      let data = name.startsWith('list_admin_members') ? members : name === 'list_managed_events' ? mode === 'zero' ? [] : [{ event_id: 'event', status: 'draft' }]
        : name === 'get_membership_intake_admin' ? [{ mode: 'manual_review', pending_applications: 0 }]
          : name === 'list_community_photo_reports_page' ? { reports: [], has_more: mode === 'photo_partial' } : [];
      return { data, error: null, count: Array.isArray(data) ? mode === 'truncated' && name === 'list_managed_events' ? 2 : data.length : null };
    },
    from(table) {
      const query = new Proxy({}, { get(_, method) {
        if (method === 'then') return resolve => resolve(table === 'profiles' ? { data: members.map(x => ({ id: x.user_id, is_test_account: false })), error: mode === 'tags' ? 'offline' : null }
          : { count: 0, error: mode === table ? 'offline' : null });
        return () => query;
      } }); return query;
    },
  };
  const Component = load('app/admin/page.tsx', 'AdminHomePage', { React, Link, createClient: async () => client, getActiveAdminRole: async () => ({ data: mode === 'denied' ? null : { role } }), redirect: path => { throw Error(path); }, AdminHeader: () => null, AdminActionCentre: ActionCentre, adminRowsReady, adminCountReady });
  return { html: renderToStaticMarkup(await Component()), calls };
}
assert((await home('zero')).html.includes('All clear'));
for (const mode of ['member', 'legacy_fallback', 'events', 'community', 'safety', 'intake', 'tags', 'photo_partial', 'truncated', 'registration_requests', 'refund_requests']) {
  const { html } = await home(mode);
  if (mode !== 'intake') assert(!html.includes('All clear'), mode);
  else assert(html.includes('Joining settings couldn’t load'));
}
await assert.rejects(home('signed_out'), /admin\/sign-in/);
const denied = await home('denied'); assert.equal(denied.calls.length, 0);
assert(!(await home('zero', 'moderator')).calls.some(call => call.name === 'list_admin_members_v3'));
const operations = read('app/admin/operations/page.tsx');
assert(operations.includes('role.role === "super_admin" && (loadPeople || loadRelease)\n      ? supabase.rpc("get_launch_readiness_metrics")'));
assert(operations.includes('reporting: !readinessResult.error,'));

if (process.argv.includes('--preview')) {
  const output = new URL('tmp/admin-phase-three-preview/', root); mkdirSync(output, { recursive: true });
  const css = [...read('app/layout.tsx').matchAll(/^import "\.\/(.+\.css)";/gm)].map(x => read(`app/${x[1]}`)).join('\n');
  writeFileSync(new URL('styles.css', output), css);
  writeFileSync(new URL('index.html', output), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin read-state QA — example data</title><link rel="stylesheet" href="styles.css"></head><body class="hat-design-c"><main class="admin-command-center"><p>LAYOUT TEST · EXAMPLE DATA · NO LIVE ACCOUNT OR ACTIONS</p>${render(ActionCentre, { ...queues, pendingRefunds: 2, openReports: null, memberCountsReady: false })}${render(Summary, { ...summaryProps, metrics: [] })}</main></body></html>`);
}
console.log('Admin phase 3 slice passed: returned failures and truncation never clear queues, complete zero is valid, role guards remain, missing readiness groups hide percentages, module evidence is conservative, release metrics load in the correct area.');
