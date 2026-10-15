/** Separate invitations, never a CC list. No contact data leaves this parser. */
export function parseInvitationEmails(value: string) {
  const entries = value.split(/[,;\n\r]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
  const emails = [...new Set(entries)];
  const invalid = emails.filter(email => email.length > 320 || !/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(email));
  return { emails, invalid, duplicates: entries.length - emails.length, tooMany: emails.length > 20 };
}
