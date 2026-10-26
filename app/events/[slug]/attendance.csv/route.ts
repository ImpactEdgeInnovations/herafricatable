import { createClient } from "@/lib/supabase/server";
import { attendanceCsv, type AttendanceExport } from "@/lib/events/attendance-export";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Sign in before downloading attendance.", { status: 401, headers: privateHeaders });
    const { data, error } = await supabase.rpc("get_my_event_arrival_export", { p_slug: slug });
    if (error || !data) return new Response(error?.message === "This event is too large for a single attendance download"
      ? "This event is too large for a single attendance download. Contact support."
      : "Attendance could not be downloaded. Check that you are an active Host, then try again.", { status: error?.message === "This event is too large for a single attendance download" ? 413 : error?.code === "P0001" ? 403 : 503, headers: privateHeaders });
    return new Response(attendanceCsv(data as AttendanceExport), { headers: {
      ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hat-attendance.csv"',
    } });
  } catch {
    return new Response("We could not prepare the attendance file. Please try again.", { status: 503, headers: privateHeaders });
  }
}
