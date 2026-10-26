export type AttendanceExport = {
  title: string; timezone: string; generated_at: string;
  guests: { name: string; arrived: boolean; checked_in_at: string | null; checked_in_by: string | null; method: string | null }[];
};

// Quote every cell and neutralise spreadsheet formulas in member-entered text.
function cell(value: string) {
  const clean = value.replaceAll("\0", "");
  return `"${(/^\s*[=+\-@]/.test(clean) || /^[\t\r\n]/.test(clean) ? "'" : "") + clean.replaceAll('"', '""')}"`;
}
export function attendanceCsv(data: AttendanceExport) {
  const local = (value: string) => new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short", timeStyle: "medium", timeZone: data.timezone,
  }).format(new Date(value));
  const rows = [["Event", "Time zone", "Report generated (UTC)", "Guest", "Arrival", "Check-in (UTC)", "Check-in (local)", "Checked in by", "Method"],
    ...data.guests.map(g => [data.title, data.timezone, data.generated_at, g.name, g.arrived ? "Arrived" : "Not arrived",
      g.checked_in_at ?? "", g.checked_in_at ? local(g.checked_in_at) : "", g.checked_in_by ?? "",
      g.method === "qr" ? "QR scan" : g.method === "manual" ? "Code entered" : ""])];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
