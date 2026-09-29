import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { emptySchedule } from "../domain/schedule";
import type { Config } from "../domain/types";
import { GitHubContents } from "../repositories/githubContents";
import { GitHubRepository } from "../repositories/githubRepository";
import { StaticJsonRepository } from "../repositories/staticJsonRepository";
import { loadAll } from "../services/configService";
import { addPerson as addPersonRemote, listPeople, renamePerson as renamePersonRemote, type Person } from "../services/people";
import { getActivePersonId, loadConnection, saveConnection, setActivePersonId, type Connection } from "../services/settings";
import { onSettingsChanged } from "../services/syncEvents";

export type PlanTemplate = { kind: "starter" } | { kind: "empty" } | { kind: "copy"; personId: string };

interface PeopleValue {
  connection?: Connection;
  people: Person[];
  activePersonId?: string;
  activePerson?: Person;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  selectPerson: (id: string | undefined) => void;
  addPerson: (name: string, template: PlanTemplate) => Promise<Person>;
  renamePerson: (id: string, name: string) => Promise<void>;
  /** Tests access, saves the connection, and optionally picks the person (e.g. from a pairing code). */
  connect: (connection: Connection, personId?: string) => Promise<void>;
  disconnect: () => void;
}

const Ctx = createContext<PeopleValue | null>(null);
const ROSTER_CACHE = "kinetic.people";

function cachedRoster(): Person[] {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_CACHE) ?? "[]") as Person[];
  } catch {
    return [];
  }
}

function cacheRoster(people: Person[]) {
  try {
    localStorage.setItem(ROSTER_CACHE, JSON.stringify(people));
  } catch {
    /* best effort */
  }
}

async function templatePlan(connection: Connection, template: PlanTemplate): Promise<Config> {
  if (template.kind === "empty") return { exercises: [], workouts: [], schedule: emptySchedule() };
  if (template.kind === "copy") return loadAll(new GitHubRepository(connection, template.personId));
  return loadAll(new StaticJsonRepository());
}

export function PeopleProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState(() => loadConnection());
  const [people, setPeople] = useState<Person[]>(() => cachedRoster());
  const [activePersonId, setActiveId] = useState(() => (loadConnection() ? getActivePersonId() : undefined));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const c = loadConnection();
    if (!c) return;
    setLoading(true);
    try {
      const roster = await listPeople(new GitHubContents(c));
      setPeople(roster);
      cacheRoster(roster);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); // keep showing the cached roster
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onSettingsChanged(() => setConnection(loadConnection()));
  }, [refresh]);

  const selectPerson = useCallback((id: string | undefined) => {
    setActivePersonId(id);
    setActiveId(id);
  }, []);

  const addPerson = useCallback(
    async (name: string, template: PlanTemplate) => {
      const c = loadConnection();
      if (!c) throw new Error("Connect to the data repository first.");
      const person = await addPersonRemote(new GitHubContents(c), name, await templatePlan(c, template));
      await refresh();
      return person;
    },
    [refresh],
  );

  const renamePerson = useCallback(
    async (id: string, name: string) => {
      const c = loadConnection();
      if (!c) throw new Error("Connect to the data repository first.");
      const roster = await renamePersonRemote(new GitHubContents(c), id, name);
      setPeople(roster);
      cacheRoster(roster);
    },
    [],
  );

  const connect = useCallback(
    async (c: Connection, personId?: string) => {
      const client = new GitHubContents(c);
      await client.testWriteAccess();
      const roster = await listPeople(client);
      saveConnection(c);
      setConnection(c);
      setPeople(roster);
      cacheRoster(roster);
      if (personId && roster.some((p) => p.id === personId)) selectPerson(personId);
    },
    [selectPerson],
  );

  const disconnect = useCallback(() => {
    saveConnection(undefined);
    setConnection(undefined);
    setActiveId(undefined);
    setPeople([]);
    cacheRoster([]);
  }, []);

  const value = useMemo<PeopleValue>(() => {
    const known = people.find((p) => p.id === activePersonId);
    const activePerson = activePersonId ? (known ?? { id: activePersonId, name: activePersonId, createdAt: "" }) : undefined;
    return { connection, people, activePersonId, activePerson, loading, error, refresh, selectPerson, addPerson, renamePerson, connect, disconnect };
  }, [connection, people, activePersonId, loading, error, refresh, selectPerson, addPerson, renamePerson, connect, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeople(): PeopleValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePeople must be used inside PeopleProvider");
  return ctx;
}
