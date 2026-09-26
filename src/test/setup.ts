import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// Node 25+ exposes an experimental global localStorage that shadows jsdom's and lacks methods
// unless started with --localstorage-file. Use a simple in-memory Storage for tests.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true, writable: true });

// jsdom doesn't implement scrolling; React Router's ScrollRestoration calls it.
window.scrollTo = () => {};
