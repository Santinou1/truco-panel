import { useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import "./fiat-transfers-admin.css";

type Kind = "deposit" | "withdrawal";
type Transfer = {
  id: string;
  kind: Kind;
  user: { id: string; displayName: string; username: string | null; email: string | null };
  status: string;
  createdAt: string;
  expiresAt: string | null;
  amountMinor: string;
  receivedMinor: string | null;
  settledMinor: string | null;
  pendingCreditMinor: string | null;
  netMinor: string | null;
  attempts: number | null;
  requestId: string;
  providerReference: string | null;
  companyId: string;
  environment: string | null;
};
type EventData =
  | { kind: "order" }
  | { kind: "deposit"; data: {
      providerTransactionId: string; grossMinor: string; netMinor: string; reviewReason: string | null;
    } }
  | { kind: "credit"; data: { amountMinor: string; providerTransactionId: string; coversCresiumFee?: boolean } }
  | { kind: "admin_credit"; data: { adminId: string; reason: string; previousReviewReason: string } }
  | { kind: "withdrawal_status"; data: { status: string } }
  | { kind: "provider"; data: {
      operation: string; outcome: string; httpStatus: number | null; providerTransactionId: string | null;
    } };
type AuditEvent = EventData & { id: string; occurredAt: string | null };
type TransferPage = { items: Transfer[]; hasMore: boolean };
type PendingCredit = { id: string; providerTransactionId: string; netMinor: string; creditMinor: string; reviewReason: string };
type DetailPage = { transfer: Transfer; events: AuditEvent[]; pendingCredits: PendingCredit[]; hasMore: boolean };
type DeniedHandler = (status: 401 | 403) => void;

const endpoint = "/admin/fiat-transfers";
const pageSize = 25;
const eventPageSize = 50;
const initialFilters = { search: "", kind: "all", status: "all", withErrors: false };
const kindLabel = { deposit: "Carga", withdrawal: "Retiro" };
const labels: Record<string, string> = {
  creating: "Preparando la carga",
  issuance_error: "CVU sin emitir",
  open: "Esperando transferencia",
  partial: "Carga parcial",
  expired: "Orden vencida",
  credited: "Acreditada",
  review: "En revisión",
  queued: "Retiro solicitado",
  creating_preview: "Preparando el retiro",
  preview: "Retiro preparado",
  requesting_signature: "Solicitando aprobación",
  awaiting_signature: "Pendiente de aprobación",
  processing: "En procesamiento",
  paid: "Transferido",
  failed: "Rechazado o fallido",
};
const depositStatuses = ["creating", "issuance_error", "open", "partial", "expired", "credited"];
const withdrawalStatuses = ["queued", "awaiting_signature", "processing", "paid", "failed"];
const operations: Record<string, string> = {
  create_order: "Emisión del CVU",
  lookup_order: "Consulta de la orden",
  lookup_cvu: "Consulta del CVU",
  reconcile_deposits: "Conciliación de cargas",
  review_origin: "Revisión del origen",
  webhook: "Notificación de carga",
  withdrawal_lookup_destination: "Verificación del destino",
  withdrawal_create_preview: "Preparación del retiro",
  withdrawal_request_signature: "Solicitud de aprobación",
  withdrawal_lookup_transaction: "Consulta del retiro",
  withdrawal_webhook: "Notificación de retiro",
};
const reviewReasons: Record<string, string> = {
  origin_unconfirmed: "No se confirmó la titularidad de la cuenta de origen",
  origin_changed: "La cuenta de origen difiere de la registrada",
  zero_net: "Transferencia con importe neto cero",
  unmatched_order: "La transferencia no coincide con la orden",
};
const outcomes: Record<string, string> = {
  ...reviewReasons,
  started: "Solicitud iniciada",
  response: "Respuesta recibida",
  received: "Respuesta recibida",
  network_error: "Error de conexión con Cresium",
  transport_error: "Error de conexión con Cresium",
  provider_error: "Respuesta de error de Cresium",
  credited: "Acreditación confirmada",
  duplicate: "Notificación o transacción ya procesada",
  mismatch: "Los datos difieren de la solicitud",
  ignored_event: "Notificación omitida",
  unchanged: "Sin cambio de estado",
  processing: labels.processing,
  paid: labels.paid,
  failed: labels.failed,
};
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const dates = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "medium",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

function pesos(value: string) {
  const centavos = BigInt(value);
  return currency.formatToParts(centavos / 100n)
    .map(part => part.type === "fraction" ? String(centavos % 100n).padStart(2, "0") : part.value)
    .join("");
}

function DateTime({ value }: { value: string }) {
  return <time dateTime={value}>{dates.format(new Date(value))}</time>;
}

function TransferStatus({ status }: { status: string }) {
  return <span className="transfer-status" data-status={status}>{labels[status] ?? status}</span>;
}

function useAuditPage<T>(path: string, onDenied: DeniedHandler, body?: unknown) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api<T>(path, body).then(result => {
      if (active) setData(result);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        onDenied(cause.status);
      } else {
        setError(message(cause));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [path, body, onDenied, revision]);
  return { data, error, loading, refresh: () => setRevision(value => value + 1) };
}

function AuditEventItem({ event }: { event: AuditEvent }) {
  let title: string;
  let description: string | undefined;
  let reference: string | null = null;
  switch (event.kind) {
    case "order":
      title = "Orden de carga iniciada";
      break;
    case "deposit":
      title = "Transferencia recibida";
      description = `Bruto ${pesos(event.data.grossMinor)} · Neto informado ${pesos(event.data.netMinor)}`;
      if (event.data.reviewReason) {
        description += ` · ${reviewReasons[event.data.reviewReason] ?? event.data.reviewReason}`;
      }
      reference = event.data.providerTransactionId;
      break;
    case "credit":
      title = event.data.coversCresiumFee ? "Comisión cubierta por La Pulpería" : "Acreditación en el saldo";
      description = pesos(event.data.amountMinor);
      reference = event.data.providerTransactionId;
      break;
    case "admin_credit":
      title = "Aprobación administrativa";
      description = `${event.data.reason} · Administrador ${event.data.adminId} · Revisión anterior: ${reviewReasons[event.data.previousReviewReason] ?? event.data.previousReviewReason}`;
      break;
    case "withdrawal_status":
      title = labels[event.data.status] ?? event.data.status;
      break;
    case "provider":
      title = operations[event.data.operation] ?? event.data.operation;
      description = outcomes[event.data.outcome] ?? event.data.outcome;
      if (event.data.httpStatus !== null) description += ` · HTTP ${event.data.httpStatus}`;
      reference = event.data.providerTransactionId;
      break;
  }
  return <li>
    <div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {reference && <small className="muted">Transacción Cresium {reference}</small>}
    </div>
    <span className="muted">{event.occurredAt ? <DateTime value={event.occurredAt} /> : "Fecha sin registrar"}</span>
  </li>;
}

function DepositCreditForm({ transfer, pending, onDenied, onCredited }: {
  transfer: Transfer; pending: PendingCredit; onDenied: DeniedHandler;
  onCredited: (notice: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  return <form className="transfer-credit" aria-label={`Acreditar movimiento ${pending.providerTransactionId}`}
    onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await api<{ creditedMinor: string; alreadyCredited: boolean }>(
          `${endpoint}/deposit/${transfer.id}/credit`,
          { depositId: pending.id, expectedNetMinor: pending.netMinor, expectedCreditMinor: pending.creditMinor, reason: reason.trim() },
        );
        onCredited(`${result.alreadyCredited ? "La transferencia ya estaba acreditada" : "Acreditación confirmada"}: ${pesos(result.creditedMinor)} en el saldo de ${transfer.user.displayName}.`);
      } catch (cause: unknown) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
        else setError(message(cause));
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    }}>
    <p><strong>Confirmar acreditación de {pesos(pending.creditMinor)}</strong> a {transfer.user.displayName}</p>
    {pending.creditMinor !== pending.netMinor && <p className="muted">Neto recibido {pesos(pending.netMinor)} + cobertura de comisión Cresium {pesos((BigInt(pending.creditMinor)-BigInt(pending.netMinor)).toString())}.</p>}
    <p className="muted">Transacción Cresium {pending.providerTransactionId} · {reviewReasons[pending.reviewReason] ?? pending.reviewReason}.</p>
    <p>Al confirmar, aprobás la revisión y el importe indicado se suma inmediatamente al saldo del jugador.</p>
    <label>Motivo de la acreditación
      <textarea required minLength={5} maxLength={500} rows={2} value={reason} disabled={busy}
        onChange={event => setReason(event.target.value)} placeholder="Indicá la comprobación realizada" />
    </label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="primary" disabled={busy || reason.trim().length < 5}>
      {busy ? "Acreditando…" : `Acreditar ${pesos(pending.creditMinor)}`}
    </button>
  </form>;
}

