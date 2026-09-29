import type { Connection } from "./settings";

// A setup code carries the data-repo connection (including the token) and, optionally, which person the
// device belongs to. It's pasted directly or opened from a QR code as #/pair/<code>. Treat it like a password.

const PREFIX = "KW2.";

export interface SetupCode {
  connection: Connection;
  personId?: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string): string {
  const binary = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeSetupCode({ connection: c, personId }: SetupCode): string {
  return PREFIX + toBase64Url(JSON.stringify({ o: c.owner, r: c.repo, b: c.branch, t: c.token, ...(personId ? { p: personId } : {}) }));
}

/** Parses a setup code; throws a readable error for anything malformed. */
export function decodeSetupCode(code: string): SetupCode {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error("That doesn't look like a Kinetic setup code.");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length)));
  } catch {
    throw new Error("The setup code is incomplete or damaged. Copy it again.");
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const connection: Connection = { owner: str(raw.o), repo: str(raw.r), branch: str(raw.b) || "main", token: str(raw.t) };
  if (!connection.owner || !connection.repo || !connection.token) throw new Error("The setup code is missing required fields.");
  return { connection, ...(str(raw.p) ? { personId: str(raw.p) } : {}) };
}

/** Link that opens the pairing screen on another device (hash route, so the code never reaches a server). */
export function pairingUrl(code: string, base = `${window.location.origin}${window.location.pathname}`): string {
  return `${base}#/pair/${code}`;
}
