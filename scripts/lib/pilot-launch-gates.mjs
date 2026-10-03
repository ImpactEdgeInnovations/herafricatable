// A free, manually reviewed public pilot does not require live Paystack
// reconciliation. It still needs the operational and human-safety evidence
// below before engineering can recommend an owner go/no-go decision.
export const pilotLaunchKeys = Object.freeze([
  "member_email_otp",
  "admin_email_otp",
  "production_migration_parity",
  "authorization_boundaries",
  "backup_restore_rehearsal",
  "manual_registration",
  "event_publish_and_checkin",
  "notification_delivery",
  "safety_support_privacy",
  "device_accessibility",
]);

export function pilotLaunchGateBlockers(checks) {
  const byKey = new Map(checks.map((check) => [check.key, check]));
  return pilotLaunchKeys
    .filter((key) => {
      const check = byKey.get(key);
      return !check || check.status !== "passed" || !check.verified || !check.evidenceRecorded;
    })
    .map((key) => `launch_${key}_not_accepted`);
}
