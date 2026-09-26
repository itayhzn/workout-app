import { IDBFactory } from "fake-indexeddb";
import { beforeEach } from "vitest";
import { resetDbForTests } from "../storage/indexedDb";

/** Gives every test an empty IndexedDB and clean localStorage. */
export function useFreshDb() {
  beforeEach(async () => {
    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
  });
}
