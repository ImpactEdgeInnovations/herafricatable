"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CheckinEvent = {
  ends_at: string;
  id: string;
  starts_at: string;
  title: string;
};
export type CheckinAttendee = {
  attendee_email: string;
  attendee_name: string;
  checked_in_at: string | null;
  checked_in_by_email: string | null;
  checkin_id: string | null;
  event_id: string;
  membership_status: string;
  method: string | null;
  order_reference: string | null;
  ticket_name: string | null;
  user_id: string;
};
type ScanResult = {
  attendee_email: string | null;
  attendee_name: string | null;
  checked_in_at: string | null;
  checkin_id: string | null;
  message: string;
  outcome: string;
};
type BarcodeDetectorShape = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorShape;

export function EventCheckinConsole({
  events,
  initialAttendees,
  migrationReady,
}: {
  events: CheckinEvent[];
  initialAttendees: CheckinAttendee[];
  migrationReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [attendees, setAttendees] = useState(initialAttendees);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const currentEvent = events.find((event) => event.id === eventId);
  const eventAttendees = attendees.filter(
    (attendee) => attendee.event_id === eventId,
  );
  const checkedIn = eventAttendees.filter((attendee) => attendee.checked_in_at);
  function stopCamera() {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }
  useEffect(
    () => () => {
      scanningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  async function refresh(selectedEventId = eventId) {
    const { data } = await supabase.rpc("list_event_checkins", {
      p_event_id: selectedEventId,
    });
    if (!data) return;
    setAttendees((current) => [
      ...current.filter((item) => item.event_id !== selectedEventId),
      ...(data as Omit<CheckinAttendee, "event_id">[]).map((item) => ({
        ...item,
        event_id: selectedEventId,
      })),
    ]);
  }
  async function submit(value: string, method: "manual" | "qr") {
    if (!eventId || !value.trim() || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("check_in_event_member", {
      p_credential: value.trim(),
      p_device_label: navigator.userAgent.slice(0, 120),
      p_event_id: eventId,
      p_method: method,
    });
    setBusy(false);
    if (error) {
      setResult({
        attendee_email: null,
        attendee_name: null,
        checked_in_at: null,
        checkin_id: null,
        message: error.message,
        outcome: "error",
      });
      return;
    }
    const next = (data?.[0] as ScanResult | undefined) ?? null;
    setResult(next);
    if (
      next?.outcome === "checked_in" ||
      next?.outcome === "already_checked_in"
    )
      await refresh();
    if (next?.outcome === "checked_in") setCredential("");
  }
  async function startCamera() {
    setCameraMessage("");
    const Detector = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!Detector) {
      setCameraMessage(
        "QR scanning is not supported by this browser. Enter the manual code below.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      scanningRef.current = true;
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value) {
            stopCamera();
            await submit(value, "qr");
            return;
          }
        } catch {
          /* retry next frame */
        }
        if (scanningRef.current)
          window.requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch {
      setCameraMessage(
        "Camera access was unavailable. Enter the attendee’s manual code below.",
      );
      stopCamera();
    }
  }
  async function reverse(checkin: CheckinAttendee) {
    if (!checkin.checkin_id) return;
    const confirmation = await ask({ title: "Reverse this attendee check-in?", description: "The attendee will return to the expected list and the reversal will be recorded in the event audit history.", confirmLabel: "Reverse check-in", tone: "danger", fields: [{ name: "reason", label: "Reason for reversal", type: "textarea", required: true, minLength: 6, maxLength: 500, help: "Use at least 6 characters. Do not add unrelated personal information." }] });
    if (!confirmation) return;
    const reason = String(confirmation.reason ?? "");
    setBusy(true);
    const { error } = await supabase.rpc("reverse_event_checkin", {
      p_checkin_id: checkin.checkin_id,
      p_reason: reason,
    });
    setBusy(false);
    setResult(
      error
        ? {
            attendee_email: null,
            attendee_name: null,
            checked_in_at: null,
            checkin_id: null,
            message: error.message,
            outcome: "error",
          }
        : {
            attendee_email: checkin.attendee_email,
            attendee_name: checkin.attendee_name,
            checked_in_at: null,
            checkin_id: null,
            message: "Check-in reversed and recorded in the audit log.",
            outcome: "reversed",
          },
    );
    if (!error) await refresh();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="check-in">
        <div className="admin-empty">
          <strong>Check-in migration required</strong>
          <p>
            Run the event check-in migration in Supabase, then reload this page.
          </p>
        </div>
      </section>
    );
  return (
    <section className="admin-section checkin-console" id="check-in">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Door operations</p>
          <h2>Event check-in</h2>
          <p>
            Scan a private member pass or enter its manual fallback. Every
            action is event-scoped and audited.
          </p>
        </div>
        <div className="checkin-event-select">
          <label htmlFor="checkin-event">Active event</label>
          <select
            id="checkin-event"
            value={eventId}
            onChange={(e) => {
              stopCamera();
              setEventId(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Choose an event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!currentEvent ? (
        <div className="admin-empty">
          <strong>No manageable event selected</strong>
          <p>
            Create an event or ask a super admin to assign your event staff
            scope.
          </p>
        </div>
      ) : (
        <>
          <div className="checkin-metrics">
            <article>
              <strong>{checkedIn.length}</strong>
              <span>Checked in</span>
            </article>
            <article>
              <strong>{eventAttendees.length}</strong>
              <span>Confirmed</span>
            </article>
            <article>
              <strong>
                {Math.max(eventAttendees.length - checkedIn.length, 0)}
              </strong>
              <span>Expected</span>
            </article>
          </div>
          <div className="checkin-workspace">
            <div className="checkin-scanner">
              <div className={`checkin-camera${cameraActive ? " active" : ""}`}>
                <video ref={videoRef} playsInline muted />
                <span>
                  {cameraActive
                    ? "Hold the QR code inside the frame"
                    : "Camera starts only when requested"}
                </span>
              </div>
              <div className="checkin-camera-actions">
                {cameraActive ? (
                  <button
                    className="button button-outline"
                    onClick={stopCamera}
                  >
                    Stop camera
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    onClick={() => void startCamera()}
                  >
                    Scan QR pass
                  </button>
                )}
              </div>
              {cameraMessage ? (
                <p className="manager-message" role="status">
                  {cameraMessage}
                </p>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(
                    credential,
                    credential.startsWith("HATCHECKIN:") ? "qr" : "manual",
                  );
                }}
              >
                <label htmlFor="manual-checkin">Manual code</label>
                <div>
                  <input
                    id="manual-checkin"
                    autoComplete="off"
                    maxLength={180}
                    placeholder="Enter 10-character code"
                    value={credential}
                    onChange={(e) =>
                      setCredential(e.target.value.toUpperCase())
                    }
                  />
                  <button
                    className="button button-primary"
                    disabled={busy || !credential.trim()}
                  >
                    {busy ? "Checking…" : "Check in"}
                  </button>
                </div>
              </form>
              {result ? (
                <div
                  className={`checkin-result ${result.outcome}`}
                  role="status"
                >
                  <strong>{result.message}</strong>
                  {result.attendee_name ? (
                    <span>
                      {result.attendee_name} · {result.attendee_email}
                    </span>
                  ) : null}
                  {result.checked_in_at ? (
                    <small>
                      {new Intl.DateTimeFormat("en-KE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(result.checked_in_at))}
                    </small>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="checkin-roster">
              <header>
                <strong>Guest list</strong>
                <span>
                  {checkedIn.length} of {eventAttendees.length}
                </span>
              </header>
              {eventAttendees.length ? (
                <div>
                  {eventAttendees.map((attendee) => (
                    <article key={attendee.user_id}>
                      <span
                        className={
                          attendee.checked_in_at ? "checked" : "pending"
                        }
                        aria-label={
                          attendee.checked_in_at
                            ? "Checked in"
                            : "Awaiting check-in"
                        }
                      />
                      <div>
                        <strong>{attendee.attendee_name}</strong>
                        <small>
                          {attendee.ticket_name || "Confirmed guest"} ·{" "}
                          {attendee.order_reference || attendee.attendee_email}
                        </small>
                      </div>
                      <div>
                        {attendee.checked_in_at ? (
                          <>
                            <time>
                              {new Intl.DateTimeFormat("en-KE", {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(attendee.checked_in_at))}
                            </time>
                            <button
                              disabled={busy}
                              onClick={() => void reverse(attendee)}
                            >
                              Reverse
                            </button>
                          </>
                        ) : (
                          <span>Expected</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-empty">
                  <strong>No confirmed attendees yet</strong>
                  <p>Approved registrations appear here automatically.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {dialog}
    </section>
  );
}
