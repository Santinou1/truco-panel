import { useEffect, useState } from "react";
import { api, ApiError, message } from "../api";
import { asset, catalog } from "../catalog";
import { MatchHands, type AuditedHand } from "./MatchHands";
import "./daily-ranking-admin.css";

type Person = { userId: string; displayName: string; avatarId: string | null };
type Player = Person & {
  position: number;
  played: number;
  won: number;
  lost: number;
  points: number;
};
type Day = {
  day: string;
  startsAt: string;
  closesAt: string;
  status: "scheduled" | "open" | "settling" | "closed";
  leader: Player | null;
  leaderCount: number;
  participants: number;
  matches: number;
  pending: number;
};
type Page<T> = { items: T[]; total: number; limit: number; offset: number };
type Calendar = { month: string; days: Day[] };
type MatchRow = {
  id: string;
  startedAt: string;
  scores: [number, number];
  team: 0 | 1;
  delta: number;
  rivals: Person[];
};
type MatchDetail = {
  id: string;
  day: string;
  startedAt: string;
  finishedAt: string;
  target: 15 | 30;
  flor: boolean;
  scores: [number, number];
  winner: 0 | 1;
  finishReason: "points" | "resign" | "disconnect_timeout";
  players: (Person & { seat: number; team: 0 | 1; delta: number })[];
  hands?: AuditedHand[];
};
type Denied = (status: 401 | 403) => void;
const endpoint = "/admin/ranking/daily";
const zone = "America/Argentina/Buenos_Aires";
const monthFormat = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: zone,
  hourCycle: "h23",
});
const stampFormat = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: zone,
});
const date = (iso: string) => new Date(iso + "T00:00:00Z");
const dateText = (day: string) => dayFormat.format(date(day));
const time = (iso: string) => timeFormat.format(new Date(iso));
const stamp = (iso: string) => stampFormat.format(new Date(iso));
function duration(startedAt: string, finishedAt: string) {
  const seconds = Math.floor((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? hours + " h " : ""}${minutes} min ${seconds % 60} s`;
}
const shortId = (id: string) => "#" + id.slice(0, 8).toUpperCase();
const deltaText = (delta: number) => (delta < 0 ? "−" : "+") + Math.abs(delta);
const statusLabel = {
  scheduled: "Próxima",
  open: "En juego",
  settling: "Cerrando",
  closed: "Cerrada",
};

function useAdminRanking<T>(
  path: string | null,
  onDenied: Denied,
  filter?: string,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  const key = JSON.stringify([path, filter, attempt]);
  useEffect(() => {
    if (!path) return;
    let live = true;
    void api<T>(path, filter ? JSON.parse(filter) : undefined)
      .then((data) => {
        if (live) setState({ key, data });
      })
      .catch((cause) => {
        if (!live) return;
        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.status === 403)
        )
          onDenied(cause.status);
        else setState({ key, error: message(cause) });
      });
    return () => {
      live = false;
    };
  }, [path, key, onDenied, filter]);
  return {
    data: state?.key === key ? state.data : undefined,
    error: state?.key === key ? state.error : undefined,
    refresh: () => setAttempt((value) => value + 1),
  };
}

function Loading({ error, retry }: { error?: string; retry: () => void }) {
  return error ? (
    <div className="panel ranking-admin-notice">
      <p role="alert">{error}</p>
      <button onClick={retry}>Reintentar</button>
    </div>
  ) : (
    <p role="status">Consultando el ranking diario…</p>
  );
}

function Avatar({ person }: { person: Person }) {
  const avatar = catalog.avatars.find((item) => item.id === person.avatarId);
  return (
    <span className="ranking-admin-avatar" aria-hidden="true">
      {person.displayName.slice(0, 1).toUpperCase()}
      {avatar && (
        <img
          src={asset(avatar.image)}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}

function PersonName({ person }: { person: Person }) {
  return (
    <span className="ranking-admin-name">
      <Avatar person={person} />
      <span>{person.displayName}</span>
    </span>
  );
}

function Status({ status }: Pick<Day, "status">) {
  return (
    <span className={"ranking-admin-tag " + status}>{statusLabel[status]}</span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="ranking-admin-stat">
      <span className="eyebrow">{label}</span>
      <strong>{value.toLocaleString("es-AR")}</strong>
    </div>
  );
}

function Leader({ day }: { day: Day }) {
  const label =
    day.leaderCount > 1
      ? "Primer puesto compartido"
      : day.status === "closed"
        ? "Ganador de la jornada"
        : "Liderazgo provisional";
  return (
    <div className="ranking-admin-leader panel">
      <div>
        <span className="eyebrow">{label}</span>
        {day.leader ? (
          <PersonName person={day.leader} />
        ) : (
          <span>Sin partidas finalizadas</span>
        )}
        {day.leaderCount > 1 && (
          <small>{day.leaderCount} jugadores en primer lugar</small>
        )}
      </div>
      {day.leader && (
        <strong>{day.leader.points.toLocaleString("es-AR")} pts</strong>
      )}
    </div>
  );
}

function Pager({
  page,
  onPage,
}: {
  page: Page<unknown>;
  onPage: (offset: number) => void;
}) {
  if (page.total <= page.limit) return null;
  return (
    <nav className="ranking-admin-pager" aria-label="Páginas de resultados">
      <button
        disabled={page.offset === 0}
        onClick={() => onPage(Math.max(0, page.offset - page.limit))}
      >
        ← Anterior
      </button>
      <span>
        {page.offset + 1}–{page.offset + page.items.length} de {page.total}
      </span>
      <button
        disabled={page.offset + page.limit >= page.total}
        onClick={() => onPage(page.offset + page.limit)}
      >
        Siguiente →
      </button>
    </nav>
  );
}

function CalendarView({
  calendar,
  selectedDay,
  selectDay,
  changeMonth,
  openDay,
  refresh,
}: {
  calendar: Calendar;
  selectedDay: string | null;
  selectDay: (day: string) => void;
  changeMonth: (month: string) => void;
  openDay: (day: string) => void;
  refresh: () => void;
}) {
  const first = date(calendar.month + "-01");
  const leading = (first.getUTCDay() + 6) % 7;
  const selected =
    calendar.days.find((d) => d.day === selectedDay) ??
    calendar.days.filter((d) => d.status !== "scheduled").at(-1);
  function move(amount: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + amount);
    changeMonth(next.toISOString().slice(0, 7));
  }
  return (
    <>
      <div className="ranking-admin-heading">
        <div>
          <span className="eyebrow">COMPETENCIA DEL SALÓN</span>
          <h1>Ranking diario</h1>
          <p>Elegí una fecha para consultar la clasificación y sus partidas.</p>
        </div>
        <button onClick={refresh}>↻ Actualizar</button>
      </div>
      <div className="ranking-admin-calendar">
        <section className="panel">
          <div className="ranking-admin-month">
            <button
              aria-label="Mes anterior"
              disabled={calendar.month === "1000-01"}
              onClick={() => move(-1)}
            >
              ‹
            </button>
            <h2>{monthFormat.format(first)}</h2>
            <button
              aria-label="Mes siguiente"
              disabled={calendar.month === "9999-12"}
              onClick={() => move(1)}
            >
              ›
            </button>
          </div>
          <div className="ranking-admin-dates">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((name) => (
              <span key={name}>{name}</span>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <span key={"empty-" + index} />
            ))}
            {calendar.days.map((day) => (
              <button
                key={day.day}
                className={day.status}
                disabled={day.status === "scheduled"}
                aria-pressed={selected?.day === day.day}
                aria-label={dateText(day.day) + " · " + statusLabel[day.status]}
                onClick={() => selectDay(day.day)}
              >
                {Number(day.day.slice(-2))}
              </button>
            ))}
          </div>
          <div className="ranking-admin-key">
            <Status status="open" />
            <Status status="settling" />
            <Status status="closed" />
          </div>
        </section>
        {selected && (
          <section className="panel ranking-admin-selected">
            <span className="eyebrow">JORNADA SELECCIONADA</span>
            <h2>{dateText(selected.day)}</h2>
            <Status status={selected.status} />
            <Leader day={selected} />
            <div className="ranking-admin-pair">
              <Stat label="Jugadores" value={selected.participants} />
              <Stat label="Partidas" value={selected.matches} />
            </div>
            <button className="primary" onClick={() => openDay(selected.day)}>
              Abrir jornada →
            </button>
          </section>
        )}
      </div>
    </>
  );
}

export function DailyRankingAdmin({ onDenied }: { onDenied: Denied }) {
  const [month, setMonth] = useState("");
  const [selectedDay, selectDay] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [daySearch, setDaySearch] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [rivalSearch, setRivalSearch] = useState("");
  const [rivalFilter, setRivalFilter] = useState("");
  const [outcome, setOutcome] = useState("");
  const [matchOffset, setMatchOffset] = useState(0);
  const dayPath = day ? endpoint + "/" + day : null;
  const calendar = useAdminRanking<Calendar>(
    day ? null : endpoint + (month ? "?month=" + month : ""),
    onDenied,
  );
  const boardQuery = new URLSearchParams({
    offset: String(dayOffset),
    search: dayFilter,
  });
  const board = useAdminRanking<Day & Page<Player>>(
    dayPath && !playerId ? dayPath + "?" + boardQuery : null,
    onDenied,
  );
  const player = useAdminRanking<Page<MatchRow> & { player: Player }>(
    dayPath && playerId && !matchId ? dayPath + "/players/" + playerId : null,
    onDenied,
    JSON.stringify({
      search: rivalFilter,
      offset: matchOffset,
      ...(outcome ? { outcome } : {}),
    }),
  );
  const match = useAdminRanking<MatchDetail>(
    dayPath && matchId ? dayPath + "/matches/" + matchId : null,
    onDenied,
  );
  function openDay(value: string) {
    selectDay(value);
    setDay(value);
    setDaySearch("");
    setDayFilter("");
    setDayOffset(0);
  }
  function openPlayer(id: string) {
    setPlayerId(id);
    setRivalSearch("");
    setRivalFilter("");
    setMatchOffset(0);
    setOutcome("");
  }
  const view = matchId
    ? "match"
    : playerId
      ? "player"
      : day
        ? "day"
        : "calendar";
  const data = match.data;
  const history = player.data;
  const standings = board.data;
  return (
    <main className="page ranking-admin">
      {view === "calendar" &&
        (calendar.data ? (
          <CalendarView
            calendar={calendar.data}
            selectedDay={selectedDay}
            selectDay={selectDay}
            changeMonth={(value) => {
              setMonth(value);
              selectDay(null);
            }}
            openDay={openDay}
            refresh={calendar.refresh}
          />
        ) : (
          <Loading error={calendar.error} retry={calendar.refresh} />
        ))}

      {view === "day" && (
        <>
          <header className="ranking-admin-heading">
            <div>
              <span className="eyebrow">RANKING DIARIO</span>
              <h1>{dateText(day!)}</h1>
              {standings && (
                <p>
                  {stamp(standings.startsAt)} {time(standings.startsAt)} →{" "}
                  {stamp(standings.closesAt)} {time(standings.closesAt)} · Hora
                  argentina
                </p>
              )}
            </div>
            <button onClick={() => setDay(null)}>← Todas las jornadas</button>
          </header>
          {standings && (
            <>
              <div className="ranking-admin-key">
                <Status status={standings.status} />
                {standings.status === "settling" && (
                  <span>{standings.pending} partidas por terminar</span>
                )}
              </div>
              <div className="ranking-admin-summary">
                <Leader day={standings} />
                <Stat label="Jugadores" value={standings.participants} />
                <Stat label="Partidas" value={standings.matches} />
              </div>
            </>
          )}
          <form
            className="ranking-admin-filter"
            onSubmit={(event) => {
              event.preventDefault();
              setDayFilter(daySearch.trim());
              setDayOffset(0);
            }}
          >
            <label>
              Buscar jugador
              <input
                type="search"
                value={daySearch}
                maxLength={254}
                onChange={(event) => setDaySearch(event.target.value)}
              />
            </label>
            <button type="submit">Buscar</button>
            <button type="button" onClick={board.refresh}>
              ↻ Actualizar
            </button>
          </form>
          {standings ? (
            <>
              {standings.items.length ? (
                <div
                  className="panel ranking-admin-table"
                  tabIndex={0}
                  aria-label="Participantes de la jornada"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Puesto</th>
                        <th scope="col">Jugador</th>
                        <th scope="col">Jugadas</th>
                        <th scope="col">Ganadas</th>
                        <th scope="col">Perdidas</th>
                        <th scope="col">Puntos</th>
                        <th scope="col">Historial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.items.map((row) => (
                        <tr key={row.userId}>
                          <td>{row.position}</td>
                          <th scope="row">
                            <PersonName person={row} />
                          </th>
                          <td>{row.played}</td>
                          <td>{row.won}</td>
                          <td>{row.lost}</td>
                          <td>{row.points}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => openPlayer(row.userId)}
                              aria-label={"Ver partidas de " + row.displayName}
                            >
                              Ver partidas →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p role="status">
                  {dayFilter
                    ? "Ningún jugador coincide con la búsqueda."
                    : "Todavía no hay partidas finalizadas."}
                </p>
              )}
              <Pager page={standings} onPage={setDayOffset} />
            </>
          ) : (
            <Loading error={board.error} retry={board.refresh} />
          )}
        </>
      )}

      {view === "player" && (
        <>
          <header className="ranking-admin-heading">
            <div>
              <span className="eyebrow">JORNADA · {dateText(day!)}</span>
              <h1>{history?.player.displayName ?? "Partidas del jugador"}</h1>
              {history && <p>Puesto {history.player.position} en la jornada</p>}
            </div>
            <button onClick={() => setPlayerId(null)}>
              ← Volver a la jornada
            </button>
          </header>
          {history && (
            <div className="ranking-admin-player-stats">
              <Stat label="Jugadas" value={history.player.played} />
              <Stat label="Ganadas" value={history.player.won} />
              <Stat label="Perdidas" value={history.player.lost} />
              <Stat label="Puntos" value={history.player.points} />
            </div>
          )}
          <form
            className="ranking-admin-filter"
            onSubmit={(event) => {
              event.preventDefault();
              setRivalFilter(rivalSearch.trim());
              setMatchOffset(0);
            }}
          >
            <label>
              Buscar por nombre, correo del rival o ID de partida
              <input
                type="search"
                value={rivalSearch}
                onChange={(event) => setRivalSearch(event.target.value)}
                maxLength={254}
                autoComplete="off"
              />
            </label>
            <label>
              Resultado
              <select
                value={outcome}
                onChange={(event) => {
                  setOutcome(event.target.value);
                  setMatchOffset(0);
                }}
              >
                <option value="">Todos</option>
                <option value="win">Ganadas</option>
                <option value="loss">Perdidas</option>
              </select>
            </label>
            <button type="submit">Buscar</button>
            {rivalFilter && (
              <button
                type="button"
                onClick={() => {
                  setRivalSearch("");
                  setRivalFilter("");
                  setMatchOffset(0);
                }}
              >
                Limpiar
              </button>
            )}
          </form>
          {history ? (
            <>
              <p role="status">
                {history.total} de {history.player.played} partidas
              </p>
              {history.items.length ? (
                <div
                  className="panel ranking-admin-table"
                  tabIndex={0}
                  aria-label="Partidas del jugador"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Inicio</th>
                        <th scope="col">Rivales</th>
                        <th scope="col">Marcador</th>
                        <th scope="col">Resultado</th>
                        <th scope="col">Puntos</th>
                        <th scope="col">Partida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.items.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {time(row.startedAt)}{" "}
                            <small>{stamp(row.startedAt)}</small>
                          </td>
                          <th scope="row">
                            {row.rivals.map((rival) => (
                              <PersonName key={rival.userId} person={rival} />
                            ))}
                          </th>
                          <td>
                            {row.scores[row.team]}–{row.scores[1 - row.team]}
                          </td>
                          <td>
                            <span
                              className={
                                "ranking-admin-tag " +
                                (row.delta > 0 ? "win" : "loss")
                              }
                            >
                              {row.delta > 0 ? "Ganó" : "Perdió"}
                            </span>
                          </td>
                          <td>{deltaText(row.delta)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setMatchId(row.id)}
                              aria-label={"Ver partida " + shortId(row.id)}
                            >
                              {shortId(row.id)} →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No hay partidas con estos filtros.</p>
              )}
              <Pager page={history} onPage={setMatchOffset} />
            </>
          ) : (
            <Loading error={player.error} retry={player.refresh} />
          )}
        </>
      )}

      {view === "match" && (
        <>
          <header className="ranking-admin-heading">
            <div>
              <span className="eyebrow">JORNADA · {dateText(day!)}</span>
              <h1>Partida {shortId(matchId!)}</h1>
              {data && (
                <p>
                  Truco {data.players.length === 4 ? "2v2" : "1v1"} · A{" "}
                  {data.target} puntos · {data.flor ? "Con flor" : "Sin flor"}
                </p>
              )}
            </div>
            <button onClick={() => setMatchId(null)}>
              ← Partidas del jugador
            </button>
          </header>
          {data ? (
            <>
              <div className="panel ranking-admin-versus">
                {([0, 1] as const).map((team) => (
                  <section
                    key={team}
                    className={team === data.winner ? "winner" : ""}
                  >
                    <span className="eyebrow">
                      {team === data.winner
                        ? data.players.length === 4
                          ? "EQUIPO GANADOR"
                          : "GANADOR"
                        : data.players.length === 4
                          ? "EQUIPO RIVAL"
                          : "RIVAL"}
                    </span>
                    {data.players
                      .filter((p) => p.team === team)
                      .map((p) => (
                        <PersonName key={p.userId} person={p} />
                      ))}
                    <strong>{data.scores[team]}</strong>
                    <span
                      className={
                        "ranking-admin-tag " +
                        (team === data.winner ? "win" : "loss")
                      }
                    >
                      {deltaText(
                        data.players.find((p) => p.team === team)!.delta,
                      )}{" "}
                      pts de ranking por jugador
                    </span>
                  </section>
                ))}
              </div>
              <div className="ranking-admin-times">
                <div>
                  <span className="eyebrow">
                    INICIO · {stamp(data.startedAt)}
                  </span>
                  <strong>{time(data.startedAt)}</strong>
                </div>
                <div>
                  <span className="eyebrow">
                    FINAL · {stamp(data.finishedAt)}
                  </span>
                  <strong>{time(data.finishedAt)}</strong>
                </div>
                <div>
                  <span className="eyebrow">DURACIÓN</span>
                  <strong>{duration(data.startedAt, data.finishedAt)}</strong>
                </div>
              </div>
              <div className="panel ranking-admin-notice">
                <p>
                  <b>Cuenta para la jornada del {dateText(data.day)}.</b> La
                  hora de inicio determina la jornada.
                </p>
                {data.finishReason === "resign" && (
                  <small>Terminó por abandono.</small>
                )}
                {data.finishReason === "disconnect_timeout" && (
                  <small>Terminó por desconexión.</small>
                )}
              </div>
              <MatchHands hands={data.hands ?? []} players={data.players} />
            </>
          ) : (
            <Loading error={match.error} retry={match.refresh} />
          )}
        </>
      )}
    </main>
  );
}
