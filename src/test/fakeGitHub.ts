// In-memory stand-in for the GitHub Contents API, enforcing SHA checks like the real one.

type File = { text: string; sha: string };

const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

export class FakeGitHub {
  files = new Map<string, File>();
  requests: { method: string; path: string }[] = [];
  /** Runs right before the next PUT is applied (simulates another device writing first). */
  beforeNextPut?: () => void;
  offline = false;
  private seq = 0;

  put(path: string, data: unknown): string {
    const sha = `sha${++this.seq}`;
    this.files.set(path, { text: JSON.stringify(data), sha });
    return sha;
  }

  json<T>(path: string): T | undefined {
    const f = this.files.get(path);
    return f ? (JSON.parse(f.text) as T) : undefined;
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+(?:\/contents\/(.*))?$/);
    if (!m) return new Response("not found", { status: 404 });
    const path = decodeURIComponent(m[1] ?? "");
    this.requests.push({ method, path });
    if (m[1] === undefined) return Response.json({ permissions: { push: true } });
    if (method === "GET") {
      const f = this.files.get(path);
      if (f) return Response.json({ content: enc(f.text), sha: f.sha });
      const children = [...this.files.entries()].filter(([p]) => p.startsWith(`${path}/`));
      if (children.length) return Response.json(children.map(([p, file]) => ({ name: p.slice(path.length + 1), path: p, sha: file.sha, type: "file" })));
      return new Response("not found", { status: 404 });
    }
    if (method === "PUT") {
      const hook = this.beforeNextPut;
      this.beforeNextPut = undefined;
      hook?.();
      const body = JSON.parse(String(init!.body)) as { content: string; sha?: string };
      const existing = this.files.get(path);
      if (existing && !body.sha) return new Response("sha required", { status: 422 });
      if (existing && body.sha !== existing.sha) return new Response("conflict", { status: 409 });
      if (!existing && body.sha) return new Response("conflict", { status: 409 });
      const sha = this.put(path, JSON.parse(dec(body.content)));
      return Response.json({ content: { sha } });
    }
    return new Response("bad method", { status: 405 });
  };
}
