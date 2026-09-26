import { useEffect, useState, type ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import { ConfirmDialog, Label } from "../../components/ui";
import { formatNumber, formatRest } from "../../domain/format";
import type { ValidationError } from "../../domain/validation";
import { ConflictError, ReadOnlyError } from "../../repositories/configRepository";
import { ValidationFailed } from "../../state/ConfigContext";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <Label className="text-volt">{eyebrow}</Label>}
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Blocks in-app navigation and tab close while an editor has unsaved changes. */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Discard unsaved changes?"
      body="You have edits that haven't been saved."
      confirmLabel="Discard"
      danger
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}

export interface SaveOutcome {
  message?: string;
  fieldErrors: ValidationError[];
}

/** Maps save failures to user-facing messages. */
export function describeSaveError(e: unknown): SaveOutcome {
  if (e instanceof ValidationFailed) return { fieldErrors: e.errors, message: "Fix the highlighted fields and save again." };
  if (e instanceof ConflictError)
    return {
      fieldErrors: [],
      message: `${e.file} changed on GitHub since it was loaded. The latest version has been loaded — your edits here are kept. Review them and save again.`,
    };
  if (e instanceof ReadOnlyError) return { fieldErrors: [], message: e.message };
  return { fieldErrors: [], message: e instanceof Error ? e.message : String(e) };
}

export function SaveTargetHint({ target }: { target: "github" | "local" }) {
  return <span className="text-xs text-ink-3">{target === "github" ? "Saves commit to GitHub" : "Saves to this browser"}</span>;
}

/** Compact numeric input for dense desktop forms. Empty → undefined. */
export function NumInput({
  value,
  onChange,
  label,
  error,
  className = "",
  placeholder,
  step,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  error?: string;
  className?: string;
  placeholder?: string;
  step?: number;
}) {
  const [text, setText] = useState(value === undefined ? "" : formatNumber(value));
  useEffect(() => setText(value === undefined ? "" : formatNumber(value)), [value]);
  return (
    <input
      className={`input tnum h-9 px-2 text-center font-display font-bold ${error ? "input-error" : ""} ${className}`}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!!error}
      title={error ?? label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (!step || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        onChange(Math.max(0, (value ?? 0) + (e.key === "ArrowUp" ? step : -step)));
      }}
      onBlur={() => {
        const t = text.trim().replace(",", ".");
        if (t === "") return onChange(undefined);
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
        else setText(value === undefined ? "" : formatNumber(value));
      }}
    />
  );
}

/** Seconds input accepting "1:30" or "90" (seconds). */
export function RestInput({ value, onChange, error, label = "Rest (m:ss)" }: { value: number; onChange: (v: number) => void; error?: string; label?: string }) {
  const [text, setText] = useState(formatRest(value));
  useEffect(() => setText(formatRest(value)), [value]);
  return (
    <input
      className={`input tnum h-9 px-2 text-center font-display font-bold ${error ? "input-error" : ""}`}
      aria-label={label}
      title={error ?? label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const m = text.trim().match(/^(\d+):(\d{1,2})$/);
        const n = m ? Number(m[1]) * 60 + Number(m[2]) : Number(text.trim());
        if (Number.isFinite(n) && n >= 0) onChange(Math.round(n));
        else setText(formatRest(value));
      }}
    />
  );
}
