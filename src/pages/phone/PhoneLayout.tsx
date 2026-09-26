import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PhoneScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <main className="flex flex-1 flex-col gap-5 px-5 pb-8">{children}</main>
      {footer && <div className="pb-safe sticky bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-5 pt-4">{footer}</div>}
    </div>
  );
}

export function PhoneHeader({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 -mx-5 flex h-16 items-center gap-2 border-b border-line/60 bg-canvas/90 px-3 backdrop-blur-md">
      {back ? (
        <Link to={back} className="btn-ghost h-11 w-11 shrink-0" aria-label="Back">
          <ChevronLeft size={24} />
        </Link>
      ) : (
        <div className="w-2" />
      )}
      <div className="min-w-0 flex-1 truncate font-display text-lg font-bold uppercase tracking-tight">{title}</div>
      {right}
    </header>
  );
}

export function KineticMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect width="100" height="100" rx="24" fill="#1b1b1f" />
      <path d="M26 34 L40 50 L26 66 M44 34 L58 50 L44 66 M62 34 L76 50 L62 66" stroke="#d4ff00" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
