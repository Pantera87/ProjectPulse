"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAiBusy } from "./ai-activity-provider";

/**
 * Floating "Check now" button for source detail pages.
 *
 * The real action bar sits near the top of the page, so once you scroll
 * down through the updates / snapshots the button is out of reach. This
 * pill stays pinned to the bottom-right and only shows when the top
 * SourceActions bar has scrolled out of view (IntersectionObserver on the
 * element that has the `data-source-actions` marker).
 *
 * Both buttons coordinate through the custom DOM events emitted by
 * SourceActions (`source-action-start` / `source-action-end`) so clicking
 * one disables the other for the duration of the request.
 */
export default function FloatingCheckButton({ id }: { id: number }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const aiBusy = useAiBusy();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Watch the top action bar (and the element itself as a fallback).
    const targets = [
      document.querySelector("[data-source-actions]"),
      root.current,
    ].filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const onIntersect = (entries: IntersectionObserverEntry[]) =>
      setVisible(entries.some((e) => !e.isIntersecting));
    const obs = new IntersectionObserver(onIntersect);
    targets.forEach((el) => obs.observe(el));

    const onStart = (e: Event) => {
      if ((e as CustomEvent).detail === "check") setBusy(true);
    };
    const onEnd = () => setBusy(false);
    window.addEventListener("source-action-start", onStart);
    window.addEventListener("source-action-end", onEnd);
    return () => {
      obs.disconnect();
      window.removeEventListener("source-action-start", onStart);
      window.removeEventListener("source-action-end", onEnd);
    };
  }, []);

  async function runCheck() {
    setBusy(true);
    // Mirror into the top SourceActions bar so both buttons show "Checking…".
    window.dispatchEvent(new CustomEvent("source-action-start", { detail: "check" }));
    try {
      await fetch(`/api/sources/${id}/check`, { method: "POST" });
    } finally {
      setBusy(false);
      window.dispatchEvent(new CustomEvent("source-action-end"));
    }
    router.refresh();
  }

  if (!visible) return null;
  const disabled = busy || aiBusy;
  return (
    <div ref={root} data-floating-check className="fixed bottom-5 right-5 z-40">
      <button
        onClick={runCheck}
        disabled={disabled}
        className="glass btn-primary px-4 py-2.5 text-sm shadow-xl"
        title={
          aiBusy && !busy
            ? "AI is processing — the check button unlocks when it finishes"
            : undefined
        }
      >
        {busy ? (
          "Checking…"
        ) : aiBusy ? (
          "AI working…"
        ) : (
          <>
            <span aria-hidden="true">✓</span> Check now
          </>
        )}
      </button>
    </div>
  );
}
