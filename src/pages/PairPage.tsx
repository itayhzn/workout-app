import { CloudCheck, KeyRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConnectWithCode } from "../components/Pairing";
import { Banner, EmptyState } from "../components/ui";
import { decodeSetupCode } from "../services/pairing";
import { PhoneScreen } from "./phone/PhoneLayout";

/** Opened from the pairing QR code: confirms, then connects this device and syncs. */
export function PairPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const connect = useConnectWithCode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const parsed = useMemo(() => {
    try {
      return { settings: decodeSetupCode(code) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [code]);

  // Keep the token-bearing URL out of the visible address bar as soon as we've read it.
  useEffect(() => {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}#/pair`);
  }, []);

  if (!parsed.settings) {
    return (
      <PhoneScreen>
        <div className="pt-16">
          <EmptyState title="Invalid pairing link" body={parsed.error} action={<Link to="/" replace className="btn-secondary h-11 px-4">Home</Link>} />
        </div>
      </PhoneScreen>
    );
  }
  const { connection: c, personId } = parsed.settings;
  return (
    <PhoneScreen>
      <div className="flex flex-col gap-4 pt-16">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <CloudCheck size={40} className="text-volt" />
          <h1 className="font-display text-2xl font-bold">Connect this device?</h1>
          <p className="text-sm text-ink-2">
            Plans, workout history and preferences will sync through <strong className="text-ink">{c.owner}/{c.repo}</strong>
            {personId ? (
              <>
                , and this device will be set up for <strong className="text-ink">{personId}</strong>.
              </>
            ) : (
              <>. You'll pick who you are next.</>
            )}
          </p>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <button
          className="btn-primary h-14 text-base"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await connect(code);
              navigate("/", { replace: true });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          <KeyRound size={18} /> {busy ? "Connecting…" : "Connect & sync"}
        </button>
        <Link to="/" replace className="btn-ghost h-12">
          Cancel
        </Link>
      </div>
    </PhoneScreen>
  );
}
