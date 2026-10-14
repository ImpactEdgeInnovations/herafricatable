import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const helperSource = read('lib/events/community-calendar.ts').replace(/^export /gm, '');
const helperCode = ts.transpileModule(helperSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = new Function(`${helperCode};return {calendarDay,calendarMonthDays,shiftCalendarMonth,eventsForCalendarDay,calendarEventsByDay};`)();
const { calendarDay, calendarMonthDays, shiftCalendarMonth, eventsForCalendarDay } = helpers;
assert.equal(calendarDay('2026-10-14T22:30:00Z', 'Africa/Nairobi'), '2026-10-15');
assert.equal(calendarDay('2026-10-14T22:30:00Z', 'America/Los_Angeles'), '2026-10-14');
assert.equal(calendarDay('invalid', 'Africa/Nairobi'), '');
const october = calendarMonthDays('2026-10');
assert.equal(october[0], '2026-09-28'); assert.equal(october.at(-1), '2026-11-01');
assert.equal(october.length, 35); assert.equal(new Set(october).size, 35);
assert.equal(calendarMonthDays('2021-02').length, 28);
assert(calendarMonthDays('2024-02').includes('2024-02-29'));
assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12');
const multi = [{ starts_at: '2026-10-14T20:00:00Z', ends_at: '2026-10-15T21:00:00Z' }];
assert.equal(eventsForCalendarDay(multi, '2026-10-14', 'Africa/Nairobi').length, 1);
assert.equal(eventsForCalendarDay(multi, '2026-10-15', 'Africa/Nairobi').length, 1);
assert.equal(eventsForCalendarDay(multi, '2026-10-16', 'Africa/Nairobi').length, 0, 'Midnight end is exclusive');
assert.equal(eventsForCalendarDay([{ starts_at: 'invalid', ends_at: 'invalid' }], '2026-10-14', 'Africa/Nairobi').length, 0);
const calendarEvents = [...multi, { starts_at: 'invalid', ends_at: 'invalid' }];
const indexed = helpers.calendarEventsByDay(calendarEvents, october, 'Africa/Nairobi');
for (const day of october) assert.deepEqual(indexed.get(day), eventsForCalendarDay(calendarEvents, day, 'Africa/Nairobi'));
assert.equal(helpers.calendarEventsByDay(Array.from({length:1000},()=>multi[0]), october, 'Africa/Nairobi').get('2026-10-15').length, 1000);

const states = []; let index = 0; const effects = [];
const dependencies = { React, ...helpers, useMemo: fn => fn(), useEffect: fn => effects.push(fn), useState: initial => {
  const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
  return [states[slot], value => states[slot] = typeof value === 'function' ? value(states[slot]) : value];
} };
const componentSource = read('components/member/community-calendar.tsx').replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const componentCode = ts.transpileModule(componentSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const Calendar = new Function(...Object.keys(dependencies), `${componentCode};return CommunityCalendar;`)(...Object.values(dependencies));
const today = calendarDay(new Date().toISOString(), 'Africa/Nairobi');
const cards = [{ room_id: 'r1', event_slug: 'first', title: 'Meet the Community', starts_at: `${today}T10:00:00Z`, ends_at: `${today}T11:00:00Z`, format: 'virtual', my_rsvp: 'going' },
  { room_id: 'r2', event_slug: 'second', title: 'Another gathering', starts_at: `${today}T12:00:00Z`, ends_at: `${today}T13:00:00Z`, format: 'virtual' }];
const opens = []; const render = (items = cards) => { index = 0; return Calendar({ cards: items, onOpen: slug => opens.push(slug) }); };
function find(element, predicate) {
  if (!element) return null;
  if (Array.isArray(element)) return element.map(item => find(item, predicate)).find(Boolean) ?? null;
  if (typeof element !== 'object') return null;
  return predicate(element) ? element : find(element.props?.children, predicate);
}
let tree = render(); let html = renderToStaticMarkup(tree);
assert(html.includes('Nairobi (EAT)') && html.includes('Calendar time zone'));
assert(html.includes('Your place is saved') && html.includes('Meet the Community'));
assert(html.includes('aria-current="date"') && html.includes('aria-pressed="true"'));
assert(!html.includes('href='), 'Opening a gathering uses the existing in-page loader');
find(tree, item => item.type === 'button' && item.props.children?.[0]?.props?.children?.[0]?.props?.children === 'Meet the Community').props.onClick();
assert.deepEqual(opens, ['first']);
find(tree, item => item.props?.['aria-label'] === 'Next month').props.onClick();
tree = render(); assert.equal(states[2], shiftCalendarMonth(today.slice(0, 7), 1));
find(tree, item => item.type === 'button' && item.props.children === 'Today').props.onClick();
render(); assert.equal(states[2], today.slice(0, 7)); assert.equal(states[3], today);
tree = render(); find(tree, item => item.props?.['aria-label'] === 'Calendar time zone').props.onChange({ target: { value: 'America/Los_Angeles' } });
render(); assert.equal(states[0], 'America/Los_Angeles'); assert.equal(states[3], calendarDay(new Date().toISOString(), 'America/Los_Angeles'));
html = renderToStaticMarkup(render([])); assert(html.includes('Nothing scheduled yet') && html.includes('No gatherings on this day'));
const css = read('app/community-room.css');
assert(css.includes('grid-template-columns: repeat(7, minmax(0, 1fr))'));
assert(css.includes('.community-calendar-cell-events { display: none; }'));
assert(css.includes('.community-calendar button:focus-visible'));
console.log('Community calendar passed: Monday-first/leap-year grids, year navigation, time-zone boundaries, multi-day/midnight handling, in-page open, Today, empty states and responsive/focus contracts.');
