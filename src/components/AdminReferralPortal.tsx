import { useCallback, useEffect, useState } from "react";
import { api, ApiError, message } from "../api";
import { PortalDashboard, type PortalAccount } from "./ReferralPortal";

type AdminAccount = PortalAccount & {
  activatedAt: string | null;
  revokedAt: string | null;
};

export function AdminReferralPortal({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<AdminAccount>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const apiBase = `/admin/referral-portal/accounts/${encodeURIComponent(accountId)}`;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setAccount(undefined);
    setError("");
    void api<AdminAccount>(apiBase)
      .then((result) => { if (live) setAccount(result); })
      .catch((cause) => {
        if (!live) return;
        setError(cause instanceof ApiError && cause.status === 401
          ? "Ingresá a la administración con tu cuenta de soporte para consultar este panel."
          : cause instanceof ApiError && cause.status === 403
            ? "Tu cuenta no tiene permisos de superadministrador para consultar este panel."
            : message(cause));
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [apiBase, attempt]);

  const denied = useCallback(() => {
    setAccount(undefined);
    setError("Tu sesión de soporte venció o ya no tiene permisos de superadministrador.");
  }, []);

  return (
    <div className="referral-portal-shell">
      <a href="#portal-main" className="skip-link">Saltar al contenido</a>
      <header className="portal-topbar">
        <a className="brand" href="/">La Pulpería<span>ADMINISTRACIÓN DE REFERIDOS</span></a>
        <a href="/">Volver a la administración</a>
      </header>
      <main id="portal-main" className="page referral-portal" tabIndex={-1}>
        <section className="panel portal-notice" aria-label="Consulta de soporte">
          <strong>Vista de superadministrador</strong>
          <p>Estás consultando el panel del referido con tu sesión de soporte.</p>
          {account && <p>{account.email} · {account.revokedAt ? "Acceso revocado" : account.activatedAt ? "Acceso registrado" : "Registro pendiente"}</p>}
        </section>
        {error && <section className="panel portal-notice">
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt(value => value + 1)}>Reintentar acceso de soporte</button>
          <p><a href="/">Ingresar a la administración</a></p>
        </section>}
        {loading ? <p role="status">Comprobando el acceso de soporte…</p> : account && (
          <PortalDashboard
            key={`${account.id}:${attempt}`}
            account={account}
            apiBase={apiBase}
            onDenied={denied}
            onRefresh={() => setAttempt(value => value + 1)}
          />
        )}
      </main>
    </div>
  );
}
