// Tiny window-event bus so unrelated parts of the app can ask for a sync or react to settings changes.

const SYNC_REQUESTED = "kinetic:sync-requested";
const SETTINGS_CHANGED = "kinetic:settings-changed";

export function requestSync(): void {
  window.dispatchEvent(new Event(SYNC_REQUESTED));
}

export function onSyncRequested(fn: () => void): () => void {
  window.addEventListener(SYNC_REQUESTED, fn);
  return () => window.removeEventListener(SYNC_REQUESTED, fn);
}

export function notifySettingsChanged(): void {
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
}

export function onSettingsChanged(fn: () => void): () => void {
  window.addEventListener(SETTINGS_CHANGED, fn);
  return () => window.removeEventListener(SETTINGS_CHANGED, fn);
}

const PERSON_CHANGED = "kinetic:person-changed";

export function notifyPersonChanged(): void {
  window.dispatchEvent(new Event(PERSON_CHANGED));
}

export function onPersonChanged(fn: () => void): () => void {
  window.addEventListener(PERSON_CHANGED, fn);
  return () => window.removeEventListener(PERSON_CHANGED, fn);
}
