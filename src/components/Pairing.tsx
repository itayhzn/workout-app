import { ClipboardCopy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { decodeSetupCode, encodeSetupCode, pairingUrl } from "../services/pairing";
import type { Connection } from "../services/settings";
import { usePeople } from "../state/PeopleContext";
import { Banner } from "./ui";

/** Shows the QR code / setup code that connects another device, optionally as a given person. Hidden until asked for — it contains the token. */
export function PairingPanel({ connection, personId, personName }: { connection: Connection; personId?: string; personName?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => encodeSetupCode({ connection, personId }), [connection, personId]);
  const url = pairingUrl(code);
  const svg = useMemo(() => (shown ? renderSVG(url, { border: 2, ecc: "L", whiteColor: "#ffffff", blackColor: "#000000" }) : ""), [shown, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShown(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Scan the QR code with the phone's camera{personName ? <> to set it up as <strong className="text-ink">{personName}</strong></> : null}. If the app is used from an
        iPhone <strong>home screen</strong>, copy the setup code instead and paste it in the app's ⚙ settings, because iOS keeps home-screen apps' storage separate from Safari.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary h-10 px-3 normal-case" onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff size={16} /> : <Eye size={16} />} {shown ? "Hide QR code" : "Show QR code"}
        </button>
        <button className="btn-secondary h-10 px-3 normal-case" onClick={copy}>
          <ClipboardCopy size={16} /> {copied ? "Copied" : "Copy setup code"}
        </button>
      </div>
      {shown && (
        <div className="flex flex-wrap items-start gap-4">
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Pairing QR code" className="h-56 w-56 rounded bg-white p-1" />
          <p className="max-w-xs text-xs text-warn">This code contains the shared GitHub token. Anyone who scans or copies it can read and write everyone's workout data. Hide it when you're done.</p>
        </div>
      )}
    </div>
  );
}

/** Connects this device from a setup code (pasted or from a QR link). */
export function useConnectWithCode() {
  const { connect } = usePeople();
  return async (code: string) => {
    const parsed = decodeSetupCode(code);
    await connect(parsed.connection, parsed.personId);
    return parsed;
  };
}

export function SetupCodeForm({ onConnected }: { onConnected?: () => void }) {
  const connect = useConnectWithCode();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="input min-h-20 font-mono text-xs"
        placeholder="Paste setup code (KW2.…)"
        aria-label="Setup code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {error && <Banner tone="error">{error}</Banner>}
      <button
        className="btn-primary h-11"
        disabled={busy || !code.trim()}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await connect(code);
            setCode("");
            onConnected?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeyRound size={16} /> {busy ? "Connecting…" : "Connect"}
      </button>
      <p className="text-xs text-ink-3">On a connected computer: People → Pair a phone → Copy setup code.</p>
    </div>
  );
}
