import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import { TournamentReferralSelector } from "./TournamentReferralSelector";
import { pendingTournamentIntent, tournamentMutation } from "../tournaments";
import "./referral-portal.css";
type Account={id:string;code:string;alias:string|null;email:string;premium:boolean;version:number;activatedAt:string|null;revokedAt:string|null;emailStatus:string|null};
const delivery:Record<string,string>={pending:"Pendiente de envío",accepted:"Aceptado por el proveedor",delivered:"Entregado",failed:"Falló el envío",unknown:"Envío sin confirmar",bounced:"Rebotado",complained:"Reportado como spam",suppressed:"Suprimido",delivery_delayed:"Entrega demorada"};
export function ReferralPortalAdmin({userId,onDenied}:{userId:string;onDenied:(status:401|403)=>void}){
 const [code,setCode]=useState<string|null>(null),[email,setEmail]=useState(""),[premium,setPremium]=useState(true);
 const [search,setSearch]=useState(""),[query,setQuery]=useState({search:"",offset:0}),[result,setResult]=useState<{items:Account[];hasMore:boolean}>();
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const lock=useRef(false),denied=useRef(onDenied);denied.current=onDenied;
 const fail=useCallback((e:unknown)=>{setError(message(e));if(e instanceof ApiError&&(e.status===401||e.status===403))denied.current(e.status);},[]);
 useEffect(()=>{let live=true;setError("");setResult(undefined);
  void api<{items:Account[];hasMore:boolean}>("/admin/referral-portal/accounts/search",{...query,limit:20}).then(r=>{if(live)setResult(r);}).catch(e=>{if(live)fail(e);});
  return()=>{live=false;};
 },[query,revision,fail]);
 async function mutate(path:string,body:unknown,success:string){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
  try{await tournamentMutation(userId,path,body);setNotice(success);setRevision(v=>v+1);}catch(e){fail(e);}finally{lock.current=false;setBusy(false);}}
 const pending=pendingTournamentIntent(userId);
 return <section className="panel referral-portal-admin" aria-labelledby="portal-admin-title">
  <h2 id="portal-admin-title">Accesos y códigos premium</h2>
  <button type="button" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Actualizar lista de accesos</button>
  <p>Invitá por email a un administrador de referido. Su cuenta queda limitada al código elegido y usa credenciales propias.</p>
  {error&&<p role="alert">{error} <button type="button" onClick={()=>setRevision(v=>v+1)}>Actualizar accesos</button></p>}
  {notice&&<p role="status">{notice}</p>}
  {pending?.path.startsWith('/admin/referral-portal')&&<button disabled={busy} onClick={()=>void mutate(pending.path,pending.body,"Solicitud pendiente recuperada. Revisá el resultado en la lista.")}>Reintentar solicitud pendiente</button>}
  <form onSubmit={e=>{e.preventDefault();if(code)void mutate("/admin/referral-portal/invite",{code,email:email.trim(),premium},"Invitación solicitada. Revisá el estado de envío en la lista.");}}>
   <fieldset disabled={busy}>
    <TournamentReferralSelector value={code} onChange={setCode} onDenied={onDenied} helpText="El acceso solo podrá consultar los usuarios y partidas de este código. Cambiar su alias no modifica la asignación."/>
    <label>Email del acceso al panel<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="portal-checkbox"><input type="checkbox" checked={premium} onChange={e=>setPremium(e.target.checked)}/>Habilitar este código en la lista premium</label>
    <p>La comisión premium aplica a nuevas partidas de dos jugadores. Cada referido premium aporta un 4% del pozo a su dueño: 8% con dos del mismo código; 4% para cada dueño si son códigos premium distintos. La Pulpería conserva el resto del 10%. Las mesas de cuatro no generan comisión premium.</p>
    <button type="submit" className="primary">Enviar invitación al panel</button>
   </fieldset>
  </form>
  <form className="portal-filters" onSubmit={e=>{e.preventDefault();setQuery({search:search.trim(),offset:0});}}>
   <label>Buscar acceso por email, código o alias<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <button type="submit">Buscar accesos</button>
  </form>
  {!result&&!error&&<p role="status">Cargando accesos…</p>}
  {result&&<><ul className="portal-records">{result.items.map(a=><li key={a.id}>
   <div><strong>{a.alias??a.code} · {a.code}</strong><span>{a.email}</span>
    <span>{a.revokedAt?"Acceso revocado":a.activatedAt?"Acceso registrado":"Registro pendiente"} · {a.premium?"Premium habilitado":"Sin comisión premium"}</span>
    <small>Último correo: {delivery[a.emailStatus??""]??a.emailStatus??"Sin envío"}</small></div>
   <div className="portal-actions">
    <button disabled={busy} onClick={()=>void mutate("/admin/referral-portal/invite",{code:a.code,email:a.email,premium:a.premium},"Nuevo enlace solicitado. El anterior queda invalidado.")}>{a.revokedAt?"Reinvitar":a.activatedAt?"Enviar enlace de ingreso":"Reenviar invitación"}</button>
    {!a.revokedAt&&<><button disabled={busy} onClick={()=>void mutate(`/admin/referral-portal/accounts/${a.id}/manage`,{enabled:!a.premium,expectedVersion:a.version,revoke:false},"Lista premium actualizada para las próximas partidas.")}>{a.premium?"Desactivar premium":"Habilitar premium"}</button>
    <button disabled={busy} onClick={()=>void mutate(`/admin/referral-portal/accounts/${a.id}/manage`,{enabled:false,expectedVersion:a.version,revoke:true},"Acceso y premium desactivados. Las sesiones y enlaces fueron revocados.")}>Revocar acceso y premium</button></>}
   </div>
  </li>)}</ul>{!result.items.length&&<p>No hay accesos en esta página.</p>}
   <div className="portal-actions"><button disabled={!query.offset||busy} onClick={()=>setQuery({...query,offset:query.offset-20})}>Accesos anteriores</button><button disabled={!result.hasMore||busy} onClick={()=>setQuery({...query,offset:query.offset+20})}>Más accesos</button></div>
  </>}
  <p>El enlace de registro vence en 24 horas; el de ingreso, en 10 minutos. Solo pueden usarse una vez. Revocar impide entrar de inmediato y deshabilita comisiones futuras; las partidas iniciadas conservan su reparto.</p>
  <a href="/referidos" target="_blank" rel="noreferrer">Abrir acceso exclusivo de referidos ↗</a>
 </section>;
}
