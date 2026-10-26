"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import styles from "./event-door-console.module.css";

type DoorResult = { outcome: string; message: string; attendee_name: string | null; checked_in_at: string | null };
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export function EventDoorConsole({ eventId, title, startsAt, venue, timeZone = "Africa/Nairobi" }: {
  eventId: string; title: string; startsAt: string; venue: string | null; timeZone?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DoorResult | null>(null);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [lastMethod, setLastMethod] = useState<"qr" | "manual">("manual");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const manualRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(true);
  const startingRef = useRef(false);
  const cameraEpoch = useRef(0);
  const focusNextCode = useRef(false);
  useEffect(() => {
    if (!result && focusNextCode.current) { focusNextCode.current = false; manualRef.current?.focus(); }
  }, [result]);

  function stopCamera() {
    ++cameraEpoch.current; startingRef.current = false; setCameraStarting(false);
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }
  useEffect(() => {
    aliveRef.current = true;
    const hide = () => { if (document.hidden) stopCamera(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stopCamera);
    return () => {
      aliveRef.current = false; ++cameraEpoch.current; startingRef.current = false;
      scanningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stopCamera);
    };
  }, []);

  async function checkIn(value: string, method: "qr" | "manual") {
    if (!value.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setLastMethod(method);
    setResult(null);
    try {
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
    } catch (failure) {
      setResult({ outcome:"error",message:memberErrorMessage(failure,"confirm this check-in; retrying the same pass will not add a second arrival"),attendee_name:null,checked_in_at:null });
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function startCamera() {
    if (startingRef.current || scanningRef.current || busyRef.current) return;
    startingRef.current = true; const epoch = ++cameraEpoch.current;
    setCameraStarting(true); setResult(null);
    setCameraMessage("");
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!BarcodeDetector) {
      setCameraMessage("QR scanning is not available in this browser. Ask the guest for the manual code on her pass.");
      startingRef.current = false; setCameraStarting(false); manualRef.current?.focus();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      if (!aliveRef.current || document.hidden || epoch !== cameraEpoch.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      if (!videoRef.current) { stopCamera(); setCameraMessage("Camera preview is unavailable. Use the manual code instead."); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (!aliveRef.current || epoch !== cameraEpoch.current) { stream.getTracks().forEach(track => track.stop()); return; }
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
      if (aliveRef.current && epoch === cameraEpoch.current) { stopCamera(); setCameraMessage("Camera access was unavailable. Allow camera access in your browser, or enter the code below."); manualRef.current?.focus(); }
    } finally { if (aliveRef.current && epoch === cameraEpoch.current) { startingRef.current = false; setCameraStarting(false); } }
  }

  return <section className={styles.console} aria-labelledby="door-heading">
    <header className={styles.event}>
      <p className={styles.eyebrow}>Guest check-in · This event only</p>
      <h1 id="door-heading">{title}</h1>
      <p>{venue ? `${venue} · ` : ""}{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date(startsAt))} · {timeZone}</p>
      <p>Ask the guest to open her pass. A pass for another event will not work here.</p>
    </header>
    <div className={styles.workspace}>
      {result ? <div role="status" aria-live="polite" className={`${styles.result} ${result.outcome === "checked_in" ? styles.success : result.outcome === "already_checked_in" ? styles.duplicate : styles.warning}`}>
        <span aria-hidden="true" className={styles.resultIcon}>{result.outcome === "checked_in" ? "✓" : result.outcome === "already_checked_in" ? "↩" : "!"}</span>
        <h2>{result.outcome === "checked_in" ? "Guest checked in" : result.outcome === "already_checked_in" ? "Already checked in" : result.outcome === "error" ? "Check-in not confirmed" : "Pass not accepted"}</h2>
        {result.attendee_name ? <strong>{result.attendee_name}</strong> : null}
        <p>{result.message}</p>
        {result.checked_in_at ? <p>Recorded {new Intl.DateTimeFormat("en-KE", { hour:"numeric", minute:"2-digit", timeZone }).format(new Date(result.checked_in_at))} · {timeZone}</p> : null}
        <button type="button" className="button button-primary" disabled={busy} onClick={() => { if(lastMethod === "qr") void startCamera(); else { focusNextCode.current = true; setResult(null); setCode(""); } }}>{lastMethod === "qr" ? "Scan next guest" : "Next guest"}</button>
      </div> : null}
      <div className={styles.scan} hidden={Boolean(result)}>
      <h2>Scan a pass</h2><p>Hold the QR square inside the camera view. Check one pass at a time.</p>
      <video ref={videoRef} playsInline muted className={styles.video} hidden={!cameraActive} aria-label="Camera preview for guest pass" />
      <button className="button button-primary" disabled={busy || cameraStarting} onClick={cameraActive ? stopCamera : () => void startCamera()} type="button">{cameraStarting ? "Opening camera…" : cameraActive ? "Stop camera" : "Scan QR pass"}</button>
      {cameraMessage ? <p role="status" className={styles.cameraNotice}>{cameraMessage}</p> : null}
      </div>
      <form className={styles.manual} hidden={Boolean(result)} onSubmit={(event) => { event.preventDefault(); stopCamera(); void checkIn(code, "manual"); }}>
        <label htmlFor="door-manual-code">Or enter the pass code</label><p id="door-code-hint">The 10 characters shown below the guest’s QR square.</p>
        <input ref={manualRef} id="door-manual-code" aria-describedby="door-code-hint" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={10} value={code} onChange={(event) => setCode(event.target.value.replace(/\s/g, "").toUpperCase())} placeholder="10-character code" />
        <button className="button button-outline" disabled={busy || code.trim().length !== 10} type="submit">{busy ? "Checking…" : "Check in guest"}</button>
      </form>
    </div>
    <p className={styles.privacy}>Only successful check-ins are saved as arrivals. Scanning a pass twice won’t add another guest. Your access does not include guest lists, payments or event settings.</p>
  </section>;
}
