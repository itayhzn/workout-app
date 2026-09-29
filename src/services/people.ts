import { canonicalExercise, canonicalSchedule, canonicalWorkout } from "../domain/config";
import type { Config } from "../domain/types";
import { ConflictError } from "../repositories/configRepository";
import type { GitHubContents } from "../repositories/githubContents";
import { personDir } from "../repositories/githubRepository";

// The shared roster lives in people.json at the root of the data repo. Each person's plan, history and
// preferences live under people/<id>/. Everyone connected to the repo can see and edit everyone.

export interface Person {
  id: string;
  name: string;
  createdAt: string;
}

const ROSTER = "people.json";
const MAX_ATTEMPTS = 3;

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "person"
  );
}

/** A readable id that isn't taken yet ("noa", "noa-2", …). Ids never change, even if the name does. */
export function uniqueId(name: string, taken: string[]): string {
  const base = slugify(name);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

function isPerson(v: unknown): v is Person {
  const p = v as Person;
  return typeof p?.id === "string" && typeof p?.name === "string";
}

export async function listPeople(client: GitHubContents): Promise<Person[]> {
  const file = await client.readJson<unknown>(ROSTER);
  return Array.isArray(file?.data) ? file.data.filter(isPerson) : [];
}

/** Read-modify-write of the roster with SHA checks; retried when someone else changed it meanwhile. */
async function updateRoster(client: GitHubContents, message: string, fn: (people: Person[]) => Person[]): Promise<Person[]> {
  for (let attempt = 1; ; attempt++) {
    const file = await client.readJson<unknown>(ROSTER);
    const current = Array.isArray(file?.data) ? file.data.filter(isPerson) : [];
    const next = fn(current);
    try {
      await client.writeJson(ROSTER, next, file?.sha, message);
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw e;
    }
  }
}

export async function writePlan(client: GitHubContents, personId: string, plan: Config, message: string): Promise<void> {
  const dir = `${personDir(personId)}/plan`;
  // New files for a new person: nothing to conflict with. Sequential so each is its own commit on the branch head.
  await client.writeJson(`${dir}/exercises.json`, plan.exercises.map(canonicalExercise), undefined, `${message}: exercises`);
  await client.writeJson(`${dir}/workouts.json`, plan.workouts.map(canonicalWorkout), undefined, `${message}: workouts`);
  await client.writeJson(`${dir}/schedule.json`, canonicalSchedule(plan.schedule), undefined, `${message}: schedule`);
}

/** Creates a person: their plan first (so they never exist without one), then the roster entry. */
export async function addPerson(client: GitHubContents, name: string, plan: Config, now = new Date()): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const existing = await listPeople(client);
  const id = uniqueId(trimmed, existing.map((p) => p.id));
  await writePlan(client, id, plan, `Add ${trimmed}`);
  const person: Person = { id, name: trimmed, createdAt: now.toISOString() };
  await updateRoster(client, `Add ${trimmed} to people`, (people) => (people.some((p) => p.id === id) ? people : [...people, person]));
  return person;
}

export async function renamePerson(client: GitHubContents, id: string, name: string): Promise<Person[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  return updateRoster(client, `Rename ${id} to ${trimmed}`, (people) => people.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}
