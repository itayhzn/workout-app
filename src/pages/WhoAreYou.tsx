import { LogOut } from "lucide-react";
import { AddPersonForm, PeopleList } from "../components/People";
import { Banner, Label, Spinner } from "../components/ui";
import { usePeople } from "../state/PeopleContext";
import { KineticMark, PhoneScreen } from "./phone/PhoneLayout";

/** First screen on a connected device until someone picks who they are. */
export function WhoAreYou() {
  const { people, loading, error, disconnect, connection } = usePeople();
  return (
    <PhoneScreen>
      <div className="flex flex-col gap-5 pt-12">
        <div className="flex items-center gap-2 font-display text-xl font-bold">
          <KineticMark /> KINETIC
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">Who's working out?</h1>
          <p className="mt-1 text-sm text-ink-2">
            Everyone in <strong className="text-ink">{connection?.owner}/{connection?.repo}</strong> has their own plan and history. You can switch any time.
          </p>
        </div>
        {error && <Banner>Couldn't refresh the list of people ({error}). Showing the last known list.</Banner>}
        {loading && !people.length ? <Spinner /> : <PeopleList />}
        <section className="card p-4">
          <Label className="mb-3">Add a person</Label>
          <AddPersonForm />
        </section>
        <p className="text-xs text-ink-3">The first person picked on this device keeps any workout history already stored on it.</p>
        <button className="btn-ghost h-11 self-start px-3 normal-case" onClick={disconnect}>
          <LogOut size={16} /> Disconnect this device
        </button>
      </div>
    </PhoneScreen>
  );
}
