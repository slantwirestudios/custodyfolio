"use client";

import { useEffect, useRef, useState } from "react";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";

type InviteState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "ready"; saving: boolean; error: string }
  | { status: "accepted" };

export default function CustomerFeedbackInvite() {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      try {
        const response = await fetch("/api/records/customer-poll", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const body = (await response.json().catch(() => ({}))) as {
          eligible?: boolean;
          choice?: string | null;
        };
        if (cancelled) return;
        if (!response.ok || !body.eligible || body.choice) {
          setState({ status: "hidden" });
          return;
        }
        setState({ status: "ready", saving: false, error: "" });
      } catch {
        if (!cancelled) setState({ status: "hidden" });
      }
    }

    void loadInvitation();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading" || state.status === "hidden") return null;

  if (state.status === "accepted") {
    return (
      <section
        className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"
        role="status"
      >
        <p className="font-semibold">Thanks! Your answer is saved.</p>
        <p className="mt-1 leading-6">
          Your feedback helps us make Custody Folio easier to use.
        </p>
      </section>
    );
  }

  async function saveChoice(choice: "yes" | "no") {
    if (state.status !== "ready" || savingRef.current) return;
    savingRef.current = true;
    setState({ status: "ready", saving: true, error: "" });
    try {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/customer-poll", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-L2F-CSRF": csrf,
        },
        body: JSON.stringify({ choice }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        choice?: string;
      };
      if (!response.ok || !["yes", "no"].includes(body.choice || "")) {
        setState({
          status: "ready",
          saving: false,
          error: body.error || "Unable to save your choice right now.",
        });
        return;
      }
      setState({ status: "accepted" });
    } catch (error) {
      setState({
        status: "ready",
        saving: false,
        error: error instanceof Error ? error.message : "Unable to save your choice right now.",
      });
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-labelledby="customer-feedback-invitation"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        One quick question
      </p>
      <h2 id="customer-feedback-invitation" className="mt-2 text-lg font-semibold text-slate-950">
        Was it easy to save your first record?
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Tap an answer and you’re done. Optional, with no email follow-up.
      </p>
      {state.error ? (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={state.saving}
          onClick={() => void saveChoice("yes")}
          className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state.saving ? "Saving choice..." : "Yes"}
        </button>
        <button
          type="button"
          disabled={state.saving}
          onClick={() => void saveChoice("no")}
          className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          No
        </button>
      </div>
    </section>
  );
}
