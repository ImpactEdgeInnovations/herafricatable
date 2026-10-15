import assert from 'node:assert/strict';
import { gatheringSetup } from '../lib/gathering-setup.mjs';
import { readFileSync } from 'node:fs';
const links = { onlineUrl: ' https://meet.google.com/test ', videoLink: ' https://youtu.be/abcdef12345 ' };
assert.deepEqual(gatheringSetup({ ...links, format: 'virtual', gatheringStyle: 'watch_video' }), { kind: 'watch_video', format: 'virtual', onlineUrl: '', videoLink: 'https://youtu.be/abcdef12345' });
assert.deepEqual(gatheringSetup({ ...links, format: 'virtual', gatheringStyle: 'video_call' }), { kind: 'video_call', format: 'virtual', onlineUrl: 'https://meet.google.com/test', videoLink: '' });
assert.deepEqual(gatheringSetup({ ...links, format: 'in_person', gatheringStyle: 'in_person' }), { kind: 'in_person', format: 'in_person', onlineUrl: '', videoLink: '' });
assert.equal(gatheringSetup({ format: 'hybrid', ...links }).kind, 'hybrid');
assert.equal(gatheringSetup({ format: 'virtual', videoLink: links.videoLink }).kind, 'watch_video');
assert.equal(gatheringSetup({ format: 'virtual' }).kind, 'video_call');
assert.equal(gatheringSetup({ format: 'virtual', gatheringStyle: 'unknown' }).kind, 'video_call');
const source = readFileSync(new URL('../components/community/community-event-proposal-panel.tsx', import.meta.url), 'utf8');
for (const label of ['Create a meetup', 'In person', 'Online', 'Online link']) assert(source.includes(label));
for (const link of ['https://youtu.be/abcdef12345','https://www.youtube.com/live/abcdef12345']) {
  const setup=gatheringSetup({format:'virtual',gatheringStyle:'online',onlineUrl:link});
  assert.equal(setup.videoLink,link); assert.equal(setup.onlineUrl,'');
}
assert.equal(gatheringSetup({format:'virtual',gatheringStyle:'online',onlineUrl:links.onlineUrl}).onlineUrl,links.onlineUrl.trim());
assert.equal(gatheringSetup({format:'virtual',gatheringStyle:'online',onlineUrl:'https://vimeo.com/example'}).kind,'video_call');
assert.equal(gatheringSetup({format:'virtual',gatheringStyle:'online',onlineUrl:'https://youtube.com.example.invalid/watch?v=abcdef12345'}).videoLink,'');
assert.equal(gatheringSetup({format:'virtual',gatheringStyle:'online',onlineUrl:''}).videoLink,'');
assert(source.includes('p_online_url: setup.onlineUrl || null'));
assert(source.includes('youtubeVideoId(setup.videoLink)'));
assert(source.includes('no poster is required'));
console.log('Meetup choices passed: In person/Online, automatic YouTube classification, external call links, optional text-only rooms and legacy draft preservation. No live meetup was published.');
