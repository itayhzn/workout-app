import { toJson } from "../domain/config";
import { ConflictError } from "./configRepository";

// Minimal client for the GitHub Contents API, shared by config storage and history sync.
// Every write carries the SHA from the last read, so GitHub rejects it if the file changed meanwhile.

export interface GitHubTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface JsonFile<T> {
  data: T;
  sha: string;
}

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
  type: string;
}

/** Error with a hint for the statuses people can actually fix. */
function httpError(action: string, path: string, status: number): Error {
  if (status === 401) return new Error(`GitHub rejected the token (401) while trying to ${action} ${path}. Update the token in Settings → GitHub connection.`);
  if (status === 403) return new Error(`The token isn't allowed to ${action} ${path} (403). Give it Contents: Read and write on this repository.`);
  return new Error(`GitHub: failed to ${action} ${path} (HTTP ${status})`);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export class GitHubContents {
  constructor(
    readonly target: GitHubTarget,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private repoUrl(): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.target.owner)}/${encodeURIComponent(this.target.repo)}`;
  }

  private url(path: string): string {
    return `${this.repoUrl()}/contents/${path.replace(/^\/+/, "")}`;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.target.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async get(path: string): Promise<Response> {
    return this.fetchImpl(`${this.url(path)}?ref=${encodeURIComponent(this.target.branch)}`, { headers: this.headers(), cache: "no-store" });
  }

  /** Reads and parses a JSON file. Returns undefined when it doesn't exist. */
  async readJson<T>(path: string): Promise<JsonFile<T> | undefined> {
    const res = await this.get(path);
    if (res.status === 404) return undefined;
    if (!res.ok) throw httpError("read", path, res.status);
    const body = (await res.json()) as { content: string; sha: string };
    return { data: JSON.parse(decodeBase64Utf8(body.content)) as T, sha: body.sha };
  }

  /** Creates or updates a JSON file. `sha` must be the one last read (undefined to create). Returns the new SHA. */
  async writeJson(path: string, data: unknown, sha: string | undefined, message: string): Promise<string | undefined> {
    const res = await this.fetchImpl(this.url(path), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: encodeBase64Utf8(toJson(data)), branch: this.target.branch, ...(sha ? { sha } : {}) }),
    });
    if (res.status === 409 || (res.status === 422 && !sha)) throw new ConflictError(path);
    if (!res.ok) throw httpError("save", path, res.status);
    const body = (await res.json()) as { content?: { sha?: string } };
    return body.content?.sha;
  }

  /** Lists a directory. Returns [] when it doesn't exist. */
  async list(dir: string): Promise<DirEntry[]> {
    const res = await this.get(dir);
    if (res.status === 404) return [];
    if (!res.ok) throw httpError("list", dir, res.status);
    const body = (await res.json()) as DirEntry[] | DirEntry;
    return Array.isArray(body) ? body : [];
  }

  /** Verifies the token can see the repository and push to it. */
  async testWriteAccess(): Promise<void> {
    const { owner, repo } = this.target;
    const res = await this.fetchImpl(this.repoUrl(), { headers: this.headers() });
    if (res.status === 401) throw new Error("GitHub rejected the token (401).");
    if (res.status === 404) throw new Error(`Repository ${owner}/${repo} not found, or the token cannot access it (404).`);
    if (!res.ok) throw new Error(`GitHub error for ${owner}/${repo} (HTTP ${res.status}).`);
    const body = (await res.json()) as { permissions?: { push?: boolean } };
    if (body.permissions && !body.permissions.push) throw new Error(`Token has read-only access to ${owner}/${repo}.`);
  }
}
