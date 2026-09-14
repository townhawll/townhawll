"use client";

export default function SentryTestPage() {
  return (
    <button
      onClick={() => {
        throw new Error("TownHawll Sentry test error");
      }}
    >
      Trigger Sentry test
    </button>
  );
}