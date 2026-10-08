export const memberPageSize = 12;

export function memberPageNumber(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Number(value);
}

export function memberDirectoryHref({page = 1, city = '', goal = '', search = '', view = 'find'} = {}) {
  const query = new URLSearchParams();
  if (view === 'connections') query.set('view', 'connections');
  if (search) query.set('q', search);
  if (city) query.set('city', city);
  if (goal) query.set('goal', goal);
  if (page > 1 && view !== 'connections') query.set('page', String(page));
  return `/network${query.size ? `?${query}` : ''}`;
}

export function memberDirectoryWindow(rows, page = 1) {
  const members = rows.slice(0, memberPageSize);
  return {members, hasNextPage: rows.length > memberPageSize,
    first: members.length ? (page - 1) * memberPageSize + 1 : 0,
    last: members.length ? (page - 1) * memberPageSize + members.length : 0};
}
