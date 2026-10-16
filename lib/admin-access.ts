import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export { requireNotificationAdmin as requireSuperAdmin } from "@/lib/notifications/admin-access";
type TeamRole = "super_admin" | "event_staff" | "moderator";
/** Database time and deterministic priority are authoritative for page access. */
export async function getActiveAdminRole(client: SupabaseClient, allowed: TeamRole[]) {
  try {
    const { data, error } = await client.rpc("get_my_active_admin_role");
    return { data: !error && allowed.includes(data as TeamRole) ? { role: data as TeamRole } : null, error };
  } catch { return { data: null, error: new Error("Admin access could not be checked") }; }
}
