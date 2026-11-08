import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import "./simulation-admin.css";

type SimulationState = {
  available: boolean;
  enabled: boolean;
  version: number;
  updatedAt: string;
};

export function SimulationAdmin({
  onDenied,
}: {
  onDenied: (status: 401 | 403) => void;
}) {
  const [state, setState] = useState<SimulationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const lock = useRef(false);
  const denied = useCallback(
    (cause: unknown) => {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        onDenied(cause.status);
      else setError(message(cause));
    },
    [onDenied],
  );

  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api<SimulationState>("/admin/simulation");
      if (mounted.current) setState(next);
    } catch (cause) {
      if (mounted.current) denied(cause);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [denied]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  async function toggle() {
    if (!state || !state.available || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api<SimulationState>("/admin/simulation", {
        enabled: !state.enabled,
        expectedVersion: state.version,
      });
      if (!mounted.current) return;
      setState(next);
      setNotice(
        next.enabled ? "Simulación activada." : "Simulación desactivada.",
      );
    } catch (cause) {
      if (mounted.current) denied(cause);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <main className="page simulation-admin">
      <header className="section-heading">
        <span className="eyebrow">EL SALÓN DE PRUEBAS</span>
        <h1>Simulación con bots</h1>
        <p>Abrí o cerrá las mesas de práctica del juego.</p>
      </header>
      <section className="panel simulation-control" aria-busy={busy}>
        <div className="simulation-control-heading">
          <h2>Salón de simulación</h2>
          {state && (
            <span
              className={
                "simulation-control-state" + (state.enabled ? " enabled" : "")
              }
            >
              {state.enabled ? "Activada" : "Desactivada"}
            </span>
          )}
        </div>
        <p>
          Los jugadores pueden practicar contra bots u observar sus partidas. No
          usa fichas ni modifica ELO o estadísticas.
        </p>
        <p className="simulation-control-note">
          Al desactivarla se cierran las mesas de prueba en curso. La elección
          se conserva al reiniciar.
        </p>
        {error && (
          <div className="simulation-control-feedback error" role="alert">
            <p>{error}</p>
            <button
              className="quiet"
              aria-label="Cerrar aviso de simulación"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="simulation-control-feedback" role="status">
            <p>{notice}</p>
            <button
              className="quiet"
              aria-label="Cerrar confirmación de simulación"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {!state && busy && <p role="status">Consultando el estado…</p>}
        {state && !state.available && (
          <p role="status">La simulación no está disponible en este entorno.</p>
        )}
        <div className="simulation-control-actions">
          {state && (
            <button
              className="primary"
              disabled={busy || !state.available}
              aria-pressed={state.enabled}
              onClick={() => void toggle()}
            >
              {busy
                ? "Consultando…"
                : state.enabled
                  ? "Desactivar simulación"
                  : "Activar simulación"}
            </button>
          )}
          <button disabled={busy} onClick={() => void load()}>
            {state ? "Actualizar estado" : "Reintentar carga"}
          </button>
        </div>
      </section>
    </main>
  );
}
