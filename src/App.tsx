import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, message, navigate } from "./api";
import { Access } from "./components/Access";
import { Admin } from "./components/Admin";
import { asset } from "./catalog";
import type { User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const gameUrl = import.meta.env.VITE_GAME_URL || "http://localhost:5174";
  const accept = useCallback(async (next: User) => {
    setUser(next);
    setError("");
    navigate("/", { replace: true });
  }, []);
  useEffect(() => {
    let live = true;
    setBooting(true);
    setBootError(false);
    void (async () => {
      try {
        const providers = await api<{ googlePanel: boolean }>(
          "/auth/providers",
        );
        if (!live) return;
        setGoogle(providers.googlePanel);
        const current = await api<User>("/users/me");
        if (live) await accept(current);
      } catch (cause) {
        if (!live) return;
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(message(cause));
          setBootError(true);
        } else {
          const oauthError = new URLSearchParams(location.search).has("error");
          navigate("/", { replace: true });
          if (oauthError)
            setError(
              "No se completó el ingreso con Google. Volvé a intentarlo.",
            );
        }
      } finally {
        if (live) setBooting(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [accept, attempt]);
  const run = (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    void work()
      .catch((cause) => setError(message(cause)))
      .finally(() => {
        lock.current = false;
        setBusy(false);
      });
  };
  const denied = useCallback((status: 401 | 403) => {
    if (status === 401) {
      setUser(null);
      navigate("/", { replace: true });
      setError("Tu sesión venció. Volvé a ingresar.");
    } else {
      setUser((current) => (current ? { ...current, role: "user" } : null));
      setError("Tu cuenta ya no tiene permisos de administración.");
    }
  }, []);
  const logout = () =>
    run(async () => {
      try {
        await api("/auth/logout", {});
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 401)) throw cause;
      }
      setUser(null);
      navigate("/", { replace: true });
    });
  return (
    <div className={user ? "workspace" : "entry"}>
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      {user && (
        <aside className="sidebar">
          <a href="/" className="brand">
            La Pulpería<span>ADMINISTRACIÓN</span>
          </a>
          <div className="sidebar-rule" />
          <span className="eyebrow">LA CASA</span>
          <nav aria-label="Administración">
            {user.role === "super_admin" && (
              <a
                className="nav-active"
                href="#main-content"
                aria-current="page"
              >
                <span aria-hidden="true">▦</span> Catálogo y precios
              </a>
            )}
            <a href={gameUrl} target="_blank" rel="noreferrer">
              <span aria-hidden="true">↗</span> Abrir el juego
            </a>
          </nav>
          <div className="sidebar-bottom">
            <img src={asset("economia/cofre-cerrado.png")} alt="" />
            <p>
              Las cuentas claras.
              <br />
              La casa en orden.
            </p>
            <small>La Pulpería · Truco argentino</small>
          </div>
        </aside>
      )}
      <div className="workspace-body">
        <header className="topbar">
          {user ? (
            <span className="breadcrumb">
              La casa <span>/</span> Administración
            </span>
          ) : (
            <a className="brand" href="/">
              La Pulpería<span>ADMINISTRACIÓN</span>
            </a>
          )}
          {user ? (
            <div className="session">
              <span>
                <strong>{user.email || user.displayName}</strong>
                <small>
                  {user.role === "super_admin"
                    ? "Superadministrador"
                    : "Sin permisos de administración"}
                </small>
              </span>
              <button className="quiet" onClick={logout} disabled={busy}>
                Salir
              </button>
            </div>
          ) : (
            <a className="game-link" href={gameUrl}>
              Ir al juego ↗
            </a>
          )}
        </header>
        <div id="main-content" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="quiet"
                aria-label="Cerrar mensaje"
                onClick={() => setError("")}
              >
                ×
              </button>
            </div>
          )}
          {booting ? (
            <main className="empty-state" role="status">
              Preparando la casa…
            </main>
          ) : bootError ? (
            <main className="empty-state">
              <h1>No pudimos conectar</h1>
              <p>Reintentá para consultar tu sesión.</p>
              <button onClick={() => setAttempt((value) => value + 1)}>
                Reintentar conexión
              </button>
            </main>
          ) : !user ? (
            <Access onSuccess={accept} run={run} busy={busy} google={google} />
          ) : user.role === "super_admin" ? (
            <Admin key={user.id} onDenied={denied} />
          ) : (
            <main className="page">
              <section className="panel empty-state">
                <span className="eyebrow">ACCESO RESTRINGIDO</span>
                <h1>Este panel es privado</h1>
                <p>Tu cuenta no tiene permisos de superadministrador.</p>
                <button className="primary" onClick={logout} disabled={busy}>
                  Ingresar con otra cuenta
                </button>
              </section>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
