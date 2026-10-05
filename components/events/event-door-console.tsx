"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

type DoorResult = { outcome: string; message: string; attendee_name: string | null; checked_in_at: string | null };
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export function EventDoorConsole({ eventId, title, startsAt, venue }: {
  eventId: string; title: string; startsAt: string; venue: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DoorResult | null>(null);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);

  function stopCamera() {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }
  useEffect(() => () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function checkIn(value: string, method: "qr" | "manual") {
    if (!value.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.rpc("door_check_in_event_member", {
      p_event_id: eventId,
      p_credential: value.trim(),
      p_method: method,
      p_device_label: "Event door",
    });
    setResult(error
      ? { outcome: "error", message: memberErrorMessage(error, "check this pass"), attendee_name: null, checked_in_at: null }
      : ((data?.[0] as DoorResult | undefined) ?? { outcome: "error", message: "No answer was returned. Please try again.", attendee_name: null, checked_in_at: null }));
    if (!error && data?.[0]?.outcome === "checked_in") setCode("");
    busyRef.current = false;
    setBusy(false);
  }

  async function startCamera() {
    setCameraMessage("");
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!BarcodeDetector) {
      setCameraMessage("QR scanning is not available in this browser. Ask the guest for the manual code on her pass.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      streamRef.current = stream;
      if (!videoRef.current) { stopCamera(); setCameraMessage("Camera preview is unavailable. Use the manual code instead."); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      scanningRef.current = true;
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const values = await detector.detect(videoRef.current);
          if (values[0]?.rawValue) { stopCamera(); await checkIn(values[0].rawValue, "qr"); return; }
        } catch { /* A missed frame can be retried. */ }
        if (scanningRef.current) window.requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch {
      stopCamera();
      setCameraMessage("Camera access was unavailable. Use the manual code instead.");
    }
  }

  return <section className="focused-admin-tool" aria-labelledby="door-heading">
    <div className="admin-section">
      <p className="eyebrow">Guest arrival</p>
      <h1 id="door-heading">{title}</h1>
      <p>{venue ? `${venue} · ` : ""}{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(startsAt))}</p>
      <p>Check one private pass at a time. Guest lists, payments and event settings are not available here.</p>
    </div>
    <div className="admin-section">
      <h2>Scan a guest pass</h2>
      <video ref={videoRef} playsInline muted style={{ display: cameraActive ? "block" : "none", width: "100%", maxWidth: 440 }} aria-label="Camera preview for guest pass" />
      <button className="button button-primary" disabled={busy} onClick={cameraActive ? stopCamera : () => void startCamera()} type="button">{cameraActive ? "Stop camera" : "Scan QR pass"}</button>
      {cameraMessage ? <p role="status">{cameraMessage}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void checkIn(code, "manual"); }}>
        <label htmlFor="door-manual-code">Or enter the 10-character code on the guest’s pass</label>
        <input id="door-manual-code" autoCapitalize="characters" autoComplete="off" maxLength={10} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <button className="button button-outline" disabled={busy || code.trim().length !== 10} type="submit">{busy ? "Checking…" : "Check in guest"}</button>
      </form>
      {result ? <div role="status" aria-live="polite" className="admin-section">
        <strong>{result.outcome === "checked_in" ? "Guest checked in" : result.outcome === "already_checked_in" ? "Already checked in" : "Pass not accepted"}</strong>
        <p>{result.attendee_name ? `${result.attendee_name} · ` : ""}{result.message}</p>
      </div> : null}
    </div>
  </section>;
}
