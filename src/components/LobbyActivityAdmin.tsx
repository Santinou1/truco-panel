import { useEffect, useState } from "react";
import { api, ApiError, message } from "../api";
import "./lobby-activity-admin.css";

type LobbyActivity = { available: boolean; enabled: boolean; version: number };
type Denied = (status: 401 | 403) => void;
const endpoint = "/admin/lobby-activity";

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
        <p>Los bots abren mesas de 100 fichas, atienden las altas y completan mesas públicas.</p>
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
    </main>
  );
}
