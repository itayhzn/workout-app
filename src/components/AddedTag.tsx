/** Marks an exercise that was added during the workout rather than coming from the workout's template. */
export function AddedTag({ className = "" }: { className?: string }) {
  return <span className={`align-middle font-display text-[10px] font-bold uppercase tracking-widest text-cyan ${className}`}>Added</span>;
}
