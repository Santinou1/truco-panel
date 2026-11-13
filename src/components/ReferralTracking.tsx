import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";

type Overview = {
  codesEnabled: number;
  linkedAccounts: number;
  rewardedAccounts: number;
  matchGoal: number;
  referredBonus: number;
  referrerBonus: number;
  avatarGoal: number;
};
type CodeOwner = {
  code: string;
  ownerName: string;
  ownerUsername: string | null;
  ownerEmail: string | null;
};
type Code = CodeOwner & {
  enabledAt: string;
  linkedCount: number;
  rewardedCount: number;
  avatarRequestedAt: string | null;
  avatarDeliveredAt: string | null;
  avatarId: string | null;
};
type Link = CodeOwner & {
  referredId: string;
  referredName: string;
  referredUsername: string | null;
  referredEmail: string | null;
  linkedAt: string;
  gamesPlayed: number;
  remainingGames: number;
  rewardedAt: string | null;
};
type Page<T> = { items: T[]; hasMore: boolean };
type View = "codes" | "links";
type Filter = {
  view: View;
  search: string;
  status: string;
  code?: string;
  page: number;
};
type Result =
  | { view: "codes"; data: Page<Code> }
  | { view: "links"; data: Page<Link> };
const pageSize = 20;
const date = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});
const formatDate = (value: string) => date.format(new Date(value));
const options = {
  codes: [
    ["all", "Todos"],
    ["with_links", "Con referidos"],
    ["without_links", "Sin referidos"],
  ],
  links: [
    ["all", "Todos"],
    ["not_started", "Sin partidas"],
    ["in_progress", "En progreso"],
    ["rewarded", "Premio acreditado"],
  ],
};

function AccountLabel({
  name,
  username,
  email,
}: {
  name: string;
  username: string | null;
  email: string | null;
}) {
  return (
    <>
      <strong>{name}</strong>
      {username && username !== name && <small>@{username}</small>}
      {email && email !== name && <small>{email}</small>}
    </>
  );
}

function avatarStatus(code: Code, goal: number) {
  if (code.avatarDeliveredAt) return `Entregado · ${code.avatarId}`;
  if (code.avatarRequestedAt) return "Solicitado";
  if (code.rewardedCount >= goal) return "Disponible para solicitar";
  return `${code.rewardedCount}/${goal} para el avatar`;
}

