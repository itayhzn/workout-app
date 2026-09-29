import { Cloud, CloudUpload, Download, GitBranch, HardDrive, Link2, RotateCcw, Trash2, Upload, Volume2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Banner, ConfirmDialog, Field, Label } from "../../components/ui";
import { SyncRow } from "../../components/SyncStatus";
import { WeightUnitToggle } from "../../components/WeightUnitToggle";
import { exportConfigFiles } from "../../services/configService";
import { exportHistory, importHistoryFile } from "../../services/historyService";
import {
  clearModePreference,
  detectMode,
  loadModePreference,
  loadTimerSound,
  saveModePreference,
  saveTimerSound,
  suggestedConnection,
  type AppMode,
  type Connection,
} from "../../services/settings";
import { useConfig } from "../../state/ConfigContext";
import { usePeople } from "../../state/PeopleContext";
import { useSync } from "../../state/SyncContext";
import { PageHeader } from "./shared";

type Notice = { tone: "info" | "error"; text: string } | undefined;

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-elevated text-volt">{icon}</div>
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-ink-2">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const config = useConfig();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(undefined);
    try {
      const msg = await fn();
      if (msg) setNotice({ tone: "info", text: msg });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const sourceText = config.localEdits
    ? "Unpublished edits saved in this browser. They are used instead of the shared plan until you publish or discard them."
    : config.source === "github"
      ? "The active person's plan, loaded live from the shared data repository. Saves create commits there."
      : "The starter plan deployed with the site (read-only). Edits will be saved in this browser until you connect the shared data repository.";

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader eyebrow="Configuration" title="Settings" />
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <Section icon={<HardDrive size={18} />} title="Configuration source" description={sourceText}>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary h-10 px-3 normal-case" disabled={busy} onClick={() => run(async () => (await config.reload(), "Configuration reloaded."))}>
            <RotateCcw size={16} /> Reload
          </button>
          <button className="btn-secondary h-10 px-3 normal-case" onClick={() => exportConfigFiles(config)}>
            <Download size={16} /> Export JSON files
          </button>
          {config.localEdits && config.githubConnected && (
            <button className="btn-primary h-10 px-3 normal-case" disabled={busy} onClick={() => run(async () => (await config.publishLocal(), "Local edits published to GitHub."))}>
              <CloudUpload size={16} /> Publish local edits to GitHub
            </button>
          )}
          {config.localEdits && (
            <button className="btn-danger h-10 px-3 normal-case" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              <Trash2 size={16} /> Discard local edits
            </button>
          )}
        </div>
        {config.localEdits && !config.githubConnected && (
          <p className="mt-3 text-sm text-ink-2">
            To make these edits permanent, connect GitHub below and publish, or export the files and commit them to <code className="text-cyan">public/data/</code>.
          </p>
        )}
      </Section>

      <GitHubSection onNotice={setNotice} />

      <SyncSection />

      <Section icon={<Upload size={18} />} title="Workout history" description="With sync on, history reaches every device automatically. Export/import is a manual backup, or a way to move history without sync. Importing never creates duplicates.">
        <HistoryTransfer onNotice={setNotice} />
      </Section>

      <Section icon={<Volume2 size={18} />} title="This device">
        <DevicePrefs />
      </Section>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard local edits?"
        body="All configuration changes saved only in this browser will be lost, and the deployed/GitHub configuration will be loaded."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          run(async () => (await config.discardLocal(), "Local edits discarded."));
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

function SyncSection() {
  const { configured } = useSync();
  const { activePerson } = usePeople();
  return (
    <Section
      icon={<Cloud size={18} />}
      title="Sync"
      description="The active person's plan, history and preferences sync through the shared data repository. Each device keeps working offline and catches up the next time it's online."
    >
      {configured ? (
        <div className="flex flex-col gap-3">
          <SyncRow />
          <p className="text-sm text-ink-2">
            Syncing as <strong className="text-ink">{activePerson?.name}</strong>. To set up someone's phone, go to{" "}
            <Link to="/manage/people" className="text-volt underline">
              People
            </Link>{" "}
            → Pair a phone.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">Connect the shared data repository below to turn sync on.</p>
      )}
    </Section>
  );
}

function GitHubSection({ onNotice }: { onNotice: (n: Notice) => void }) {
  const config = useConfig();
  const people = usePeople();
  const existing = people.connection;
  const [form, setForm] = useState<Connection>(() => existing ?? { ...suggestedConnection(), token: "" });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Connection>) => setForm({ ...form, ...patch });

  const connect = async () => {
    setBusy(true);
    onNotice(undefined);
    try {
      await people.connect(form);
      await config.reconnect();
      onNotice({ tone: "info", text: `Connected to ${form.owner}/${form.repo}.` });
    } catch (e) {
      onNotice({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    people.disconnect();
    setForm({ ...form, token: "" });
    onNotice({ tone: "info", text: "Disconnected. The token was removed from this browser." });
  };

  return (
    <Section
      icon={<GitBranch size={18} />}
      title="Shared data repository"
      description="A private GitHub repo holding everyone's plans, history and preferences (people/<name>/…). The site itself is static, so the app reads and writes it through the GitHub API."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Owner">{(id) => <input id={id} className="input h-10" value={form.owner} onChange={(e) => set({ owner: e.target.value.trim() })} />}</Field>
        <Field label="Repository">{(id) => <input id={id} className="input h-10" value={form.repo} onChange={(e) => set({ repo: e.target.value.trim() })} />}</Field>
        <Field label="Branch">{(id) => <input id={id} className="input h-10" value={form.branch} onChange={(e) => set({ branch: e.target.value.trim() })} />}</Field>
        <div className="sm:col-span-3">
          <Field
            label="Personal access token"
            hint="Fine-grained token limited to the data repository, with Contents: Read and write. Everyone shares it. Stored only in this browser's local storage — never committed."
          >
            {(id) => (
              <input id={id} type="password" autoComplete="off" className="input h-10 font-mono text-sm" value={form.token} placeholder="github_pat_…" onChange={(e) => set({ token: e.target.value.trim() })} />
            )}
          </Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary h-10 px-4 normal-case" onClick={connect} disabled={busy || !form.token || !form.owner || !form.repo}>
          <Link2 size={16} /> {existing ? "Update & test" : "Connect & test"}
        </button>
        {existing && (
          <button className="btn-ghost h-10 px-3 normal-case hover:text-danger" onClick={disconnect}>
            Disconnect
          </button>
        )}
        <span className="text-sm text-ink-2">{existing ? `Connected to ${existing.owner}/${existing.repo}` : "Not connected"}</span>
      </div>
    </Section>
  );
}

function HistoryTransfer({ onNotice }: { onNotice: (n: Notice) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const r = await importHistoryFile(file);
            onNotice({ tone: "info", text: `Imported ${r.added} session(s); ${r.skipped} already present${r.invalid ? `; ${r.invalid} invalid` : ""}.` });
          } catch (err) {
            onNotice({ tone: "error", text: `Import failed: ${err instanceof Error ? err.message : String(err)}` });
          }
        }}
      />
      <button className="btn-secondary h-10 px-3 normal-case" onClick={() => exportHistory().then((n) => onNotice({ tone: "info", text: `Exported ${n} session(s).` }))}>
        <Download size={16} /> Export history
      </button>
      <button className="btn-secondary h-10 px-3 normal-case" onClick={() => ref.current?.click()}>
        <Upload size={16} /> Import history
      </button>
    </div>
  );
}

function DevicePrefs() {
  const [mode, setMode] = useState<AppMode | "auto">(() => loadModePreference() ?? "auto");
  const [sound, setSound] = useState(loadTimerSound);
  const choose = (m: AppMode | "auto") => {
    setMode(m);
    if (m === "auto") clearModePreference();
    else saveModePreference(m);
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="mb-2">Default mode when opening the app</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["auto", `Auto (${detectMode() === "manage" ? "management" : "workout"} on this device)`],
              ["workout", "Workout (phone)"],
              ["manage", "Management (desktop)"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={`chip ${mode === value ? "chip-active" : ""}`} onClick={() => choose(value)} aria-pressed={mode === value}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <WeightUnitToggle />
        <span>Weight unit for display and entry (data is stored in kg)</span>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-volt)]"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            saveTimerSound(e.target.checked);
          }}
        />
        Play a sound when the rest timer ends
      </label>
    </div>
  );
}
