export function gatheringTimeError(startsAt, endsAt) {
  const start = new Date(startsAt), end = new Date(endsAt);
  if (!startsAt || !Number.isFinite(start.getTime())) return 'Choose a valid start date and time.';
  if (!endsAt || !Number.isFinite(end.getTime())) return 'Choose a valid end date and time.';
  if (end <= start) return 'The end must be after the start. If you finish after midnight, choose the following day for the end date.';
  return '';
}