export function ReferralTracking({
  revision,
  onFailure,
}: {
  revision: number;
  onFailure: (cause: unknown, report: (text: string) => void) => void;
}) {
  const [filter, setFilter] = useState<Filter>({
    view: "codes",
    search: "",
    status: "all",
    page: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [overview, setOverview] = useState<Overview>();
  const [result, setResult] = useState<Result>();
  const [overviewError, setOverviewError] = useState("");
  const [resultError, setResultError] = useState("");
  const [retry, setRetry] = useState(0);
  const { view, code, page } = filter;

  useEffect(() => {
    let active = true;
    void api<Overview>("/admin/referrals/overview")
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((cause) => {
        if (active) onFailure(cause, setOverviewError);
      });
    return () => {
      active = false;
    };
  }, [revision, retry, onFailure]);

  useEffect(() => {
    let active = true;
    const body = {
      search: filter.search,
      status: filter.status,
      limit: pageSize,
      offset: page * pageSize,
    };
    const request =
      view === "codes"
        ? api<Page<Code>>("/admin/referrals/codes/search", body).then(
            (data) => ({ view, data }),
          )
        : api<Page<Link>>("/admin/referrals/links/search", {
            ...body,
            code,
          }).then((data) => ({ view, data }));
    void request
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((cause) => {
        if (active) onFailure(cause, setResultError);
      });
    return () => {
      active = false;
    };
  }, [filter, view, code, page, revision, retry, onFailure]);

  const load = (next: Filter) => {
    setResult(undefined);
    setResultError("");
    setFilter(next);
  };
  const openView = (nextView: View, nextCode?: string) => {
    setSearch("");
    setStatus("all");
    load({
      view: nextView,
      code: nextCode,
      search: "",
      status: "all",
      page: 0,
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    load({ ...filter, search: search.trim(), status, page: 0 });
  };
  const refresh = () => {
    setOverviewError("");
    setResultError("");
    setResult(undefined);
    setRetry((value) => value + 1);
  };
  return (
    <section
      className="panel referrals-admin-panel"
      aria-labelledby="referral-tracking"
    >
      <h2 id="referral-tracking">Seguimiento de referidos</h2>
      {overview && (
        <dl className="referrals-tracking-totals">
          <div>
            <dt>Códigos habilitados</dt>
            <dd>{overview.codesEnabled}</dd>
          </div>
          <div>
            <dt>Usuarios vinculados</dt>
            <dd>{overview.linkedAccounts}</dd>
          </div>
          <div>
            <dt>Premios acreditados</dt>
            <dd>{overview.rewardedAccounts}</dd>
          </div>
        </dl>
      )}
      {!overview && !overviewError && <p role="status">Cargando totales…</p>}
      {overviewError && <p role="alert">{overviewError}</p>}
      {overview && (
        <p>
          Al completar {overview.matchGoal} partidas que cuentan para la meta se
          acreditan {overview.referredBonus} fichas al referido y{" "}
          {overview.referrerBonus} al dueño del código.
        </p>
      )}
      <div
        className="referrals-admin-actions"
        role="group"
        aria-label="Vista de seguimiento"
      >
        <button
          type="button"
          className={view === "codes" ? "primary" : "secondary"}
          aria-pressed={view === "codes"}
          onClick={() => openView("codes")}
        >
          Códigos propios
        </button>
        <button
          type="button"
          className={view === "links" ? "primary" : "secondary"}
          aria-pressed={view === "links"}
          onClick={() => openView("links")}
        >
          Usuarios referidos
        </button>
        <button type="button" className="secondary" onClick={refresh}>
          Actualizar
        </button>
      </div>
      {code && (
        <div className="referrals-admin-actions">
          <strong className="referrals-admin-code">Código {code}</strong>
          <button
            type="button"
            className="secondary"
            onClick={() => load({ ...filter, code: undefined, page: 0 })}
          >
            Quitar filtro de código
          </button>
        </div>
      )}
      <form className="referrals-tracking-filters" onSubmit={submit}>
        <label>
          Buscar en seguimiento
          <input
            value={search}
            maxLength={254}
            placeholder="Código, nombre, correo o ID"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span id="referral-tracking-status">Estado</span>
          <select
            aria-labelledby="referral-tracking-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {options[view].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          Aplicar filtros
        </button>
      </form>
      {resultError && <p role="alert">{resultError}</p>}
      {!result && !resultError && <p role="status">Cargando seguimiento…</p>}
      {result?.data.items.length === 0 && (
        <p role="status">No hay resultados para estos filtros.</p>
      )}
      {overview && result?.view === "codes" && result.data.items.length > 0 && (
        <div
          className="referrals-tracking-table"
          role="region"
          aria-label="Códigos propios"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Dueño</th>
                <th scope="col">Referidos</th>
                <th scope="col">Avatar</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((item) => (
                <tr key={item.code}>
                  <th scope="row">
                    <b className="referrals-admin-code">{item.code}</b>
                    <small>{formatDate(item.enabledAt)}</small>
                  </th>
                  <td>
                    <AccountLabel
                      name={item.ownerName}
                      username={item.ownerUsername}
                      email={item.ownerEmail}
                    />
                  </td>
                  <td>
                    <strong>{item.linkedCount} vinculados</strong>
                    <small>{item.rewardedCount} con premio</small>
                  </td>
                  <td>{avatarStatus(item, overview.avatarGoal)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Ver referidos del código ${item.code}`}
                      onClick={() => openView("links", item.code)}
                    >
                      Ver referidos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {overview && result?.view === "links" && result.data.items.length > 0 && (
        <div
          className="referrals-tracking-table"
          role="region"
          aria-label="Usuarios referidos"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Referido</th>
                <th scope="col">Lo invitó</th>
                <th scope="col">Partidas</th>
                <th scope="col">Premio</th>
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((item) => (
                <tr key={item.referredId}>
                  <th scope="row">
                    <AccountLabel
                      name={item.referredName}
                      username={item.referredUsername}
                      email={item.referredEmail}
                    />
                    <small>Vinculado el {formatDate(item.linkedAt)}</small>
                  </th>
                  <td>
                    <AccountLabel
                      name={item.ownerName}
                      username={item.ownerUsername}
                      email={item.ownerEmail}
                    />
                    <small className="referrals-admin-code">
                      Código {item.code}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {item.gamesPlayed}/{overview.matchGoal} partidas
                    </strong>
                    <progress
                      value={item.gamesPlayed}
                      max={overview.matchGoal}
                      aria-label={`Partidas de ${item.referredName}`}
                    />
                    <small>
                      {item.remainingGames === 0
                        ? "Meta completada"
                        : item.remainingGames === 1
                          ? "Falta 1 partida"
                          : `Faltan ${item.remainingGames} partidas`}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {item.rewardedAt
                        ? "Acreditado"
                        : item.gamesPlayed === 0
                          ? "Sin partidas"
                          : "En progreso"}
                    </strong>
                    {item.rewardedAt && (
                      <small>{formatDate(item.rewardedAt)}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 0 || result?.data.hasMore) && (
        <div className="referrals-admin-actions">
          <button
            className="secondary"
            type="button"
            disabled={page === 0}
            onClick={() => load({ ...filter, page: page - 1 })}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            className="secondary"
            type="button"
            disabled={!result?.data.hasMore}
            onClick={() => load({ ...filter, page: page + 1 })}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
