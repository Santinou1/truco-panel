import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, message } from "../api";
import "./referrals-admin.css";

type Account = { id: string; displayName: string; email: string; code: string | null };
type AvatarRequest = { ownerId: string; displayName: string; email: string; requestedAt: string; deliveredAt: string | null; avatarId: string | null };
type Page<T> = { items: T[]; hasMore: boolean };
type AvatarOption = {id: string; label: string; unlockMethod: string};
const limit = 20;

export function ReferralsAdmin({ onDenied }: { onDenied: (status: 401 | 403) => void }) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Page<Account>>();
  const [requestPage, setRequestPage] = useState(0);
  const [requests, setRequests] = useState<Page<AvatarRequest>>();
  const [options, setOptions] = useState<AvatarOption[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState("");
  const [accountError, setAccountError] = useState("");
  const [requestsError, setRequestsError] = useState("");
  const [notice, setNotice] = useState("");
  const failure = useCallback((cause: unknown, report: (text:string)=>void) => {
    if (cause instanceof ApiError && (cause.status===401 || cause.status===403)) onDenied(cause.status);
    else report(message(cause));
  }, [onDenied]);

  useEffect(() => {
    let live = true;
    void Promise.all([
      api<Page<AvatarRequest>>(`/admin/referrals/avatars?limit=${limit}&offset=${requestPage*limit}`),
      api<{avatars:AvatarOption[]}>("/catalog"),
    ]).then(([data,catalog])=>{
      if (!live) return;
      setRequests(data);
      setOptions(catalog.avatars.filter(avatar=>avatar.unlockMethod==="referral"));
    }).catch(cause=>{if(live)failure(cause,setRequestsError);});
    return ()=>{live=false;};
  }, [requestPage, refresh, failure]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setAccountError("");
    setNotice("");
    setAccounts(undefined);
    try { setAccounts(await api<Page<Account>>("/admin/referrals/lookup",{account:query.trim()})); }
    catch (cause) { failure(cause,setAccountError); }
    finally { setSearching(false); }
  };

  const assign = async (userId: string) => {
    setSaving(userId);
    setAccountError("");
    setNotice("");
    try {
      const {code} = await api<{code:string}>("/admin/referrals/code",{userId});
      setAccounts(current=>current && {...current,items:current.items.map(account=>account.id===userId?{...account,code}:account)});
      setNotice(`Código ${code} asignado a la cuenta.`);
    } catch(cause) { failure(cause,setAccountError); }
    finally { setSaving(""); }
  };

  const deliver = async (request: AvatarRequest) => {
    const avatarId = selection[request.ownerId];
    if (!avatarId) return;
    setSaving(request.ownerId);
    setRequestsError("");
    setNotice("");
    try {
      await api("/admin/referrals/avatars/deliver",{userId:request.ownerId,avatarId});
      setNotice(`Avatar acreditado a ${request.displayName}.`);
      setRefresh(n=>n+1);
    } catch(cause) { failure(cause,setRequestsError); }
    finally { setSaving(""); }
  };

  const pageTo = (page:number) => {
    setRequests(undefined);
    setRequestsError("");
    setRequestPage(page);
  };
  return (
    <main className="page referrals-admin">
      <header>
        <span className="eyebrow">COMUNIDAD</span>
        <h1>Referidos</h1>
        <p>Asigná códigos personales y entregá los avatares ganados por invitación.</p>
      </header>
      {notice && <p className="panel referrals-admin-notice" role="status">{notice}</p>}
      <section className="panel referrals-admin-panel" aria-labelledby="referral-code-admin">
        <h2 id="referral-code-admin">Asignar un código</h2>
        <p>Buscá una cuenta verificada. El código de cuatro dígitos queda asociado a la cuenta.</p>
        <form onSubmit={e=>void search(e)}>
          <label htmlFor="referral-account">Usuario, correo o ID exacto</label>
          <div className="referrals-admin-actions">
            <input id="referral-account" required maxLength={254} value={query} onChange={e=>setQuery(e.target.value)} />
            <button className="primary" disabled={searching || !!saving || !query.trim()}>{searching?"Buscando…":"Buscar cuenta"}</button>
          </div>
        </form>
        {accountError && <p role="alert">{accountError}</p>}
        {accounts && (accounts.items.length===0 ? <p role="status">No encontramos una cuenta verificada.</p> :
          <ul>{accounts.items.map(account=>(
            <li key={account.id} className="referrals-admin-row">
              <div><strong>{account.displayName}</strong><small>{account.email}</small><small>{account.id}</small></div>
              {account.code ? <b className="referrals-admin-code">Código: {account.code}</b> :
                <button className="secondary" disabled={!!saving || searching} type="button" onClick={()=>void assign(account.id)}>
                  {saving===account.id?"Asignando…":"Generar y asignar"}
                </button>}
            </li>
          ))}</ul>)}
        {accounts?.hasMore && <p>Hay más coincidencias. Buscá por ID para seleccionar la cuenta exacta.</p>}
      </section>
      <section className="panel referrals-admin-panel" aria-labelledby="referral-avatar-admin">
        <h2 id="referral-avatar-admin">Avatares personalizados</h2>
        <p>Cuando un jugador completa la meta de diez amigos, puede solicitar su personaje con ocho gestos.</p>
        {requestsError && <div role="alert"><p>{requestsError}</p><button className="secondary" onClick={()=>{setRequestsError("");setRefresh(n=>n+1);}}>Reintentar</button></div>}
        {!requests && !requestsError && <p role="status">Cargando solicitudes…</p>}
        {requests && (requests.items.length===0 ? <p>No hay solicitudes en esta página.</p> :
          <ul>{requests.items.map(request=>(
            <li key={request.ownerId} className="referrals-admin-row">
              <div><strong>{request.displayName}</strong><small>{request.email}</small></div>
              {request.deliveredAt ? <span>Entregado · {request.avatarId}</span> :
                options.length===0 ? <small>Pendiente de publicar el personaje en el juego</small> :
                <div className="referrals-admin-actions">
                  <select aria-label={`Avatar para ${request.displayName}`} value={selection[request.ownerId]??""}
                    onChange={e=>setSelection(current=>({...current,[request.ownerId]:e.target.value}))}>
                    <option value="">Elegir diseño publicado</option>
                    {options.filter(option=>!requests.items.some(item=>item.avatarId===option.id)).map(avatar=>
                      <option key={avatar.id} value={avatar.id}>{avatar.label}</option>)}
                  </select>
                  <button className="primary" type="button" disabled={!!saving || !selection[request.ownerId]} onClick={()=>void deliver(request)}>Acreditar avatar</button>
                </div>}
            </li>
          ))}</ul>)}
        {(requestPage>0 || requests?.hasMore) && <div className="referrals-admin-actions">
          <button className="secondary" disabled={requestPage===0 || !!saving} onClick={()=>pageTo(requestPage-1)}>Anterior</button>
          <span>Página {requestPage+1}</span>
          <button className="secondary" disabled={!requests?.hasMore || !!saving} onClick={()=>pageTo(requestPage+1)}>Siguiente</button>
        </div>}
      </section>
    </main>
  );
}
