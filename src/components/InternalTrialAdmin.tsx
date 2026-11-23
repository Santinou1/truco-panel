import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import { catalog } from "../catalog";
import "./internal-trial-admin.css";

type Identity = { slot: number; name: string; avatarId: string };
type Profile = Identity & {
  available: number; reserved: number; net: string; played: number; won: number; lost: number; pointsToday: number;
};
type Options = { enabled: boolean; autoOpen: boolean; autoFill: boolean; autoPair: boolean };
type Status = Options & {
  version: number; entryFees: number[]; botWaitSeconds: number; humanWaitSeconds: number; invites: string[]; profiles: Profile[];
};
type Draft = Options & {
  version: number; fees: string; botWait: string; humanWait: string; emails: string; profiles: Identity[];
};
const endpoint = "/admin/internal-trial";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const flags: [keyof Options, string][] = [
  ["enabled", "Activar la prueba interna"],
  ["autoOpen", "Mantener una mesa de perfiles internos disponible"],
  ["autoFill", "Completar mesas de participantes"],
  ["autoPair", "Permitir partidas entre perfiles internos"],
];
function edit(status: Status): Draft {
  return {
    version: status.version, enabled: status.enabled, autoOpen: status.autoOpen, autoFill: status.autoFill,
    autoPair: status.autoPair, fees: status.entryFees.join(", "), botWait: String(status.botWaitSeconds),
    humanWait: String(status.humanWaitSeconds), emails: status.invites.join("\n"),
    profiles: status.profiles.map(({slot, name, avatarId}) => ({slot, name, avatarId})),
  };
}

export function InternalTrialAdmin({ onDenied }: { onDenied: (status: 401 | 403) => void }) {
  const [status, setStatus] = useState<Status>();
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    void api<Status>(endpoint).then(data => {
      if (active) { setStatus(data); setDraft(edit(data)); }
    }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
      else setError(message(cause));
    });
    return () => { active = false; };
  }, [onDenied]);

  async function request(body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await api<Status>(endpoint, body);
      setStatus(data);
      if (body || !draft) setDraft(edit(data));
      setNotice(body ? "Configuración guardada." : "Resultados actualizados.");
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) onDenied(cause.status);
      else setError(message(cause));
    } finally {
      lock.current = false; setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const tokens = draft.fees.split(",").map(value => value.trim());
    const entryFees = tokens.map(Number);
    if (tokens.some(token => !/^\d+$/.test(token)) || entryFees.length < 2 || entryFees.length > 32 ||
      new Set(entryFees).size !== entryFees.length || entryFees.some(value => value < 1 || value > 100_000)) {
      setError("Ingresá entre 2 y 32 importes enteros distintos, de $1 a $100.000, separados por comas."); return;
    }
    const invites = draft.emails.split(/[\s,;]+/u).filter(Boolean);
    void request({
      expectedVersion: draft.version, enabled: draft.enabled, autoOpen: draft.autoOpen, autoFill: draft.autoFill,
      autoPair: draft.autoPair, entryFees, botWaitSeconds: Number(draft.botWait),
      humanWaitSeconds: Number(draft.humanWait), invites, profiles: draft.profiles,
    });
  }
  function changeProfile(slot: number, change: Partial<Pick<Identity, "name" | "avatarId">>) {
    setDraft(current => current && ({ ...current, profiles: current.profiles.map(p => p.slot === slot ? {...p, ...change} : p) }));
  }

  return <main className="page internal-trial-admin">
    <h1>Prueba interna</h1>
    <p>Mesas cerradas con saldo simulado. Cada perfil interno empieza con $100.000.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy || (!status && !error)} onClick={() => void request()}>Actualizar resultados</button>
    {!status && !error && <p role="status">Consultando la prueba…</p>}
    {status && draft && <>
      <section className="panel" aria-labelledby="trial-results">
        <h2 id="trial-results">Saldo y resultados por perfil</h2>
        <div className="trial-table-scroll" role="region" aria-label="Resultados de los diez perfiles" tabIndex={0}>
          <table>
            <thead><tr>{["Perfil", "Disponible", "En juego", "Resultado neto", "Partidas", "Ganadas", "Perdidas", "Puntos de hoy"].map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
            <tbody>{status.profiles.map(p => <tr key={p.slot}>
              <th scope="row">{p.name}</th><td>{money.format(p.available)}</td><td>{money.format(p.reserved)}</td>
              <td>{money.format(BigInt(p.net))}</td><td>{p.played}</td><td>{p.won}</td><td>{p.lost}</td><td>{p.pointsToday}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <form onSubmit={save} className="panel">
        <fieldset disabled={busy}>
          <legend>Actividad</legend>
          {flags.map(([flag, text]) => <label className="trial-toggle" key={flag}>
            <input type="checkbox" checked={draft[flag]} onChange={e => setDraft({...draft, [flag]: e.target.checked})} />{text}
          </label>)}
          <label>Entradas en pesos simulados, separadas por comas
            <input required value={draft.fees} onChange={e => setDraft({...draft, fees: e.target.value})}/>
          </label>
          <div className="trial-fields">
            <label>Espera en mesa de perfil interno (segundos)
              <input type="number" required min={60} max={3600} step={1} value={draft.botWait} onChange={e => setDraft({...draft, botWait: e.target.value})}/>
            </label>
            <label>Espera en mesa de participante (segundos)
              <input type="number" required min={120} max={3600} step={1} value={draft.humanWait} onChange={e => setDraft({...draft, humanWait: e.target.value})}/>
            </label>
          </div>
          <label>Correos invitados, uno por línea
            <textarea rows={4} value={draft.emails} onChange={e => setDraft({...draft, emails: e.target.value})}/>
          </label>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Perfiles internos</legend>
          {draft.profiles.map(p => <div className="trial-fields" key={p.slot}>
            <label>Nombre del perfil {p.slot}
              <input required maxLength={60} value={p.name} onChange={e => changeProfile(p.slot, {name: e.target.value})}/>
            </label>
            <label>Avatar del perfil {p.slot}
              <select value={p.avatarId} onChange={e => changeProfile(p.slot, {avatarId: e.target.value})}>
                {catalog.avatars.map(avatar => <option key={avatar.id} value={avatar.id}>{avatar.label}</option>)}
              </select>
            </label>
          </div>)}
        </fieldset>
        {status.version !== draft.version && <p role="alert">
          Otra sesión guardó cambios. <button type="button" onClick={() => {setDraft(edit(status)); setError(""); setNotice("");}}>Cargar configuración actual</button>
        </p>}
        <button type="submit" className="primary" disabled={busy || status.version !== draft.version}>Guardar configuración</button>
      </form>
    </>}
  </main>;
}
