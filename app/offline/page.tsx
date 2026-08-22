"use client";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <section>
        <span className="offline-mark" aria-hidden="true">H</span>
        <p className="eyebrow">Her Africa Table</p>
        <h1>You’re offline for a moment.</h1>
        <p>
          Reconnect to open your Communities, messages and event details. We do
          not store private member pages on this device for offline viewing.
        </p>
        <button className="button button-primary" onClick={() => window.location.reload()} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
