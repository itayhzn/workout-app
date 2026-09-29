import { Check, Pencil, QrCode, X } from "lucide-react";
import { useState } from "react";
import { PairingPanel } from "../../components/Pairing";
import { AddPersonForm, Avatar } from "../../components/People";
import { Banner, EmptyState, Label, Modal } from "../../components/ui";
import type { Person } from "../../services/people";
import { usePeople } from "../../state/PeopleContext";
import { PageHeader } from "./shared";

export function PeoplePage() {
  const { connection, people, activePersonId, selectPerson, error } = usePeople();
  const [pairing, setPairing] = useState<Person>();
  if (!connection) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Family & friends" title="People" />
        <EmptyState title="Not connected" body="Connect this device to the shared data repository in Settings to add people." />
      </div>
    );
  }
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="Family & friends"
        title="People"
        description="Everyone has their own plan, history and preferences in the shared data repository. Everyone connected can see and edit everyone."
      />
      {error && <Banner>Couldn't refresh the list ({error}). Showing the last known list.</Banner>}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} active={p.id === activePersonId} onSwitch={() => selectPerson(p.id)} onPair={() => setPairing(p)} />
          ))}
          {!people.length && <li className="card p-6 text-ink-2">No one yet.</li>}
        </ul>
        <section className="card h-fit p-5">
          <Label className="mb-3">Add a person</Label>
          <AddPersonForm />
        </section>
      </div>
      <Modal open={!!pairing} onClose={() => setPairing(undefined)} title={`Pair a phone for ${pairing?.name ?? ""}`}>
        {pairing && <PairingPanel connection={connection} personId={pairing.id} personName={pairing.name} />}
      </Modal>
    </div>
  );
}

function PersonRow({ person, active, onSwitch, onPair }: { person: Person; active: boolean; onSwitch: () => void; onPair: () => void }) {
  const { renamePerson } = usePeople();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string>();
  return (
    <li className={`card flex flex-wrap items-center gap-3 p-3 ${active ? "border-volt" : ""}`}>
      <Avatar id={person.id} name={person.name} size={40} />
      <div className="min-w-40 flex-1">
        {editing ? (
          <form
            className="flex gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await renamePerson(person.id, name);
                setEditing(false);
                setError(undefined);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <input className="input h-9" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" autoFocus />
            <button className="btn-primary h-9 w-9" aria-label="Save name">
              <Check size={16} />
            </button>
            <button type="button" className="btn-ghost h-9 w-9" aria-label="Cancel" onClick={() => setEditing(false)}>
              <X size={16} />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 font-semibold">
            {person.name}
            {active && <span className="font-display text-[10px] font-bold uppercase tracking-widest text-volt">Active</span>}
          </div>
        )}
        <div className="font-mono text-xs text-ink-3">people/{person.id}</div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <div className="flex gap-1">
        {!editing && (
          <button className="btn-ghost h-9 w-9" onClick={() => setEditing(true)} aria-label={`Rename ${person.name}`} title="Rename">
            <Pencil size={14} />
          </button>
        )}
        <button className="btn-ghost h-9 px-2 normal-case" onClick={onPair}>
          <QrCode size={14} /> Pair phone
        </button>
        {!active && (
          <button className="btn-secondary h-9 px-3 normal-case" onClick={onSwitch}>
            Switch to
          </button>
        )}
      </div>
    </li>
  );
}
