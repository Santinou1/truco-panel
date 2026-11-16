import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./lobby-activity-admin.css";

type Terms = { available: boolean; enabled: boolean; commissionBps: number; version: number };
const endpoint = "/admin/fiat-games";
const asPercent = (bps: number) => (bps / 100).toLocaleString("es-AR", {useGrouping:false});

export function FiatGamesAdmin({ onDenied }: { onDenied: (status: 401 | 403) => void }) {
  const [terms, setTerms] = useState<Terms>();
  const [draft, setDraft] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    void api<Terms>(endpoint).then((value) => {
      if (!active) return;
      setTerms(value);
      setDraft(asPercent(value.commissionBps));
      setEnabled(value.enabled);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
      else setError(message(cause));
    });
    return () => { active = false; };
  }, [onDenied,revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!terms || saving.current) return;
    const parts = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(draft.trim());
    if (!parts) {
      setError("Ingresá un porcentaje entre 0 y 99,99.");
      return;
    }
    const bps = Number(parts[1])*100 + Number((parts[2] ?? "").padEnd(2,"0"));
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Terms>(endpoint,{enabled,commissionBps:bps,expectedVersion:terms.version});
      setTerms(value);
      setDraft(asPercent(value.commissionBps));
      setEnabled(value.enabled);
      setNotice("Configuración guardada.");
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
      else setError(message(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="panel lobby-activity-admin" aria-labelledby="fiat-games-title">
        <h1 id="fiat-games-title">Mesas con patacones reales</h1>
        <p>La comisión se descuenta del pozo bruto de cada partida. El porcentaje que acepta cada mesa se fija cuando se crea.</p>
        <p className="muted">Al pausar, no se pueden abrir ni iniciar mesas nuevas. Las partidas que ya empezaron se liquidan con su comisión original.</p>
        {error && <p role="alert">{error}</p>}
        {!terms && !error && <p role="status">Consultando la configuración…</p>}
        {terms && (
          <form onSubmit={(event) => void save(event)}>
            {!terms.available && <p>El juego con patacones reales no está disponible en este ambiente.</p>}
            <label>
              Comisión del pozo bruto (%)
              <input type="text" inputMode="decimal" maxLength={5} required
                disabled={busy} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <div className="lobby-activity-actions">
              <label>
                <input type="checkbox" checked={enabled}
                  disabled={busy || (!terms.available && !enabled)}
                  onChange={(event) => setEnabled(event.target.checked)} />
                {" "}Habilitar mesas con patacones reales
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        )}
        {error && <button type="button" disabled={busy} onClick={() => {
          setError("");
          setNotice("");
          refresh((attempt) => attempt + 1);
        }}>Volver a consultar</button>}
        {notice && <p role="status">{notice}</p>}
      </section>
    </main>
  );
}
