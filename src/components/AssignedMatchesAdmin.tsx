import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./assigned-matches-admin.css";

type Player = {
  id: string;
  displayName: string;
  username: string | null;
  email: string;
};
type PlayerResults = { items: Player[]; hasMore: boolean };
type PlayerLookup = { query: string } & (
  | { results: PlayerResults; error?: never }
  | { error: string; results?: never }
);
type Invitation = {
  path: string;
  expiresAt: string;
  rankingCurrency?: "ARS" | "PLAY_CHIP";
};
type MatchRules = { target: 15 | 30; flor: boolean };
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
  const resultsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useRef<HTMLUListElement>(null);
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState<PlayerLookup | null>(null);
  const [attempt, setAttempt] = useState(0);
  const query = search.trim();
  const shouldSearch = !player && !disabled && query.length >= 2;
  const current = shouldSearch && lookup?.query === query ? lookup : null;
  const results = current?.results;

  useEffect(() => {
    if (!shouldSearch) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await api<PlayerResults>(endpoint + "/players/search", {
          search: query,
        });
        if (active) setLookup({ query, results });
      } catch (cause) {
        if (active)
          reportError(cause, onDenied, (error) => setLookup({ query, error }));
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [shouldSearch, query, attempt, onDenied]);

  return (
    <div className="assigned-player">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={input}
        value={search}
        onChange={(event) => {
          const next = event.target.value;
          if (next.trim() !== query) setLookup(null);
          setSearch(next);
          if (player) onSelect(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          const first = suggestions.current?.querySelector<HTMLButtonElement>(
            "button:not(:disabled)",
          );
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
        type="search"
        maxLength={254}
        placeholder="Nombre, usuario o correo completo"
        autoComplete="off"
        aria-controls={results?.items.length ? resultsId : undefined}
        disabled={disabled}
      />
      {shouldSearch && !current && (
        <p className="muted" role="status">
          Buscando…
        </p>
      )}
      {current?.error && (
        <>
          <p role="alert">{current.error}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLookup(null);
              setAttempt((value) => value + 1);
              input.current?.focus();
            }}
          >
            Reintentar búsqueda
          </button>
        </>
      )}
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
            <ul
              id={resultsId}
              ref={suggestions}
              className="assigned-results"
              aria-label={`Sugerencias para ${label.toLowerCase()}`}
            >
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
                      setLookup(null);
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
    </div>
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
  const [target, setTarget] = useState<MatchRules["target"]>(30);
  const [flor, setFlor] = useState(false);
  const [win, setWin] = useState("");
  const [loss, setLoss] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    | (Invitation & MatchRules & {
        title: string;
        winPoints: number;
        lossPoints: number;
      })
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
      target,
      flor,
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
        target: body.target,
        flor: body.flor,
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
          Creá una mesa privada 1 vs. 1, gratuita.
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
            <legend>Reglas de la partida</legend>
            <div className="assigned-grid">
              <label>
                Puntos para ganar
                <select
                  value={target}
                  onChange={(event) =>
                    setTarget(event.currentTarget.value === "15" ? 15 : 30)
                  }
                >
                  <option value="15">15 puntos</option>
                  <option value="30">30 puntos</option>
                </select>
              </label>
              <label>
                Flor
                <select
                  value={flor ? "with" : "without"}
                  onChange={(event) =>
                    setFlor(event.currentTarget.value === "with")
                  }
                >
                  <option value="without">Sin flor</option>
                  <option value="with">Con flor</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset disabled={saving}>
            <legend>Ranking diario de Patacones reales</legend>
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
              {result.target} puntos · {result.flor ? "Con flor" : "Sin flor"}
            </p>
            <p>
              Ranking diario de Patacones{" "}
              {result.rankingCurrency === "ARS" ? "reales" : "ficticios"} · +
              {result.winPoints} por victoria y −
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
