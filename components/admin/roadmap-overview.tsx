import Link from "next/link";
import type { LaunchGateCheck } from "@/components/admin/launch-gate-control";

type PilotEvent = {
  status: string;
  title: string;
};

type Sprint = {
  title: string;
  built: string;
  remaining: string;
  owner: string;
  href: string;
  gateKeys: string[];
};

const pilotGateKeys = [
  "member_email_otp", "admin_email_otp", "production_migration_parity",
  "authorization_boundaries", "backup_restore_rehearsal", "manual_registration",
  "event_publish_and_checkin", "notification_delivery", "safety_support_privacy",
  "device_accessibility",
];

const sprints: Sprint[] = [
  {
    title: "Choose and prepare the pilot",
    built: "A private event draft and event setup checklist are in place.",
    remaining: "Confirm the venue and capacity; onboard Seina as Host; name the safety and arrival leads. Keep the event private until the launch checks pass.",
    owner: "Product owner and event team",
    href: "/admin/events?view=overview",
    gateKeys: [],
  },
  {
    title: "Make joining and booking work",
    built: "Email sign-in, manual place requests, decisions, passes and message queues are built.",
    remaining: "Use separate real inboxes to prove the code, request, approval, decline, capacity and delivered emails.",
    owner: "Admin and test attendees",
    href: "/admin/operations?area=release-tools#launch-gates",
    gateKeys: ["member_email_otp", "admin_email_otp", "manual_registration", "notification_delivery"],
  },
  {
    title: "Rehearse the Host workspace",
    built: "A scoped Host draft, review, changes and pause workflow are built.",
    remaining: "An approved Host must submit real pilot content; Admin must review it. Prove the Host cannot see another event or Admin-only data.",
    owner: "Seina and Super Admin",
    href: "/admin/events?view=host",
    gateKeys: ["authorization_boundaries"],
  },
  {
    title: "Finish the event page",
    built: "The public event page, arrival information and ticket availability states are built.",
    remaining: "Review the actual words, programme and images on mobile; test an unpublished link and accessibility before publication.",
    owner: "Event team and member testers",
    href: "/admin/events?view=edit",
    gateKeys: ["device_accessibility"],
  },
  {
    title: "Prove consent-led introductions",
    built: "Private event QR introductions and a manual fallback are built.",
    remaining: "Rehearse opt-in, blocked pairs, duplicate scans and no-camera fallback with distinct attendees.",
    owner: "Attendees and event team",
    href: "/admin/events?view=arrival",
    gateKeys: [],
  },
  {
    title: "Rehearse table rounds",
    built: "Host planning, Admin review and private attendee schedules are built.",
    remaining: "Run a twenty-person rehearsal, including capacity, absent guests and people who must not be paired.",
    owner: "Host, Admin and test attendees",
    href: "/admin/events?view=overview",
    gateKeys: [],
  },
  {
    title: "Check Nia at events",
    built: "Nia can use permitted event facts and has a safe fallback when details or the provider are unavailable.",
    remaining: "Test helpfulness and accuracy with public, private and missing event information; verify no private data leaks.",
    owner: "Member testers and Admin",
    href: "/admin/operations?area=people-and-launch",
    gateKeys: [],
  },
  {
    title: "Close the loop after the event",
    built: "Feedback, recap, follow-up invitations, Community bridge and Host outcome views are built.",
    remaining: "Reconcile the real attendee totals and prove that only confirmed attendees can see private follow-up content.",
    owner: "Host and Admin",
    href: "/admin/events?view=follow-up",
    gateKeys: [],
  },
  {
    title: "Test and protect the live service",
    built: "Automated application and isolated database checks run in GitHub on each push.",
    remaining: "Finish migration parity, role-by-role live testing, backup restore, safety response and device checks.",
    owner: "Engineering, operations and testers",
    href: "/admin/operations?area=release-tools#launch-gates",
    gateKeys: ["production_migration_parity", "authorization_boundaries", "backup_restore_rehearsal", "safety_support_privacy", "device_accessibility"],
  },
  {
    title: "Make the pilot decision",
    built: "The release checklist and private-by-default controls are in place.",
    remaining: "Complete the twenty-attendee journey, review every launch check, then record a human go/no-go decision before opening guest access.",
    owner: "Product owner and Super Admin",
    href: "/admin/operations?area=release-tools#launch-gates",
    gateKeys: pilotGateKeys,
  },
];

function accepted(check: LaunchGateCheck | undefined) {
  return check?.status === "passed" && Boolean(check.verified_at)
    && (check.evidence_note?.trim().length ?? 0) >= 20;
}

export function RoadmapOverview({
  checks,
  checksReady,
  pilotEvent,
  pilotEventReady,
}: {
  checks: LaunchGateCheck[];
  checksReady: boolean;
  pilotEvent: PilotEvent | null;
  pilotEventReady: boolean;
}) {
  const byKey = new Map(checks.map((check) => [check.check_key, check]));
  const evidenceAvailable = checksReady && pilotGateKeys.every((key) => byKey.has(key));
  const acceptedCount = pilotGateKeys.filter((key) => accepted(byKey.get(key))).length;

  return (
    <section className="admin-section roadmap-overview pilot-taskboard" id="roadmap" aria-labelledby="roadmap-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Event-first pilot · ten sprints</p>
          <h2 id="roadmap-title">What is done. What is left.</h2>
          <p>Built means the feature exists in the app. A live check is only complete when evidence is recorded below. These are not the same thing.</p>
        </div>
        <a href="https://github.com/ImpactEdgeInnovations/herafricatable/blob/main/docs/EVENT_FIRST_PILOT_EXECUTION.md" target="_blank" rel="noreferrer">Full sprint plan ↗</a>
      </div>
      <div className="pilot-taskboard-summary">
        <p><strong>{pilotEventReady ? pilotEvent?.status === "draft" ? "Private draft found" : pilotEvent?.status === "published" ? "Pilot is public — review gates" : pilotEvent ? "Pilot needs review" : "Pilot not found" : "Pilot status unavailable"}</strong><span>{pilotEvent ? pilotEvent.title : "Open the event desk to check the pilot setup."}</span></p>
        <p><strong>{evidenceAvailable ? `${acceptedCount} of ${pilotGateKeys.length}` : "Unavailable"}</strong><span>pilot launch checks accepted with evidence</span></p>
        <p><strong>Not a go decision</strong><span>Public guest access and automatic payments remain separate controls.</span></p>
      </div>
      <div className="roadmap-list">
        {sprints.map((sprint, index) => {
          const recorded = sprint.gateKeys.filter((key) => accepted(byKey.get(key))).length;
          const blocked = sprint.gateKeys.some((key) => byKey.get(key)?.status === "blocked");
          const evidence = !evidenceAvailable ? "Evidence unavailable"
            : !sprint.gateKeys.length ? "Dedicated live rehearsal needed"
              : blocked ? "A related check is blocked"
                : `${recorded} of ${sprint.gateKeys.length} related checks accepted`;
          return (
            <article key={sprint.title}>
              <span className="roadmap-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="roadmap-copy">
                <div><h3>{sprint.title}</h3><small>{sprint.owner}</small></div>
                <div><p><strong>Built:</strong> {sprint.built}</p><p><strong>Still to do:</strong> {sprint.remaining}</p></div>
              </div>
              <div className="roadmap-progress">
                <strong>{evidence}</strong>
                <Link href={sprint.href}>Open this work →</Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="pilot-taskboard-footnote">Related launch checks are live database records, not automatic sprint sign-offs. A sprint also needs the real-world proof described above. Use Launch gates to record verified results.</p>
    </section>
  );
}
