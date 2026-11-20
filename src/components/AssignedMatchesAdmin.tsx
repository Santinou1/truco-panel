import { useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./assigned-matches-admin.css";

type Player = {
  id: string;
  displayName: string;
  username: string | null;
  email: string;
};
type PlayerResults = { items: Player[]; hasMore: boolean };
type Invitation = { path: string; expiresAt: string };
type Denied = (status: 401 | 403) => void;
const endpoint = "/admin/assigned-matches";
const argentinaTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function reportError(
  error: unknown,
  onDenied: Denied,
  setError: (text: string) => void,
) {
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  ) {
    onDenied(error.status);
  } else {
    setError(message(error));
  }
}

function PlayerPicker({
  label,
  player,
  otherId,
  disabled,
  onSelect,
  onDenied,
}: {
  label: string;
  player: Player | null;
  otherId?: string;
  disabled: boolean;
  onSelect: (player: Player | null) => void;
  onDenied: Denied;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlayerResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim().length < 2 || loading || disabled) return;
    setLoading(true);
    setResults(null);
    setError("");
    try {
      setResults(
        await api<PlayerResults>(endpoint + "/players/search", {
          search: search.trim(),
        }),
      );
    } catch (cause) {
      reportError(cause, onDenied, setError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="assigned-player" onSubmit={find} aria-busy={loading}>
      <label htmlFor={inputId}>{label}</label>
      <div className="assigned-inline">
        <input
          id={inputId}
          ref={input}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setResults(null);
            if (player) onSelect(null);
          }}
          type="search"
          maxLength={254}
          placeholder="Nombre, usuario o correo"
          autoComplete="off"
          disabled={loading || disabled}
        />
        <button
          className="secondary"
          disabled={loading || disabled || search.trim().length < 2}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {player && (
        <p role="status">
          <strong>{player.displayName}</strong> · {player.email}
        </p>
      )}
      {results && (
        <>
          <p role="status" className="muted">
            {results.items.length
              ? results.hasMore
                ? "Más de 10 resultados. Podés afinar la búsqueda."
                : "Elegí la cuenta."
              : "No encontramos cuentas verificadas con esa búsqueda."}
          </p>
          {!!results.items.length && (
            <ul className="assigned-results">
              {results.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={disabled || item.id === otherId}
                    onClick={() => {
                      onSelect(item);
                      setSearch(
                        item.username ? "@" + item.username : item.email,
                      );
                      setResults(null);
                      input.current?.focus();
                    }}
                  >
                    <strong>
                      {item.displayName}
                      {item.username && ` · @${item.username}`}
                    </strong>
                    <small>
                      {item.email}
                      {item.id === otherId && " · Ya elegido"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </form>
  );
}

export function AssignedMatchesAdmin({
  gameUrl,
  onDenied,
}: {
  gameUrl: string;
  onDenied: Denied;
}) {
  const [one, setOne] = useState<Player | null>(null);
  const [two, setTwo] = useState<Player | null>(null);
  const [win, setWin] = useState("");
  const [loss, setLoss] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    | (Invitation & { title: string; winPoints: number; lossPoints: number })
    | null
  >(null);
  const [copyStatus, setCopyStatus] = useState("");
  const intent = useRef<{ body: string; key: string } | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const link = result ? new URL(result.path, gameUrl).href : "";

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!one || !two || one.id === two.id || !win || !loss || saving) return;
    const body = {
      playerOneId: one.id,
      playerTwoId: two.id,
      winPoints: Number(win),
      lossPoints: Number(loss),
    };
    const fingerprint = JSON.stringify(body);
    if (intent.current?.body !== fingerprint) {
      intent.current = { body: fingerprint, key: crypto.randomUUID() };
    }
    setSaving(true);
    setError("");
    setCopyStatus("");
    try {
      const invitation = await api<Invitation>(
        endpoint,
        body,
        intent.current.key,
      );
      setResult({
        ...invitation,
        title: `${one.displayName} vs. ${two.displayName}`,
        winPoints: body.winPoints,
        lossPoints: body.lossPoints,
      });
      intent.current = null;
      setWin("");
      setLoss("");
    } catch (cause) {
      reportError(cause, onDenied, setError);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("Enlace copiado.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyStatus("El enlace está seleccionado para que puedas copiarlo.");
    }
  }

  return (
    <main className="page">
      <section
        className="panel assigned-matches"
        aria-labelledby="assigned-matches-title"
      >
        <h1 id="assigned-matches-title">Partidas por usuario</h1>
        <p className="muted">
          Creá una mesa privada 1 vs. 1, gratuita, a 30 puntos y sin flor.
        </p>
        <div className="assigned-grid">
          <PlayerPicker
            label="Jugador 1"
            player={one}
            otherId={two?.id}
            disabled={saving}
            onSelect={setOne}
            onDenied={onDenied}
          />
          <PlayerPicker
            label="Jugador 2"
            player={two}
            otherId={one?.id}
            disabled={saving}
            onSelect={setTwo}
            onDenied={onDenied}
          />
        </div>
        <form onSubmit={create} aria-busy={saving}>
          <fieldset disabled={saving}>
            <legend>Ranking diario de patacones ficticios</legend>
            <p className="muted">
              La jornada cuenta partidas iniciadas desde las 09:00 hasta antes
              de las 03:00 del día siguiente, hora argentina.
            </p>
            <div className="assigned-grid">
              <label>
                Puntos por victoria
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  required
                  value={win}
                  onChange={(event) => setWin(event.target.value)}
                />
              </label>
              <label>
                Puntos que se descuentan por derrota
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  required
                  value={loss}
                  onChange={(event) => setLoss(event.target.value)}
                />
              </label>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <button className="primary" disabled={saving || !one || !two}>
            {saving ? "Creando partida…" : "Crear partida y generar enlace"}
          </button>
        </form>
        {result && (
          <section
            className="assigned-link"
            aria-labelledby="assigned-link-title"
          >
            <h2 id="assigned-link-title" aria-live="polite">
              Enlace listo para {result.title}
            </h2>
            <p>
              Ranking diario · +{result.winPoints} por victoria y −
              {result.lossPoints} por derrota.
            </p>
            <p className="muted">
              Compartilo con ambos jugadores. Pueden iniciar la partida hasta el{" "}
              {argentinaTime.format(new Date(result.expiresAt))} (hora
              argentina).
            </p>
            <label htmlFor="assigned-invite-url">Enlace de la partida</label>
            <div className="assigned-inline">
              <input
                id="assigned-invite-url"
                ref={linkInput}
                readOnly
                value={link}
              />
              <button type="button" className="secondary" onClick={copyLink}>
                Copiar enlace
              </button>
            </div>
            {copyStatus && <p role="status">{copyStatus}</p>}
          </section>
        )}
      </section>
    </main>
  );
}
