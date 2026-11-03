import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(p=>p.endsWith('_approval_endpoint_permissions.sql'));
assert.equal(migrations.length,1);
const sql=read('supabase/migrations/'+migrations[0]).toLowerCase();
const targets=['review_member(uuid,text,text)','review_community_host_application(uuid,text,text,text)','review_member_event_proposal(uuid,text,text)','review_event_host_workspace(uuid,text,text)'];
assert(sql.trim().startsWith('begin;')&&sql.trim().endsWith('commit;'));
assert.equal((sql.match(/revoke execute on function/g)||[]).length,4,'only the four reviewed approval operations change');
for(const signature of targets){
 assert(sql.includes(`revoke execute on function public.${signature} from public,anon;`));
 assert(sql.includes(`grant execute on function public.${signature} to authenticated;`));
}
assert(!/on all functions|alter default privileges|create (or replace )?function|update public\.|delete from|drop function/.test(sql),'no broad grant or business/data changes');
const test=read('supabase/tests/076_approval_endpoint_permissions.sql');
for(const contract of ["'42501','permission denied'","'P0001','Super admin'","'service_role'","admin_error",'rollback;'])assert(test.includes(contract),contract);
const live=read('scripts/verify-super-admin-decision-readiness.mjs');
assert(live.includes('databasePermissionDenied')&&live.includes('42501'));
console.log('PASS: four scoped approval ACL changes, inherited/explicit anonymous revocation, preserved authenticated access, no body/data/default-grant changes and database-level denial regression coverage. This source check is not live acceptance.');
