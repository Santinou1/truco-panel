import { useEffect, useState } from "react";
import { api } from "../api";
import { asset } from "../catalog";
import type { User } from "../types";
type Challenge = {
  verificationRequired: true;
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAt: string;
};

export function Access({
  onSuccess,
  run,
  busy,
  google,
}: {
  onSuccess: (user: User) => Promise<void>;
  run: (work: () => Promise<void>) => void;
  busy: boolean;
  google: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const heading = challenge
    ? "Verificá tu correo"
    : "Entrá a la administración";
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const remaining = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAt) - now) / 1000))
    : 0;
  const expired = challenge ? Date.parse(challenge.expiresAt) <= now : false;
  const acceptChallenge = (next: Challenge) => {
    setChallenge(next);
    setCode("");
    setNow(Date.now());
  };
  return (
    <main className="access">
      <section className="welcome">
        <span className="eyebrow">DE ESTE LADO DEL MOSTRADOR</span>
        <h1>
          La casa,
          <br />
          <em>en tus manos.</em>
        </h1>
        <p>
          Un lugar para cuidar los detalles
          <br />
          que hacen a La Pulpería.
        </p>
        <img
          src={asset("economia/cofre-cerrado.png")}
          alt="Cofre de fichas de La Pulpería"
        />
        <span className="welcome-foot">
          PERSONAJES · MARCOS · MESAS · REVERSOS
        </span>
      </section>
      <section className="access-panel panel" aria-labelledby="access-title">
        <span className="eyebrow">ACCESO DEL ADMINISTRADOR</span>
        <h2 id="access-title">{heading}</h2>
        <p className="muted">
          {challenge
            ? `Ingresá el código de seis dígitos enviado a ${challenge.email}.`
            : "Usá tu cuenta autorizada para gestionar la casa."}
        </p>
        {challenge ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await api<{ user: User }>("/auth/email/verify", {
                  challengeId: challenge.challengeId,
                  code,
                });
                await onSuccess(result.user);
              });
            }}
          >
            <label>
              Código de verificación
              <input
                autoFocus
                required
                pattern="[0-9]{6}"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            {expired && <p role="status">El código venció. Pedí uno nuevo.</p>}
            <button className="primary full" disabled={busy || expired}>
              Verificar y entrar
            </button>
            <button
              className="secondary full"
              type="button"
              disabled={busy || remaining > 0}
              onClick={() =>
                run(async () =>
                  acceptChallenge(
                    await api<Challenge>("/auth/email/resend", {
                      challengeId: challenge.challengeId,
                    }),
                  ),
                )
              }
            >
              {remaining ? `Reenviar en ${remaining} s` : "Reenviar código"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setCode("");
              }}
            >
              Volver al ingreso
            </button>
          </form>
        ) : (
          <>
            {google && (
              <>
                <a className="google-button" href="/api/auth/google?app=panel">
                  <span aria-hidden="true">G</span> Continuar con Google
                </a>
                <div className="separator">o ingresá con tu email</div>
              </>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const result = await api<Challenge | { user: User }>(
                    "/auth/login",
                    { email, password },
                  );
                  setPassword("");
                  if ("verificationRequired" in result) acceptChallenge(result);
                  else await onSuccess(result.user);
                });
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="username"
                  maxLength={254}
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label htmlFor="password">Contraseña</label>
              <div className="password-field">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="quiet"
                  aria-label={
                    visible ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Ocultar" : "Ver"}
                </button>
              </div>
              <button className="primary full" disabled={busy}>
                {busy ? "Ingresando…" : "Entrar al panel"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </>
        )}
        <p className="access-note">
          Acceso exclusivo para la administración.
          <br />
          Los permisos los define tu cuenta.
        </p>
      </section>
    </main>
  );
}
