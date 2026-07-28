"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export function MemberProfileActions({
  connectionDirection,
  connectionId,
  connectionStatus,
  memberId,
}: {
  connectionDirection: string | null;
  connectionId: string | null;
  connectionStatus: string | null;
  memberId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function request() {
    setBusy("request");
    setMessage("");
    const { error } = await supabase.rpc("request_connection", {
      p_connection_code: null,
      p_member_id: memberId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "send this connection request")
        : "Connection request sent. She remains in control of whether to accept.",
    );
    if (!error) router.refresh();
  }

  async function respond(action: "accept" | "ignore") {
    if (!connectionId) return;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc("respond_to_connection", {
      p_action: action,
      p_connection_id: connectionId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, `${action} this connection request`)
        : action === "accept"
          ? "Connection accepted. Private messaging is now available."
          : "Request ignored privately.",
    );
    if (!error) router.refresh();
  }

  async function messageMember() {
    if (!connectionId) return;
    setBusy("message");
    const { data, error } = await supabase.rpc("ensure_conversation", {
      p_connection_id: connectionId,
    });
    setBusy("");
    if (error) {
      setMessage(memberErrorMessage(error, "open this conversation"));
      return;
    }
    router.push(`/messages?conversation=${data}`);
  }

  async function safety(action: "block" | "report") {
    const result = await ask(
      action === "block"
        ? {
            title: "Block this member?",
            description:
              "You will no longer be able to discover or message each other. Your reason stays private.",
            confirmLabel: "Block member",
            tone: "danger",
            fields: [
              {
                name: "reason",
                label: "Private reason (optional)",
                type: "textarea",
                maxLength: 1000,
              },
            ],
          }
        : {
            title: "Report this profile privately",
            description:
              "Give the moderation team enough context to review the concern. The member is not shown your report.",
            confirmLabel: "Submit report",
            tone: "danger",
            fields: [
              {
                name: "category",
                label: "Reason",
                type: "select",
                initialValue: "safety",
                options: [
                  { label: "Harassment", value: "harassment" },
                  { label: "Spam", value: "spam" },
                  {
                    label: "Misrepresentation",
                    value: "misrepresentation",
                  },
                  { label: "Privacy", value: "privacy" },
                  { label: "Safety", value: "safety" },
                  { label: "Other", value: "other" },
                ],
              },
              {
                name: "details",
                label: "What happened?",
                type: "textarea",
                required: true,
                minLength: 10,
                maxLength: 2000,
              },
            ],
          },
    );
    if (!result) return;
    setBusy(action);
    setMessage("");
    const { error } =
      action === "block"
        ? await supabase.rpc("block_member", {
            p_member_id: memberId,
            p_reason: String(result.reason ?? ""),
          })
        : await supabase.rpc("report_member", {
            p_category: String(result.category),
            p_details: String(result.details),
            p_member_id: memberId,
          });
    setBusy("");
    if (error) {
      setMessage(memberErrorMessage(error, `${action} this member`));
      return;
    }
    if (action === "block") router.push("/network");
    else setMessage("Report submitted privately to the moderation team.");
  }

  return (
    <>
      <div className="member-profile-actions">
        {connectionStatus === "accepted" ? (
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void messageMember()}
          >
            {busy === "message" ? "Opening…" : "Message"}
          </button>
        ) : connectionStatus === "pending" &&
          connectionDirection === "incoming" ? (
          <>
            <button
              className="button button-primary"
              disabled={Boolean(busy)}
              onClick={() => void respond("accept")}
            >
              Accept connection
            </button>
            <button
              className="button button-outline"
              disabled={Boolean(busy)}
              onClick={() => void respond("ignore")}
            >
              Ignore privately
            </button>
          </>
        ) : connectionStatus === "pending" ? (
          <span className="member-profile-pending">
            Connection request pending
          </span>
        ) : (
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void request()}
          >
            {busy === "request" ? "Sending…" : "Request introduction"}
          </button>
        )}
        <button
          className="member-profile-safety"
          disabled={Boolean(busy)}
          onClick={() => void safety("report")}
        >
          Report
        </button>
        <button
          className="member-profile-safety danger-action"
          disabled={Boolean(busy)}
          onClick={() => void safety("block")}
        >
          Block
        </button>
      </div>
      {message ? (
        <p className="network-message member-profile-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </>
  );
}