function TransferDetails({ selected, onDenied, onCredited }: {
  selected: Transfer; onDenied: DeniedHandler; onCredited: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState("");
  const { data, error, loading, refresh } = useAuditPage<DetailPage>(
    `${endpoint}/${selected.kind}/${selected.id}?offset=${offset}`, onDenied,
  );
  const transfer = data?.transfer ?? selected;
  const deposit = transfer.kind === "deposit";

  return <>
    <section className="panel transfer-panel" aria-labelledby="transfer-detail">
      <div className="transfer-heading">
        <div>
          <h2 id="transfer-detail">{kindLabel[transfer.kind]} de {transfer.user.displayName}</h2>
          <p className="muted">{[transfer.user.username && `@${transfer.user.username}`, transfer.user.email].filter(Boolean).join(" · ")}</p>
        </div>
        <TransferStatus status={transfer.status} />
      </div>
      <dl className="transfer-amounts">
        <div><dt>Solicitado</dt><dd>{pesos(transfer.amountMinor)}</dd></div>
        {transfer.receivedMinor !== null && <div><dt>Bruto recibido</dt><dd>{pesos(transfer.receivedMinor)}</dd></div>}
        <div><dt>{deposit ? "Total acreditado" : "Neto transferido"}</dt>
          <dd>{transfer.settledMinor !== null ? pesos(transfer.settledMinor) : "Sin confirmar"}</dd>
        </div>
        {transfer.netMinor !== null && transfer.settledMinor === null &&
          <div><dt>Neto previsto</dt><dd>{pesos(transfer.netMinor)}</dd></div>}
      </dl>
      {notice && <p role="status">{notice}</p>}
      {!loading && !error && data?.pendingCredits.map(pending => <DepositCreditForm key={pending.id}
        transfer={transfer} pending={pending} onDenied={onDenied} onCredited={result => {
          setNotice(result);
          setOffset(0);
          refresh();
          onCredited();
        }} />)}
      <dl className="transfer-references">
        <div><dt>Inicio</dt><dd><DateTime value={transfer.createdAt} /></dd></div>
        {transfer.expiresAt && <div><dt>Vencimiento</dt><dd><DateTime value={transfer.expiresAt} /></dd></div>}
        <div><dt>ID de la operación</dt><dd>{transfer.id}</dd></div>
        <div><dt>ID de usuario</dt><dd>{transfer.user.id}</dd></div>
        <div><dt>ID de la solicitud</dt><dd>{transfer.requestId}</dd></div>
        {transfer.providerReference && <div>
          <dt>{deposit ? "Orden Cresium" : "Transacción Cresium"}</dt><dd>{transfer.providerReference}</dd>
        </div>}
        <div><dt>Empresa Cresium</dt><dd>{transfer.companyId}</dd></div>
        {transfer.environment && <div><dt>Ambiente</dt><dd>{transfer.environment === "production" ? "Producción" : "Sandbox"}</dd></div>}
        {transfer.attempts !== null && <div><dt>Intentos de emitir CVU</dt><dd>{transfer.attempts}</dd></div>}
      </dl>
    </section>
    <section className="panel transfer-panel" aria-labelledby="transfer-history">
      <div className="transfer-heading">
        <h2 id="transfer-history">Historial de la operación</h2>
        <button type="button" className="secondary" onClick={refresh} disabled={loading}>Actualizar historial</button>
      </div>
      {loading ? <p role="status">Consultando historial…</p> : error ? <p role="alert">{error}</p> :
        data && <>
          {data.events.length ? <ol className="transfer-history">
            {data.events.map(event => <AuditEventItem key={`${event.kind}-${event.id}`} event={event} />)}
          </ol> : <p role="status">No hay más eventos registrados.</p>}
          <Pagination offset={offset} size={eventPageSize} hasMore={data.hasMore}
            onChange={setOffset} label="Páginas del historial" />
        </>}
    </section>
  </>;
}

function Pagination({ offset, size, hasMore, onChange, label }: {
  offset: number; size: number; hasMore: boolean; onChange: (next: number) => void; label: string;
}) {
  if (offset === 0 && !hasMore) return null;
  return <nav className="transfer-pagination" aria-label={label}>
    <button type="button" disabled={offset === 0} onClick={() => onChange(offset - size)}>Anterior</button>
    <span>Página {offset / size + 1}</span>
    <button type="button" disabled={!hasMore} onClick={() => onChange(offset + size)}>Siguiente</button>
  </nav>;
}

export function FiatTransfersAdmin({ onDenied }: { onDenied: DeniedHandler }) {
  const [draft, setDraft] = useState(initialFilters);
  const [query, setQuery] = useState({ ...initialFilters, limit: pageSize, offset: 0 });
  const [selected, setSelected] = useState<Transfer | null>(null);
  const { data, error, loading, refresh } = useAuditPage<TransferPage>(endpoint + "/search", onDenied, query);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [selected]);

  return <main className="page transfer-admin">
    <header>
      <h1 ref={heading} tabIndex={-1}>Auditoría de transferencias</h1>
    </header>
    {selected ? <>
      <div><button type="button" className="secondary" onClick={() => setSelected(null)}>← Volver a transferencias</button></div>
      <TransferDetails key={selected.id} selected={selected} onDenied={onDenied} onCredited={refresh} />
    </> : <section className="panel transfer-panel" aria-label="Consulta de transferencias">
      <form className="transfer-filters" onSubmit={event => {
        event.preventDefault();
        setQuery({ ...draft, search: draft.search.trim(), limit: pageSize, offset: 0 });
      }}>
        <label className="transfer-search">
          Usuario o referencia
          <input type="search" maxLength={254} placeholder="Nombre, usuario, correo o ID"
            value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} />
        </label>
        <label>
          <span id="transfer-kind-label">Tipo</span>
          <select aria-labelledby="transfer-kind-label" value={draft.kind}
            onChange={event => setDraft({ ...draft, kind: event.target.value, status: "all" })}>
            <option value="all">Cargas y retiros</option>
            <option value="deposit">Cargas</option>
            <option value="withdrawal">Retiros</option>
          </select>
        </label>
        <label>
          <span id="transfer-status-label">Estado</span>
          <select aria-labelledby="transfer-status-label" value={draft.status}
            onChange={event => setDraft({ ...draft, status: event.target.value })}>
            <option value="all">Todos los estados</option>
            <option value="review">{labels.review}</option>
            {draft.kind !== "withdrawal" && <optgroup label="Cargas">
              {depositStatuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}
            </optgroup>}
            {draft.kind !== "deposit" && <optgroup label="Retiros">
              {withdrawalStatuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}
            </optgroup>}
          </select>
        </label>
        <label className="transfer-errors">
          <input type="checkbox" checked={draft.withErrors}
            onChange={event => setDraft({ ...draft, withErrors: event.target.checked })} />
          Con errores registrados
        </label>
        <button type="submit" className="primary">Buscar</button>
      </form>
      {loading ? <p role="status">Consultando transferencias…</p> : error ? <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={refresh}>Reintentar</button>
      </div> : data && <>
        {data.items.length ? <>
          <p className="muted transfer-timezone">Horarios de Buenos Aires · Importes en ARS</p>
          <div className="transfer-table" role="region" tabIndex={0} aria-label="Resultados de transferencias">
            <table>
              <thead><tr>
                <th scope="col">Cuenta</th><th scope="col">Operación</th>
                <th scope="col">Solicitado</th><th scope="col">Neto aplicado</th>
                <th scope="col">Estado</th><th scope="col">Acciones</th>
              </tr></thead>
              <tbody>
                {data.items.map(transfer => <tr key={`${transfer.kind}-${transfer.id}`}>
                  <td><strong>{transfer.user.displayName}</strong>
                    {transfer.user.username && <small>@{transfer.user.username}</small>}
                    {transfer.user.email && <small>{transfer.user.email}</small>}
                  </td>
                  <td>{kindLabel[transfer.kind]}<small><DateTime value={transfer.createdAt} /></small></td>
                  <td>{pesos(transfer.amountMinor)}</td>
                  <td>{transfer.settledMinor !== null ? pesos(transfer.settledMinor) : "—"}</td>
                  <td><TransferStatus status={transfer.status} /></td>
                  <td><div className="transfer-actions"><button type="button" className="secondary" onClick={() => setSelected(transfer)}
                    aria-label={`Ver detalle de ${kindLabel[transfer.kind].toLowerCase()} de ${transfer.user.displayName}, ${pesos(transfer.amountMinor)}, ${dates.format(new Date(transfer.createdAt))}`}>
                    Ver detalle
                  </button>
                    {transfer.kind === "deposit" && BigInt(transfer.pendingCreditMinor ?? "0") > 0n &&
                      <button type="button" className="primary" onClick={() => setSelected(transfer)}
                        aria-label={`Acreditar carga de ${transfer.user.displayName}`}>
                        Acreditar
                      </button>}
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </> : <p role="status">No hay transferencias para esta búsqueda.</p>}
        <Pagination offset={query.offset} size={pageSize} hasMore={data.hasMore}
          onChange={offset => setQuery({ ...query, offset })} label="Páginas de transferencias" />
      </>}
    </section>}
  </main>;
}
