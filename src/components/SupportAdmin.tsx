import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./support-admin.css";

type Ticket = {
  id: string;
  subject: string;
  description: string;
  createdAt: string;
  resolution: string | null;
  resolvedAt: string | null;
  status: "open" | "resolved";
  requester: {
    displayName: string;
    username: string | null;
    email: string | null;
  };
  emailStatus: string | null;
  canRetryEmail: boolean;
};
type Page = { items: Ticket[]; hasMore: boolean };
type Denied = (status: 401 | 403) => void;
type Filter = "all" | Ticket["status"];
const endpoint = "/admin/support/tickets";
const pageSize = 20;
const date = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});
const emailLabels: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado por Resend",
  sent: "Enviado",
  delivered: "Entregado",
  delivery_delayed: "Entrega demorada",
  bounced: "Rebotó",
  complained: "Marcado como spam",
  failed: "Falló el envío",
  suppressed: "Bloqueado por Resend",
  unknown: "Envío sin confirmar",
  unavailable: "Envío sin configurar",
};

function report(
  error: unknown,
  onDenied: Denied,
  setError: (value: string) => void,
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

export function SupportAdmin({ onDenied }: { onDenied: Denied }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api<Page>(
      `${endpoint}?status=${filter}&limit=${pageSize}&offset=${offset}`,
    )
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((cause) => {
        if (active) report(cause, onDenied, setError);
      });
    return () => {
      active = false;
    };
  }, [filter, offset, refresh, onDenied]);

  function load(next: number, status = filter) {
    setPage(undefined);
    setError("");
    setOffset(next);
    setFilter(status);
    setRefresh((value) => value + 1);
  }

  function update(ticket: Ticket) {
    setPage(
      (current) =>
        current && {
          ...current,
          items: current.items.map((item) =>
            item.id === ticket.id ? ticket : item,
          ),
        },
    );
  }

  return (
    <main className="page support-admin">
      <h1>Ticketera</h1>
      <div className="support-admin-actions">
        <label>
          Estado del ticket
          <select
            value={filter}
            onChange={(event) => load(0, event.currentTarget.value as Filter)}
          >
            <option value="open">Abiertos</option>
            <option value="resolved">Resueltos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => load(0)}
          disabled={!page && !error}
        >
          Actualizar
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !page ? (
        <p role="status">Cargando tickets…</p>
      ) : (
        <>
          {!page.items.length && <p>No hay tickets en esta página.</p>}
          <div className="support-admin-list">
            {page.items.map((ticket) => (
              <TicketDetails
                key={ticket.id}
                ticket={ticket}
                onDenied={onDenied}
                onUpdate={update}
              />
            ))}
          </div>
          {(offset > 0 || page.hasMore) && (
            <div className="support-admin-actions support-admin-pagination">
              <button
                type="button"
                disabled={!offset}
                onClick={() => load(offset - pageSize)}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!page.hasMore}
                onClick={() => load(offset + pageSize)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function TicketDetails({
  ticket,
  onDenied,
  onUpdate,
}: {
  ticket: Ticket;
  onDenied: Denied;
  onUpdate: (ticket: Ticket) => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const locked = useRef(false);

  async function mutate(action: "resolve" | "retry-email", body: object) {
    if (locked.current) return;
    locked.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<Ticket>(
        `${endpoint}/${ticket.id}/${action}`,
        body,
      );
      onUpdate(updated);
      setNotice(
        action === "resolve"
          ? "Guardamos la resolución."
          : "Actualizamos el estado del correo.",
      );
    } catch (cause) {
      report(cause, onDenied, setError);
    } finally {
      locked.current = false;
      setWorking(false);
    }
  }

  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const resolution = String(fields.get("resolution") ?? "").trim();
    if (resolution) void mutate("resolve", { resolution });
    else setError("Escribí la respuesta antes de resolver el ticket.");
  }

  const { requester } = ticket;
  return (
    <details className="panel support-admin-card">
      <summary>
        <strong>{ticket.subject}</strong>
        <span className="muted">
          {ticket.status === "open" ? "Abierto" : "Resuelto"} ·{" "}
          {requester.username ?? requester.displayName} ·{" "}
          {date.format(new Date(ticket.createdAt))}
        </span>
      </summary>
      <div className="support-admin-content">
        {requester.email && <p className="muted">{requester.email}</p>}
        <p className="support-admin-text">{ticket.description}</p>
        {ticket.status === "open" ? (
          <form onSubmit={resolve}>
            <label>
              Respuesta al jugador
              <textarea
                name="resolution"
                rows={5}
                required
                maxLength={5000}
                readOnly={working}
              />
            </label>
            <button type="submit" className="primary" disabled={working}>
              {working ? "Guardando…" : "Resolver y notificar por email"}
            </button>
          </form>
        ) : (
          <div className="support-admin-resolution">
            <strong>Respuesta de soporte</strong>
            <p className="support-admin-text">{ticket.resolution}</p>
            <p>
              Correo ·{" "}
              {emailLabels[ticket.emailStatus ?? "pending"] ??
                "Estado desconocido"}
            </p>
            {ticket.canRetryEmail && (
              <button
                type="button"
                disabled={working}
                onClick={() => void mutate("retry-email", {})}
              >
                {working ? "Enviando…" : "Reintentar email"}
              </button>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>
    </details>
  );
}
