import { useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import {
  TournamentDetail,
  TournamentSummary,
  pesos,
  roundName,
  tournamentDate,
  tournamentMutation,
  tournamentStatus,
  pendingTournamentIntent,
} from "../tournaments";
import "./tournament-admin.css";
type Config = {
  capacity: 8 | 16;
  botCount: number;
  name: string;
  description: string;
  startMode: "scheduled" | "when_full";
  startsAt: string | null;
  target: 15 | 30;
  flor: boolean;
  prize: number;
  banner: "ancho" | "envido";
};
const blank: Config = {
  capacity: 16,
  botCount: 0,
  name: "",
  description: "",
  startMode: "when_full",
  startsAt: null,
  target: 30,
  flor: false,
  prize: 30000,
  banner: "ancho",
};
const localTime = (value: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function Editor({
  initial,
  busy,
  onSave,
  onClose,
}: {
  initial: Config;
  busy: boolean;
  onSave: (c: Config) => void;
  onClose: () => void;
}) {
  const [c, set] = useState(initial);
  const [date, setDate] = useState(localTime(c.startsAt));
  return (
    <form
      className="panel tournament-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...c,
          startsAt:
            c.startMode === "scheduled" ? new Date(date).toISOString() : null,
        });
      }}
    >
      <h2>{initial.name ? "Editar configuración" : "Nuevo torneo"}</h2>
      <fieldset disabled={busy}>
        <label>
          Nombre
          <input
            required
            minLength={3}
            maxLength={80}
            value={c.name}
            onChange={(e) => set({ ...c, name: e.target.value })}
          />
        </label>
        <label>
          Descripción
          <textarea
            maxLength={1500}
            value={c.description}
            onChange={(e) => set({ ...c, description: e.target.value })}
          />
        </label>
        <div className="tournament-form-grid">
          <label>
            Participantes
            <select
              value={c.capacity}
              onChange={(e) =>
                set({
                  ...c,
                  capacity: Number(e.target.value) as 8 | 16,
                  botCount: Math.min(c.botCount, Number(e.target.value)),
                })
              }
            >
              <option value={8}>8 jugadores</option>
              <option value={16}>16 jugadores</option>
            </select>
          </label>
          <label>
            Bots de simulación
            <input
              type="number"
              min={0}
              max={c.capacity}
              step={1}
              required
              aria-describedby="bot-help"
              value={c.botCount}
              onChange={(e) => {
                const botCount = Number(e.target.value);
                set({ ...c, botCount, prize: botCount > 0 ? 0 : c.prize });
              }}
            />
          </label>
          <label>
            Inicio
            <select
              value={c.startMode}
              onChange={(e) =>
                set({ ...c, startMode: e.target.value as Config["startMode"] })
              }
            >
              <option value="when_full">Al completar {c.capacity} cupos</option>
              <option value="scheduled">Fecha y hora programadas</option>
            </select>
          </label>
          {c.startMode === "scheduled" && (
            <label>
              Fecha y hora local
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          <label>
            Premio total en pesos (ARS)
            <input
              type="number"
              min={0}
              max={100000000}
              step={1}
              required
              disabled={c.botCount > 0}
              value={c.prize}
              onChange={(e) => set({ ...c, prize: Number(e.target.value) })}
            />
          </label>
          <label>
            Puntos
            <select
              value={c.target}
              onChange={(e) =>
                set({ ...c, target: Number(e.target.value) as 15 | 30 })
              }
            >
              <option value={15}>15 tantos</option>
              <option value={30}>30 tantos</option>
            </select>
          </label>
          <label>
            Reglas
            <select
              value={c.flor ? "yes" : "no"}
              onChange={(e) => set({ ...c, flor: e.target.value === "yes" })}
            >
              <option value="no">Sin flor</option>
              <option value="yes">Con flor</option>
            </select>
          </label>
          <label>
            Banner de cartas
            <select
              value={c.banner}
              onChange={(e) =>
                set({ ...c, banner: e.target.value as Config["banner"] })
              }
            >
              <option value="ancho">Ancho de espadas</option>
              <option value="envido">33 de envido</option>
            </select>
          </label>
        </div>
        <p id="bot-help">
          {c.botCount > 0
            ? `Simulación: ${c.botCount} bots y ${c.capacity - c.botCount} lugares para personas. Los bots entran al publicar y juegan automáticamente. Sin premios ni cambios de ranking.`
            : "Dejá 0 para un torneo normal. Agregá bots para probarlo con menos personas, o completá todos los cupos para una simulación automática."}
        </p>
        {c.botCount === 0 && (
          <p>
            {c.capacity} jugadores · Entrada gratuita · Eliminación directa ·
            70% al campeón y 30% al finalista. El premio se paga manualmente por
            fuera del sistema.
          </p>
        )}
        {c.startMode === "scheduled" && (
          <p>
            Si no confirman presencia los {c.capacity} jugadores a la hora
            prevista, queda pospuesto: se liberan las mesas y se conservan las
            inscripciones. Podés reprogramarlo o cancelarlo desde acá.
          </p>
        )}
        <div className="tournament-actions">
          <button className="primary" type="submit">
            Guardar borrador
          </button>
          <button type="button" onClick={onClose}>
            Cerrar formulario
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function TournamentAdmin({
  userId,
  onDenied,
}: {
  userId: string;
  onDenied: (status: 401 | 403) => void;
}) {
  const [items, setItems] = useState<TournamentSummary[]>([]),
    [detail, setDetail] = useState<TournamentDetail | null>(null),
    [editor, setEditor] = useState<{ id?: string; config: Config } | null>(
      null,
    );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [reference, setReference] = useState("");
  const lock = useRef(false);
  const selection = useRef<string | null>(null);
  const deniedRef = useRef(onDenied);
  deniedRef.current = onDenied;
  const fail = (e: unknown) => {
    setError(message(e));
    if (e instanceof ApiError && [401, 403].includes(e.status))
      deniedRef.current(e.status as 401 | 403);
  };
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await api<{ items: TournamentSummary[] }>(
          "/admin/tournaments",
        );
        if (live) setItems(r.items);
        const id = selection.current;
        if (id) {
          const d = await api<TournamentDetail>("/admin/tournaments/" + id);
          if (live && selection.current === id) setDetail(d);
        }
      } catch (e) {
        if (live) fail(e);
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [revision]);
  async function select(id: string) {
    selection.current = id;
    setDetail(null);
    setEditor(null);
    setReason("");
    setReference("");
    setDate("");
    setError("");
    try {
      const d = await api<TournamentDetail>("/admin/tournaments/" + id);
      if (selection.current === id) setDetail(d);
    } catch (e) {
      fail(e);
    }
  }
  async function mutate(path: string, body: unknown, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await tournamentMutation<TournamentDetail>(userId, path, body);
      selection.current = d.id;
      setDetail(d);
      setEditor(null);
      setNotice(success);
      setRevision((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const config = (d: TournamentDetail): Config => ({
    capacity: d.capacity,
    botCount: d.botCount,
    name: d.name,
    description: d.description,
    startMode: d.startMode,
    startsAt: d.startsAt,
    target: d.target,
    flor: d.flor,
    prize: d.prize,
    banner: d.banner,
  });
  const name = (id: string | null) =>
    detail?.entries.find((e) => e.userId === id)?.displayName ?? "Por definir";
  const pendingIntent = pendingTournamentIntent(userId);
  return (
    <main className="page tournament-admin">
      <header className="tournament-admin-heading">
        <div>
          <span className="eyebrow">LAS CARTAS DE LA CASA</span>
          <h1>Torneos</h1>
          <p>Creá una fecha o abrí un torneo que arranque al llenarse.</p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => setEditor({ config: { ...blank } })}
        >
          ＋ Crear torneo
        </button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setRevision((v) => v + 1)}>Actualizar</button>
        </div>
      )}
      {notice && (
        <p role="status" className="tournament-notice">
          {notice}
        </p>
      )}
      {pendingIntent && !busy && (
        <button
          onClick={() =>
            void mutate(
              pendingIntent.path,
              pendingIntent.body,
              "Operación pendiente recuperada.",
            )
          }
        >
          Reintentar operación pendiente
        </button>
      )}
      {editor && (
        <Editor
          key={editor.id ?? JSON.stringify(editor.config)}
          initial={editor.config}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={(c) =>
            void mutate(
              editor.id
                ? `/admin/tournaments/${editor.id}/edit`
                : "/admin/tournaments",
              c,
              "Borrador guardado. Revisalo antes de publicar.",
            )
          }
        />
      )}
      <div className="tournament-admin-layout">
        <section className="panel">
          <h2>Todos los torneos</h2>
          {loading ? (
            <p role="status">Cargando torneos…</p>
          ) : items.length === 0 ? (
            <p>Todavía no hay torneos. Creá el primero.</p>
          ) : (
            <div className="tournament-list">
              {items.map((t) => (
                <button
                  disabled={busy}
                  key={t.id}
                  aria-pressed={selection.current === t.id}
                  onClick={() => void select(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>
                    {tournamentStatus[t.status]} · {t.enrolled}/{t.capacity}
                  </span>
                  <small>{tournamentDate(t.startsAt, t.capacity)}</small>
                  <span>
                    {t.simulation
                      ? `Simulación · ${t.botCount} bots`
                      : `${pesos(t.prize)} en premios`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        {detail ? (
          <section className="panel tournament-management">
            <span className="eyebrow">{tournamentStatus[detail.status]}</span>
            <h2>{detail.name}</h2>
            <p>{detail.description}</p>
            <p>
              {tournamentDate(detail.startsAt, detail.capacity)} ·{" "}
              {detail.target} tantos · {detail.flor ? "Con flor" : "Sin flor"}
            </p>
            <p>
              {detail.simulation ? (
                `Simulación · ${detail.botCount} bots y ${detail.capacity - detail.botCount} personas · Sin premios ni ranking`
              ) : (
                <>
                  <strong>{pesos(detail.prize)}</strong> · Entrada gratis · Pago
                  manual
                </>
              )}
            </p>
            <p>
              {detail.entries.length}/{detail.capacity} inscriptos ·{" "}
              {
                detail.entries.filter((e) =>
                  ["checked_in", "playing"].includes(e.status),
                ).length
              }{" "}
              confirmados
            </p>
            <div className="tournament-actions">
              <button
                disabled={busy}
                onClick={() => {
                  const c = config(detail);
                  setEditor({
                    config: {
                      ...c,
                      name: c.name.slice(0, 70) + " (copia)",
                      startsAt:
                        c.startMode === "scheduled"
                          ? new Date(Date.now() + 86400000).toISOString()
                          : null,
                    },
                  });
                }}
              >
                Duplicar
              </button>
              {detail.status === "draft" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      setEditor({ id: detail.id, config: config(detail) })
                    }
                  >
                    Editar borrador
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/admin/tournaments/${detail.id}/publish`,
                        {},
                        "Torneo publicado.",
                      )
                    }
                  >
                    Publicar torneo
                  </button>
                </>
              )}
            </div>
            {detail.status === "postponed" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(
                    `/admin/tournaments/${detail.id}/reschedule`,
                    { startsAt: new Date(date).toISOString() },
                    "Nuevo horario publicado. Los jugadores deben volver a confirmar.",
                  );
                }}
              >
                <h3>Reprogramar</h3>
                <label>
                  Nuevo horario
                  <input
                    type="datetime-local"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Guardar nuevo horario</button>
              </form>
            )}
            {detail.games.some((g) => g.status === "review") && (
              <section>
                <h3>Cruces para resolver</h3>
                <label>
                  Motivo de la resolución
                  <textarea
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {detail.games
                  .filter((g) => g.status === "review")
                  .map((g) => (
                    <div className="tournament-review" key={g.id}>
                      <strong>
                        {roundName[g.round]} · {name(g.playerA)} vs{" "}
                        {name(g.playerB)}
                      </strong>
                      <p>
                        La partida terminó sin ganador. Seleccioná el
                        clasificado y documentá el motivo.
                      </p>
                      {[g.playerA, g.playerB].map((p) => (
                        <button
                          key={p}
                          disabled={busy || reason.trim().length < 5}
                          onClick={() =>
                            void mutate(
                              `/admin/tournaments/${detail.id}/resolve`,
                              { gameId: g.id, winnerId: p, reason },
                              "Resolución registrada y cuadro actualizado.",
                            )
                          }
                        >
                          Clasifica {name(p)}
                        </button>
                      ))}
                    </div>
                  ))}
              </section>
            )}
            {detail.prizes.length > 0 && (
              <section>
                <h3>Pagos de premios</h3>
                <p>
                  Registrá acá el pago después de realizarlo. Este botón no
                  transfiere dinero.
                </p>
                <label>
                  Referencia del comprobante
                  <input
                    maxLength={200}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                {detail.prizes.map((p) => (
                  <div className="tournament-payment" key={p.place}>
                    <span>
                      {p.place}.º {name(p.userId)} · {pesos(p.amount)}
                    </span>
                    {p.status === "paid" ? (
                      <strong>Pago registrado</strong>
                    ) : (
                      <button
                        disabled={busy || reference.trim().length < 3}
                        onClick={() =>
                          void mutate(
                            `/admin/tournaments/${detail.id}/pay`,
                            { place: p.place, reference },
                            "Pago manual registrado.",
                          )
                        }
                      >
                        Registrar pago realizado
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
            <details>
              <summary>Participantes y cuadro</summary>
              {detail.entries.map((e) => (
                <p key={e.userId}>
                  {e.displayName} ·{" "}
                  {
                    (
                      {
                        registered: "Inscripto",
                        checked_in: "Confirmado",
                        playing: "En juego",
                        eliminated: "Eliminado",
                        winner: "Campeón",
                        cancelled: "Cancelado",
                      } as Record<string, string>
                    )[e.status]
                  }
                </p>
              ))}
              {detail.games.map((g) => (
                <p key={g.id}>
                  {roundName[g.round]} · {name(g.playerA)} / {name(g.playerB)}
                  {g.winnerId ? " → " + name(g.winnerId) : ""}
                </p>
              ))}
            </details>
            {!["finished", "cancelled"].includes(detail.status) && (
              <details>
                <summary>Cancelar torneo</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate(
                      `/admin/tournaments/${detail.id}/cancel`,
                      { reason },
                      "Torneo cancelado. Se liberaron todas las mesas.",
                    );
                  }}
                >
                  <p>
                    Se cerrarán las partidas activas y se liberarán las plazas
                    de los participantes.
                  </p>
                  <label>
                    Motivo
                    <input
                      required
                      minLength={5}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Confirmar cancelación</button>
                </form>
              </details>
            )}
            <details>
              <summary>Historial de cambios</summary>
              {detail.audit?.map((a, i) => (
                <p key={i}>
                  {tournamentDate(a.createdAt)} ·{" "}
                  {(
                    {
                      created: "Borrador creado",
                      edited: "Configuración editada",
                      published: "Publicado",
                      join: "Inscripción",
                      withdraw: "Retiro",
                      "check-in": "Presencia confirmada",
                      started: "Iniciado",
                      finished: "Finalizado",
                      postponed: "Pospuesto",
                      rescheduled: "Reprogramado",
                      cancelled: "Cancelado",
                      resolved: "Cruce resuelto",
                      review_required: "Revisión requerida",
                      payment_recorded: "Pago registrado",
                    } as Record<string, string>
                  )[a.action] ?? a.action}
                  {typeof a.detail.reason === "string"
                    ? " · " + a.detail.reason
                    : ""}
                  {typeof a.detail.reference === "string"
                    ? " · " + a.detail.reference
                    : ""}
                </p>
              ))}
            </details>
          </section>
        ) : (
          <section className="panel empty-state">
            <h2>Armá la próxima fecha</h2>
            <p>
              Seleccioná un torneo para gestionar sus inscripciones, cruces y
              premios.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
