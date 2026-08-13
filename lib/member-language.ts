const statusLabels: Record<string, string> = {
  approved: "Approved",
  approved_pending_payment: "Approved — payment needed",
  cancelled: "Cancelled",
  completed: "Complete",
  declined: "Not approved",
  failed: "Needs attention",
  fulfilled: "Confirmed",
  in_review: "With our team",
  invited: "Invitation waiting",
  open: "Open",
  paid: "Paid",
  paused: "Temporarily paused",
  pending: "Waiting",
  pending_payment: "Payment needed",
  pending_review: "Waiting for our team",
  processing: "Being prepared",
  rejected: "Not approved",
  requested: "Request sent",
  reviewing: "With our team",
  submitted: "Sent",
  suspended: "Temporarily paused",
  waitlisted: "On the waitlist",
};

export function memberStatusLabel(status: string | null | undefined) {
  if (!status) return "Not started";
  return (
    statusLabels[status] ??
    status
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}
