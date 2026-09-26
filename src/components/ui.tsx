import { CircleAlert, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ExerciseType, WorkoutType } from "../domain/types";

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

const TYPE_STYLE: Record<string, string> = {
  strength: "bg-volt/10 text-volt",
  aerobic: "bg-cyan/10 text-cyan",
  cardio: "bg-cyan/10 text-cyan",
  swimming: "bg-cyan/10 text-cyan",
  mixed: "bg-emerald/10 text-emerald",
  mobility: "bg-emerald/10 text-emerald",
  other: "bg-highlight text-ink-2",
};

export function TypeBadge({ type, className = "" }: { type: WorkoutType | ExerciseType; className?: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest ${TYPE_STYLE[type] ?? TYPE_STYLE.other} ${className}`}>
      {type}
    </span>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-highlight ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-volt transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="font-display text-lg font-semibold">{title}</div>
      {body && <p className="max-w-sm text-sm text-ink-2">{body}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-ink-2" role="status">
      <LoaderCircle className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function Banner({ tone = "warn", children, action }: { tone?: "warn" | "error" | "info"; children: ReactNode; action?: ReactNode }) {
  const styles = {
    warn: "border-warn/40 bg-warn/10 text-warn",
    error: "border-danger/40 bg-danger/10 text-danger",
    info: "border-cyan/40 bg-cyan/10 text-cyan",
  }[tone];
  const Icon = tone === "info" ? CircleAlert : TriangleAlert;
  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${styles}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-ink">{children}</div>
      {action}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Bottom sheet on phones, centered dialog on wider screens. */
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90dvh] w-full flex-col rounded-t-lg border border-line-strong bg-card outline-none sm:rounded-lg ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button className="btn-ghost h-9 w-9" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-5 pt-4 sm:pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn-ghost h-11 px-4" onClick={onCancel}>
            Cancel
          </button>
          <button className={`${danger ? "btn-danger" : "btn-primary"} h-11 px-5`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-ink-2">{body}</div>
    </Modal>
  );
}
