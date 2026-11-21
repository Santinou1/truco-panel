import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./lobby-activity-admin.css";

type Points = { win: number; loss: number };
type Tier = Points & { minEntryMinor: number };
type Terms = {
  available: boolean;
  enabled: boolean;
  commissionBps: number;
  minEntryMinor: number;
  version: number;
  scoring: { fictitious: Points; tiers: Tier[] };
};
type DraftPoints = { win: string; loss: string };
type Draft = {
  enabled: boolean;
  commission: string;
  minimum: string;
  fictitious: DraftPoints;
  tiers: (DraftPoints & { from: string })[];
};
const endpoint = "/admin/fiat-games";
const decimal = (scaled: number) => (scaled / 100).toLocaleString("es-AR", { useGrouping: false });
const asPoints = ({ win, loss }: Points) => ({ win: String(win), loss: String(loss) });
function toDraft(value: Terms): Draft {
  return {
    enabled: value.enabled,
    commission: decimal(value.commissionBps),
    minimum: decimal(value.minEntryMinor),
    fictitious: asPoints(value.scoring.fictitious),
    tiers: value.scoring.tiers.map((tier) => ({ ...asPoints(tier), from: decimal(tier.minEntryMinor) })),
  };
}

function scaledAmount(value: string) {
  const parts = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  return parts ? Number(parts[1]) * 100 + Number((parts[2] ?? "").padEnd(2, "0")) : Number.NaN;
}

function PointsFields({
  label, value, onChange,
}: {
  label: string;
  value: DraftPoints;
  onChange: (value: DraftPoints) => void;
}) {
  return (
    <>
      <label>
        Victoria
        <input type="number" min={0} max={1000} step={1} required
          aria-label={label + ": puntos por victoria"} value={value.win}
          onChange={(event) => onChange({ ...value, win: event.target.value })} />
      </label>
      <label>
        Derrota
        <input type="number" min={0} max={1000} step={1} required
          aria-label={label + ": puntos descontados por derrota"} value={value.loss}
          onChange={(event) => onChange({ ...value, loss: event.target.value })} />
      </label>
    </>
  );
}

export function FiatGamesAdmin({ onDenied }: { onDenied: (status: 401 | 403) => void }) {
  const [terms, setTerms] = useState<Terms>();
  const [draft, setDraft] = useState<Draft>();
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
      setDraft(toDraft(value));
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
      else setError(message(cause));
    });
    return () => { active = false; };
  }, [onDenied,revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!terms || !draft || saving.current) return;
    const commissionBps = scaledAmount(draft.commission);
    if (!Number.isFinite(commissionBps) || commissionBps > 9999) {
      setError("Ingresá un porcentaje entre 0 y 99,99.");
      return;
    }
    const minEntryMinor = scaledAmount(draft.minimum);
    const tiers = draft.tiers.map((tier) => ({
      minEntryMinor: scaledAmount(tier.from), win: Number(tier.win), loss: Number(tier.loss),
    }));
    const validEntry = (amount: number) => amount >= 100 && amount <= 1_000_000;
    if (!validEntry(minEntryMinor) || tiers.some((tier) => !validEntry(tier.minEntryMinor))) {
      setError("Ingresá importes entre $1 y $10.000.");
      return;
    }
    if (tiers.some((tier, index) => index > 0 && tier.minEntryMinor <= tiers[index - 1].minEntryMinor)) {
      setError("Ordená los tramos de menor a mayor, sin repetir importes.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Terms>(endpoint, {
        enabled: draft.enabled,
        commissionBps,
        minEntryMinor,
        expectedVersion: terms.version,
        scoring: {
          fictitious: { win: Number(draft.fictitious.win), loss: Number(draft.fictitious.loss) },
          tiers,
        },
      });
      setTerms(value);
      setDraft(toDraft(value));
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
        {terms && draft && (
          <form onSubmit={(event) => void save(event)}>
            {!terms.available && <p>El juego con patacones reales no está disponible en este ambiente.</p>}
            <fieldset disabled={busy} className="fiat-admin-config">
              <legend>Condiciones de la mesa</legend>
              <div className="fiat-admin-row">
                <label>
                  Entrada mínima (ARS)
                  <input type="text" inputMode="decimal" maxLength={8} required
                    value={draft.minimum} onChange={(event) => setDraft({ ...draft, minimum: event.target.value })} />
                </label>
                <label>
                  Comisión del pozo bruto (%)
                  <input type="text" inputMode="decimal" maxLength={5} required
                    value={draft.commission} onChange={(event) => setDraft({ ...draft, commission: event.target.value })} />
                </label>
              </div>
            </fieldset>
            <fieldset disabled={busy} className="fiat-admin-config">
              <legend>Puntos del ranking diario y del ELO</legend>
              <p className="muted">Se fijan al iniciar la partida. En derrota ingresá cuántos puntos se descuentan.</p>
              <p className="muted">Si hay un ganador por abandono o desconexión, se aplican los puntos de victoria y derrota.</p>
              <h2>Patacones ficticios</h2>
              <div className="fiat-admin-row">
                <PointsFields label="Ficticios" value={draft.fictitious}
                  onChange={(fictitious) => setDraft({ ...draft, fictitious })} />
              </div>
              <h2>Patacones reales</h2>
              {draft.tiers.map((tier, index) => (
                <div className="fiat-admin-row fiat-admin-tier" key={index}>
                  <label>
                    Desde (ARS)
                    <input type="text" inputMode="decimal" maxLength={8} required
                      aria-label={`Tramo ${index + 1}: desde ARS`} value={tier.from}
                      onChange={(event) => setDraft({ ...draft, tiers: draft.tiers.map((row, i) =>
                        i === index ? { ...row, from: event.target.value } : row) })} />
                  </label>
                  <PointsFields label={`Tramo ${index + 1}`} value={tier}
                    onChange={(points) => setDraft({ ...draft, tiers: draft.tiers.map((row, i) =>
                      i === index ? { ...row, ...points } : row) })} />
                </div>
              ))}
            </fieldset>
            <div className="lobby-activity-actions">
              <label>
                <input type="checkbox" checked={draft.enabled}
                  disabled={busy || (!terms.available && !draft.enabled)}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
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
