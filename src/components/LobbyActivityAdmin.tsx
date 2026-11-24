import { useEffect, useState } from "react";
import { api, ApiError, message } from "../api";
import "./lobby-activity-admin.css";

type LobbyActivity = { available: boolean; enabled: boolean; version: number };
type RealActivity = LobbyActivity & {
  entryFees: number[];
  fundingAccountEmail: string | null;
  backingAvailable: number;
  profiles: {
    user_id: string; alias: string; balance: number; reserved: number;
    net: number; played: number; won: number;
  }[];
};
type Denied = (status: 401 | 403) => void;
const endpoint = "/admin/lobby-activity";
const realEndpoint = endpoint + "/real";
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function reportError(
  cause: unknown,
  onDenied: Denied,
  setError: (text: string) => void,
) {
  if (
    cause instanceof ApiError &&
    (cause.status === 401 || cause.status === 403)
  ) {
    onDenied(cause.status);
    return;
  }
  setError(message(cause));
}

function RealLobbyActivity({ onDenied }: { onDenied: Denied }) {
  const [status, setStatus] = useState<RealActivity>();
  const [email, setEmail] = useState("");
  const [fees, setFees] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function useStatus(current: RealActivity) {
    setStatus(current);
    setEmail(current.fundingAccountEmail ?? "soporte@lapulperia.cloud");
    setFees(current.entryFees.map(fee => (fee / 100).toString()).join(", "));
    setEnabled(current.enabled);
  }

  useEffect(() => {
    let active = true;
    void api<RealActivity>(realEndpoint).then(current => {
      if (active) useStatus(current);
    }).catch(cause => {
      if (active && (!(cause instanceof ApiError) || cause.status !== 404))
        reportError(cause, onDenied, setError);
    });
    return () => { active = false; };
  }, [onDenied]);

  async function submit() {
    if (!status?.available || busy) return;
    const amounts = fees.split(",").map(value => value.trim());
    if (amounts.length < 2 || amounts.some(value => !/^\d+(\.\d{1,2})?$/.test(value))) {
      setError("Ingresá al menos dos entradas en pesos, separadas por comas. Usá un punto para los centavos.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const current = await api<RealActivity>(realEndpoint, {
        expectedVersion: status.version,
        enabled,
        fundingAccountEmail: email,
        entryFees: amounts.map(value => Math.round(Number(value) * 100)),
      });
      useStatus(current);
      setSaved(true);
    } catch (cause) {
      reportError(cause, onDenied, setError);
      if (cause instanceof ApiError && cause.status === 409) {
        const current = await api<RealActivity>(realEndpoint).catch(() => null);
        if (current && current.version !== status.version) useStatus(current);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!status?.available && !error) return null;
  return (
    <section className="panel lobby-activity-admin real-lobby-activity" aria-labelledby="lobby-real-title">
      <h2 id="lobby-real-title">Actividad con Patacones reales</h2>
      <p>Saldo disponible de la cuenta de respaldo {pesos.format((status?.backingAvailable ?? 0) / 100)}.</p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Configuración guardada.</p>}
      {status?.available && (
        <>
          <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <fieldset disabled={busy}>
              <label>
                <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
                Activar actividad con Patacones reales
              </label>
              <label>
                Correo de la cuenta de respaldo
                <input type="email" required value={email} onChange={event => setEmail(event.target.value)} />
              </label>
              <label>
                Entradas en pesos, separadas por comas
                <input required value={fees} onChange={event => setFees(event.target.value)} />
              </label>
              <button className="primary" type="submit">Guardar actividad con Patacones reales</button>
            </fieldset>
          </form>
          {!!status.profiles.length && (
            <div className="real-lobby-results" role="region" aria-label="Resultados por perfil" tabIndex={0}>
              <table>
                <thead>
                  <tr>{["Perfil", "Límite disponible", "En juego", "Resultado", "Partidas", "Ganadas"].map(label =>
                    <th scope="col" key={label}>{label}</th>
                  )}</tr>
                </thead>
                <tbody>{status.profiles.map(profile =>
                  <tr key={profile.user_id}>
                    <th scope="row">{profile.alias}</th>
                    <td>{pesos.format(profile.balance / 100)}</td>
                    <td>{pesos.format(profile.reserved / 100)}</td>
                    <td>{pesos.format(profile.net / 100)}</td>
                    <td>{profile.played}</td>
                    <td>{profile.won}</td>
                  </tr>
                )}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function LobbyActivityAdmin({ onDenied }: { onDenied: Denied }) {
  const [status, setStatus] = useState<LobbyActivity>();
  const [attempt, setAttempt] = useState(0);
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void api<LobbyActivity>(endpoint)
      .then((current) => {
        if (active) setStatus(current);
      })
      .catch((cause) => {
        if (active) reportError(cause, onDenied, setReadError);
      });
    return () => {
      active = false;
    };
  }, [attempt, onDenied]);

  function retry() {
    setReadError("");
    setAttempt((current) => current + 1);
  }

  async function toggle() {
    if (!status?.available || saving) return;
    setSaving(true);
    setWriteError("");
    try {
      const updated = await api<LobbyActivity>(endpoint, {
        enabled: !status.enabled,
        expectedVersion: status.version,
      });
      setStatus(updated);
    } catch (cause) {
      reportError(cause, onDenied, setWriteError);
      setStatus(undefined);
      retry();
    } finally {
      setSaving(false);
    }
  }

  const activityLabel = status?.available
    ? status.enabled ? "Activa" : "Desactivada"
    : "No disponible en este ambiente";
  const actionLabel = status?.enabled ? "Desactivar actividad" : "Activar actividad";

  return (
    <main className="page">
      <section
        className="panel lobby-activity-admin"
        aria-labelledby="lobby-activity-title"
      >
        <h1 id="lobby-activity-title">Actividad del salón</h1>
        <p>Los bots abren mesas de 100 patacones ficticios, atienden las altas y completan mesas públicas.</p>
        <p className="muted">
          Al desactivar la actividad, se cierran sus mesas en espera y se liberan los lugares
          que ocupan en mesas de otros jugadores. Las partidas empezadas siguen su curso.
        </p>
        {writeError && <p role="alert">{writeError}</p>}
        {readError ? (
          <>
            <p role="alert">{readError}</p>
            <button type="button" onClick={retry}>
              Volver a consultar
            </button>
          </>
        ) : status ? (
          <div className="lobby-activity-actions">
            <p role="status">
              <strong>{activityLabel}</strong>
            </p>
            {status.available && (
              <button
                className="primary"
                type="button"
                onClick={() => void toggle()}
                disabled={saving}
              >
                {saving ? "Guardando…" : actionLabel}
              </button>
            )}
          </div>
        ) : (
          <p role="status">Consultando el estado…</p>
        )}
      </section>
      <RealLobbyActivity onDenied={onDenied} />
    </main>
  );
}
