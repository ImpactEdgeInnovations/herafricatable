import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gatheringIntroduction} from '../lib/gathering-introduction.mjs';
let result=gatheringIntroduction('Test Run','Brief overview of the platform');
assert.equal(result.titleError,'');assert.equal(result.summaryLength,30);
assert.match(result.summaryError,/10 more characters/);
result=gatheringIntroduction('Test Run','A brief overview of the platform and how members can use it.');
assert.equal(result.summaryError,'');
for(const [title,summary,valid] of [['abcd','x'.repeat(40),true],['abc','x'.repeat(40),false],['abcd','x'.repeat(39),false],['abcd','x'.repeat(2000),true],['abcd','x'.repeat(2001),false],['x'.repeat(141),'x'.repeat(40),false],['  abcd  ','  '+ 'x'.repeat(40)+'  ',true],['😀😀😀😀','😀'.repeat(40),true]]){
 result=gatheringIntroduction(title,summary);assert.equal(!result.titleError&&!result.summaryError,valid);
}
const ui=readFileSync(new URL('../components/community/community-event-proposal-panel.tsx',import.meta.url),'utf8');
assert(!ui.includes('Add a clear name and a short explanation'));
for(const token of ['gatheringIntroduction(values.title,values.summary)','aria-invalid','aria-describedby','current?.focus()','introduction.summaryLength','introAttempted'])assert(ui.includes(token),token);
console.log('Gathering Step 1: exact user example, length boundaries, outer spaces, Unicode and field-specific feedback passed. Browser acceptance is separate.');
