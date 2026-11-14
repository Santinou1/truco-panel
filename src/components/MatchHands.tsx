import { asset } from "../catalog";

type Team = 0 | 1;
type Card = { id: string; rank: number; suit: "espadas" | "bastos" | "oros" | "copas" };
type Event =
  | { type: "call"; player: number; call: string }
  | { type: "response"; player: number; response: "accept" | "decline"; call: string }
  | { type: "flor_answered"; player: number; call: string }
  | { type: "player_folded" | "decision_timeout"; player: number }
  | { type: "points"; player: Team; amount: number; source: string }
  | { type: "tanto_result"; kind: "envido" | "flor"; values: (number | null)[] | null; winner: number; tie: boolean; reason: "accepted" | "declined" | "single" }
  | { type: "match_finished"; reason: string; loser?: number }
  | { type: "card_played" | "match_cancelled" | "hand_started" | "hand_ended" | "trick_ended" | "showdown" | "bet_accepted" };

export type AuditedHand = {
  number: number;
  tricks: { plays: { player: number; card: Card }[]; winner?: Team | null; winningPlayers: number[] }[];
  scores: [number, number];
  winner: Team | null;
  finishReason: string | null;
  timeline: { version: number; at: string; trick: number; events: Event[] }[];
};
type Player = { seat: number; team: Team; displayName: string };

const trickNames = ["Primera", "Segunda", "Tercera"];
const labels: Record<string, string> = {
  truco: "Truco",
  retruco: "Retruco",
  vale_cuatro: "Vale cuatro",
  envido: "Envido",
  real_envido: "Real envido",
  falta_envido: "Falta envido",
  flor: "Flor",
  contraflor: "Contraflor",
  contraflor_al_resto: "Contraflor al resto",
  tricks: "Bazas",
  fold: "Irse al mazo",
  truco_declined: "Truco rechazado",
  envido_declined: "Envido rechazado",
  flor_declined: "Flor rechazada",
  envido_not_played: "Envido sin jugar",
};
const endings: Record<string, string> = {
  points: "Partida definida por puntos",
  resign: "Abandono",
  disconnect_timeout: "Desconexión",
  both_disconnected: "Partida cancelada",
};
const responses = { accept: "Quiero", decline: "No quiero" };
const cardName = (card: Card) => card.rank + " de " + card.suit;
const started = (hand: AuditedHand) =>
  hand.timeline[0]?.events.some(event => event.type === "hand_started");
const eventTime = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23",
});

function eventText(event: Event, player: (seat: number) => string, team: (team: Team) => string) {
  switch (event.type) {
    case "call":
      return `${player(event.player)} cantó ${labels[event.call] ?? event.call}.`;
    case "response":
      return `${player(event.player)} respondió «${responses[event.response]}» a ${labels[event.call] ?? event.call}.`;
    case "flor_answered":
      return `${player(event.player)} respondió «Flor» a ${labels[event.call] ?? event.call}.`;
    case "player_folded":
      return `${player(event.player)} se fue al mazo.`;
    case "decision_timeout":
      return `El servidor resolvió el turno de ${player(event.player)} al vencer el reloj.`;
    case "points":
      return `${team(event.player)} sumó ${event.amount} ${event.amount === 1 ? "punto" : "puntos"} · ${labels[event.source] ?? event.source}.`;
    case "tanto_result": {
      if (event.reason === "declined") return null;
      const values = event.values?.flatMap((value, seat) => value === null ? [] : [`${player(seat)} ${value}`]);
      const result = `${labels[event.kind]} para ${player(event.winner)}${event.tie ? " por orden de mano" : ""}.`;
      return values?.length ? `${result} ${values.join(" · ")}` : result;
    }
    case "match_finished":
      if (event.reason === "resign" && event.loser !== undefined) return `${player(event.loser)} abandonó la partida.`;
      if (event.reason === "disconnect_timeout" && event.loser !== undefined) return `${player(event.loser)} agotó el plazo de reconexión.`;
      return endings[event.reason] ?? "Partida finalizada";
    case "match_cancelled":
      return "Partida cancelada.";
    default:
      return null;
  }
}

export function MatchHands({ hands, players }: { hands: AuditedHand[]; players: Player[] }) {
  const player = (seat: number) => players.find(p => p.seat === seat)?.displayName ?? `Asiento ${seat + 1}`;
  const team = (side: Team) => players.filter(p => p.team === side).map(p => p.displayName).join(" y ");
  const partial = hands.some((hand, index) => hand.number !== index + 1 || !started(hand));
  return (
    <section className="ranking-admin-hands" aria-labelledby="ranking-hands-title">
      <h2 id="ranking-hands-title">Manos de la partida</h2>
      {!hands.length && <p>Esta partida no tiene manos auditadas.</p>}
      {partial && <p>Historial parcial. El registro comenzó con la partida en curso.</p>}
      {hands.map(hand => (
        <details className="panel ranking-admin-hand" name="ranking-match-hands" key={hand.number}>
          <summary>
            <span className="ranking-admin-hand-title">
              <strong>Mano {hand.number}</strong>
              <span>{hand.winner === null
                ? endings[hand.finishReason ?? ""] ?? "Sin ganador de mano"
                : `Ganó ${team(hand.winner)}`}</span>
            </span>
            <span className="ranking-admin-hand-score" aria-label="Marcador al cierre de la mano">
              {hand.scores.join("–")}
            </span>
          </summary>
          <div className="ranking-admin-hand-body">
            {trickNames.map((name, index) => {
              const trick = hand.tricks[index];
              const events = hand.timeline
                .filter(step => step.trick === index + 1)
                .flatMap(step => step.events.flatMap((event, eventIndex) => {
                  const description = eventText(event, player, team);
                  return description ? [{
                    key: `${step.version}-${eventIndex}`, at: step.at, description,
                  }] : [];
                }));
              return (
                <section className="ranking-admin-trick" key={name} aria-label={name}>
                  <h3>{name}</h3>
                  {trick?.plays.length ? (
                    <ol className="ranking-admin-plays" aria-label="Cartas en orden de juego">
                      {trick.plays.map(({ player: seat, card }) => (
                        <li key={card.id}>
                          <img
                            src={asset(`cartas/${card.suit}/${card.rank}.png`)}
                            alt={cardName(card)}
                            width={288}
                            height={464}
                            loading="lazy"
                          />
                          <span>{player(seat)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p>Sin cartas jugadas</p>}
                  {trick?.winner === null && <p className="ranking-admin-trick-result">Parda</p>}
                  {trick?.winningPlayers.length ? (
                    <p className="ranking-admin-trick-result">Ganó {trick.winningPlayers.map(player).join(" y ")}</p>
                  ) : null}
                  {trick?.plays.length && trick.winner === undefined ? <p>Baza inconclusa</p> : null}
                  {events.length > 0 && (
                    <ol className="ranking-admin-hand-timeline" aria-label="Cantos y otros eventos">
                      {events.map(({ key, at, description }) => (
                        <li key={key}>
                          <time dateTime={at}>{eventTime.format(new Date(at))}</time>
                          <span>{description}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        </details>
      ))}
    </section>
  );
}
