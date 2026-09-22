import { api, ApiError } from "./api";
export interface TournamentSummary {
  id: string;
  name: string;
  description: string;
  startMode: "scheduled" | "when_full";
  startsAt: string | null;
  status:
    | "draft"
    | "registration"
    | "running"
    | "postponed"
    | "finished"
    | "cancelled";
  target: 15 | 30;
  flor: boolean;
  prize: number;
  banner: "ancho" | "envido";
  enrolled: number;
  confirmed: number;
  capacity: 8 | 16;
  botCount: number;
  simulation: boolean;
}
export interface TournamentDetail extends TournamentSummary {
  entries: {
    userId: string;
    displayName: string;
    isBot: boolean;
    avatarId: string | null;
    status: string;
  }[];
  mine: { userId: string; status: string; tableNumber: number | null } | null;
  games: {
    id: string;
    round: number;
    position: number;
    playerA: string | null;
    playerB: string | null;
    winnerId: string | null;
    status: string;
    matchId: string | null;
    roomId: string | null;
  }[];
  prizes: { place: number; userId: string; amount: number; status: string }[];
  audit?: {
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }[];
  serverNow: number;
}
export const tournamentStatus: Record<string, string> = {
  draft: "Borrador",
  registration: "Inscripción abierta",
  running: "En juego",
  postponed: "A reprogramar",
  finished: "Finalizado",
  cancelled: "Cancelado",
};
export const roundName = ["", "Octavos", "Cuartos", "Semifinal", "Final"];
export const pesos = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
export const tournamentDate = (value: string | null, capacity: 8 | 16 = 16) =>
  value
    ? new Date(value).toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : `Empieza al completar ${capacity} cupos`;
// Persist only command data, never credentials. An uncertain response retries the same receipt.
export function pendingTournamentIntent(userId: string) {
  const raw = sessionStorage.getItem(`tournament-intent:${userId}`);
  return raw
    ? (JSON.parse(raw) as { path: string; body: unknown; key: string })
    : null;
}
export async function tournamentMutation<T>(
  userId: string,
  path: string,
  body: unknown,
): Promise<T> {
  const storage = `tournament-intent:${userId}`;
  const raw = sessionStorage.getItem(storage);
  const intent = raw
    ? (JSON.parse(raw) as { path: string; body: unknown; key: string })
    : { path, body, key: crypto.randomUUID() };
  if (
    intent.path !== path ||
    JSON.stringify(intent.body) !== JSON.stringify(body)
  )
    throw new Error(
      "Reintentá la operación pendiente antes de cambiar los datos.",
    );
  sessionStorage.setItem(storage, JSON.stringify(intent));
  try {
    const result = await api<T>(path, body, intent.key);
    sessionStorage.removeItem(storage);
    return result;
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0)
      sessionStorage.removeItem(storage);
    throw e;
  }
}
