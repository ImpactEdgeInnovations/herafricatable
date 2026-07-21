"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AdminMember = {
  access_status: "pending" | "onboarding" | "active" | "dormant" | "suspended" | "deleted";
  company: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  display_name: string | null;
  email: string;
  job_title: string | null;
  onboarding_completed_at: string | null;
  profile_completion: number;
  user_id: string;
};

export function MemberReview({ initialMembers, currentUserId, migrationReady }: { initialMembers: AdminMember[]; currentUserId: string; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState(initialMembers);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const pendingCount = members.filter((member) => member.access_status === "pending").length;

  async function review(memberId: string, decision: "approve" | "suspend" | "restore") {
    setWorkingId(memberId);
    setMessage("");
    const { data, error } = await supabase.rpc("review_member", {
      p_member_id: memberId,
      p_decision: decision,
      p_note: "Updated from the Her Africa Table admin command center",
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMembers((current) => current.map((member) => member.user_id === memberId
        ? { ...member, access_status: data as AdminMember["access_status"] }
        : member));
      setMessage(`Member status updated to ${String(data).replace("_", " ")}.`);
    }
    setWorkingId(null);
  }

  return (
    <section className="admin-section" id="members" aria-labelledby="member-review-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">Member operations</p><h2 id="member-review-title">Review the table</h2><p>Approve verified registrations, follow incomplete onboarding, and pause access when required.</p></div>
        <span className="status-count">{pendingCount} pending</span>
      </div>

      {!migrationReady ? (
        <div className="admin-empty"><strong>Database update required</strong><p>Apply migration <code>20260721090000_member_onboarding_admin.sql</code> in Supabase before using member review.</p></div>
      ) : members.length === 0 ? (
        <div className="admin-empty"><strong>No members yet</strong><p>New authenticated accounts will appear here for review.</p></div>
      ) : (
        <div className="member-table-wrap">
          <table className="member-table">
            <thead><tr><th>Member</th><th>Profile</th><th>Status</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{members.map((member) => (
              <tr key={member.user_id}>
                <td><strong>{member.display_name || member.email}</strong>{member.display_name ? <small>{member.email}</small> : null}</td>
                <td>{member.job_title || member.company || member.country ? <><span>{member.job_title || "Profile started"}</span><small>{[member.company, member.city, member.country].filter(Boolean).join(" · ")} · {member.profile_completion}% complete</small></> : <span className="muted-value">Not completed · {member.profile_completion}%</span>}</td>
                <td><span className={`member-status status-${member.access_status}`}>{member.access_status}</span></td>
                <td>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(member.created_at))}</td>
                <td><div className="member-actions">
                  {member.access_status === "pending" ? <button disabled={workingId === member.user_id} onClick={() => review(member.user_id, "approve")}>Approve</button> : null}
                  {member.access_status === "suspended" ? <button disabled={workingId === member.user_id} onClick={() => review(member.user_id, "restore")}>Restore</button> : null}
                  {member.user_id !== currentUserId && !["suspended", "deleted"].includes(member.access_status) ? <button className="danger-action" disabled={workingId === member.user_id} onClick={() => review(member.user_id, "suspend")}>Suspend</button> : null}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
