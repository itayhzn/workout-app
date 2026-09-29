import { Check, Plus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePeople, type PlanTemplate } from "../state/PeopleContext";
import { Banner, Field, Modal } from "./ui";

const COLORS = ["bg-volt text-black", "bg-cyan text-black", "bg-emerald text-black", "bg-warn text-black", "bg-highlight text-ink"];

export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${COLORS[hash % COLORS.length]}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

/** Form to add a person, seeding their plan from a template. */
export function AddPersonForm({ onAdded }: { onAdded?: (id: string) => void }) {
  const { people, addPerson } = usePeople();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("starter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const toTemplate = (v: string): PlanTemplate => (v === "starter" ? { kind: "starter" } : v === "empty" ? { kind: "empty" } : { kind: "copy", personId: v.slice(5) });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const person = await addPerson(name, toTemplate(template));
          setName("");
          onAdded?.(person.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name">{(id) => <input id={id} className="input h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Noa" />}</Field>
      <Field label="Starting plan" hint="They can change it any time; everyone can edit everyone's plan.">
        {(id) => (
          <select id={id} className="input h-11" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="starter">Starter plan</option>
            {people.map((p) => (
              <option key={p.id} value={`copy:${p.id}`}>
                Copy of {p.name}'s plan
              </option>
            ))}
            <option value="empty">Empty plan</option>
          </select>
        )}
      </Field>
      {error && <Banner tone="error">{error}</Banner>}
      <button className="btn-primary h-11" disabled={busy || !name.trim()}>
        <UserPlus size={16} /> {busy ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}

/** Picker listing everyone; used by the header switcher and the first-run screen. */
export function PeopleList({ onPicked }: { onPicked?: () => void }) {
  const { people, activePersonId, selectPerson } = usePeople();
  if (!people.length) return <p className="text-sm text-ink-2">No one yet — add the first person below.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {people.map((p) => (
        <li key={p.id}>
          <button
            className={`card flex h-14 w-full items-center gap-3 px-4 text-left hover:border-line-strong ${p.id === activePersonId ? "border-volt" : ""}`}
            onClick={() => {
              selectPerson(p.id);
              onPicked?.();
            }}
          >
            <Avatar id={p.id} name={p.name} />
            <span className="flex-1 font-semibold">{p.name}</span>
            {p.id === activePersonId && <Check size={18} className="text-volt" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Header button showing who's active; opens the switcher. */
export function PersonSwitcher({ compact, manageLink }: { compact?: boolean; manageLink?: boolean }) {
  const { connection, activePerson } = usePeople();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!connection || !activePerson) return null;
  return (
    <>
      <button
        className={`flex items-center gap-2 rounded hover:bg-elevated ${compact ? "h-11 px-1.5" : "h-11 w-full px-2"}`}
        onClick={() => setOpen(true)}
        aria-label={`Switch person (current: ${activePerson.name})`}
      >
        <Avatar id={activePerson.id} name={activePerson.name} size={compact ? 30 : 28} />
        {!compact && <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{activePerson.name}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Who's working out?">
        <div className="flex flex-col gap-4">
          <PeopleList onPicked={() => setOpen(false)} />
          {adding ? (
            <AddPersonForm onAdded={() => setAdding(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary h-10 px-3 normal-case" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add person
              </button>
              {manageLink && (
                <Link to="/manage/people" className="btn-ghost h-10 px-3 normal-case" onClick={() => setOpen(false)}>
                  <Users size={16} /> Manage people
                </Link>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
