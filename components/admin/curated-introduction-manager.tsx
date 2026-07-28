"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminMember } from "@/components/admin/member-review";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type AdminCuratedIntroduction = {
  created_at: string;
  introduction_id: string;
  member_high: string;
  member_high_decision: "pending" | "accepted" | "declined";
  member_high_email: string;
  member_high_name: string | null;
  member_low: string;
  member_low_decision: "pending" | "accepted" | "declined";
  member_low_email: string;
  member_low_name: string | null;
  proposed_by: string;
  reason: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  updated_at: string;
};
export type AdminConnectionAvailability = {
  request_mode: "open" | "curated_only" | "paused";
  user_id: string;
};

export function CuratedIntroductionManager({
  introductions,
  members,
  availability,
  migrationReady,
}: {
  introductions: AdminCuratedIntroduction[];
  members: AdminMember[];
  availability: AdminConnectionAvailability[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const activeMembers = members.filter(
    (member) =>
      member.access_status === "active" &&
      Boolean(member.display_name) &&
      availability.find((item) => item.user_id === member.user_id)
        ?.request_mode !== "paused",
  );
  const modeFor = (memberId: string) =>
    availability.find((item) => item.user_id === memberId)?.request_mode ??
    "open";
  const [memberA, setMemberA] = useState("");
  const [memberB, setMemberB] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberA || !memberB || memberA === memberB || reason.trim().length < 20)
      return;
    setBusy("create");
    setMessage("");
    const { error } = await supabase.rpc("create_curated_introduction", {
      p_member_a: memberA,
      p_member_b: memberB,
      p_reason: reason.trim(),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "create this curated introduction")
        : "Introduction proposed. Both members were notified and must consent independently.",
    );
    if (!error) {
      setMemberA("");
      setMemberB("");
      setReason("");
      router.refresh();
    }
  }

  async function cancelIntroduction(introductionId: string) {
    const result = await ask({
      title: "Withdraw this introduction?",
      description:
        "The pending invitation will close for both members. No connection or private contact access will be created.",
      confirmLabel: "Withdraw introduction",
      tone: "danger",
    });
    if (!result) return;
    setBusy(introductionId);
    setMessage("");
    const { error } = await supabase.rpc("cancel_curated_introduction", {
      p_introduction_id: introductionId,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "withdraw this introduction")
        : "Introduction withdrawn.",
    );
    if (!error) router.refresh();
  }

  return (
    <section
      aria-labelledby="curated-introduction-title"
      className="admin-section curated-introduction-manager"
    >
      {dialog}
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">High-trust community care</p>
          <h2 id="curated-introduction-title">Curate an introduction</h2>
          <p>
            Suggest a relevant relationship without forcing access. Both
            members see the same reason and decide privately before messaging
            opens.
          </p>
        </div>
        <span className="status-count">
          {introductions.filter((item) => item.status === "pending").length}{" "}
          awaiting consent
        </span>
      </div>

      {!migrationReady ? (
        <div className="admin-empty">
          <strong>Curated introductions are temporarily unavailable</strong>
          <p>No member invitation has been created. Reload after the migration.</p>
        </div>
      ) : activeMembers.length < 2 ? (
        <div className="admin-empty">
          <strong>Two active members are required</strong>
          <p>
            Approve and activate another complete member profile before
            proposing an introduction.
          </p>
        </div>
      ) : (
        <>
          <form
            className="curated-introduction-form"
            onSubmit={createIntroduction}
          >
            <label>
              First member
              <select
                onChange={(event) => setMemberA(event.target.value)}
                required
                value={memberA}
              >
                <option value="">Choose a member</option>
                {activeMembers.map((member) => (
                  <option
                    disabled={member.user_id === memberB}
                    key={member.user_id}
                    value={member.user_id}
                  >
                    {member.display_name} ·{" "}
                    {[member.job_title, member.company]
                      .filter(Boolean)
                      .join(", ")}
                    {modeFor(member.user_id) === "curated_only"
                      ? " · curated only"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Second member
              <select
                onChange={(event) => setMemberB(event.target.value)}
                required
                value={memberB}
              >
                <option value="">Choose a member</option>
                {activeMembers.map((member) => (
                  <option
                    disabled={member.user_id === memberA}
                    key={member.user_id}
                    value={member.user_id}
                  >
                    {member.display_name} ·{" "}
                    {[member.job_title, member.company]
                      .filter(Boolean)
                      .join(", ")}
                    {modeFor(member.user_id) === "curated_only"
                      ? " · curated only"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="curated-introduction-reason">
              Why should they meet?
              <textarea
                maxLength={1000}
                minLength={20}
                onChange={(event) => setReason(event.target.value)}
                placeholder="For example: Both are expanding women-led businesses across East Africa and could exchange practical distribution experience."
                required
                rows={4}
                value={reason}
              />
              <small>
                Both members will see this. Include useful context, never
                confidential information.
              </small>
            </label>
            <button
              className="button button-primary"
              disabled={
                busy !== "" ||
                !memberA ||
                !memberB ||
                memberA === memberB ||
                reason.trim().length < 20
              }
              type="submit"
            >
              {busy === "create" ? "Proposing…" : "Propose introduction"}
            </button>
          </form>

          <div className="curated-introduction-ledger">
            {introductions.length ? (
              introductions.map((item) => (
                <article key={item.introduction_id}>
                  <header>
                    <span className={`member-status status-${item.status}`}>
                      {item.status}
                    </span>
                    <time>
                      {new Intl.DateTimeFormat("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(item.created_at))}
                    </time>
                  </header>
                  <h3>
                    {item.member_low_name || item.member_low_email}
                    <span>and</span>
                    {item.member_high_name || item.member_high_email}
                  </h3>
                  <p>{item.reason}</p>
                  <footer>
                    <span>
                      First: {item.member_low_decision.replace("_", " ")}
                    </span>
                    <span>
                      Second: {item.member_high_decision.replace("_", " ")}
                    </span>
                    {item.status === "pending" ? (
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void cancelIntroduction(item.introduction_id)
                        }
                      >
                        Withdraw
                      </button>
                    ) : null}
                  </footer>
                </article>
              ))
            ) : (
              <div className="admin-empty">
                <strong>No curated introductions yet</strong>
                <p>
                  Use this deliberately when there is a clear, member-relevant
                  reason for two people to meet.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {message ? (
        <p className="manager-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
