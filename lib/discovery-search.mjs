function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchesDiscoverySearch(query, fields) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(fields.filter(Boolean).join(' '));
  return words.every(word => text.includes(word));
}
