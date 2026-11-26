import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import "./referral-portal.css";
type Account={id:string;code:string;alias:string|null;email:string;displayName:string;premium:boolean};
type Totals={premium:boolean;totalUsers:number;settledMatches:number;activeMatches:number;refundedMatches:number;sameCodeMatches:number;otherCodeMatches:number;normalMatches:number;
 usersStakedMinor:string;grossPlayedMinor:string;usersNetMinor:string;earnedMinor:string;ownerBalanceMinor:string;ownerAvailableMinor:string;ownerReservedMinor:string};
type Member={userId:string;displayName:string;username:string|null;linkedAt:string;matchesPlayed:number;stakedMinor:string;netMinor:string};
type Match={matchId:string;startedAt:string;status:string;seats:number;players:{displayName:string;own:boolean}[];kind:string;grossMinor:string;usersStakedMinor:string;earnedMinor:string};
type Page<T>={items:T[];hasMore:boolean};
const integer=new Intl.NumberFormat("es-AR");
export function portalMoney(minor:string){const n=BigInt(minor),a=n<0n?-n:n;return `${n<0n?"−":""}$ ${integer.format(a/100n)},${String(a%100n).padStart(2,"0")}`;}
const kindLabel:Record<string,string>={same_code:"Entre mis referidos",other_code:"Contra otro código",normal:"Contra usuario sin código"};
const statusLabel:Record<string,string>={settled:"Liquidada",funded:"En juego",refunded:"Devuelta"};
const date=(iso:string)=>new Date(iso).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Argentina/Buenos_Aires"});

export function ReferralPortal(){
 const [linkToken,setLinkToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get("token")??"");
 const [link,setLink]=useState<{purpose:"invite"|"login";email:string;code:string;alias:string|null}>();
 const [account,setAccount]=useState<Account|null>(null),[booting,setBooting]=useState(true),[attempt,setAttempt]=useState(0);
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{
  // Keep the secret only in memory; remove it from browser history before any form interaction.
  if(location.hash)history.replaceState({},"",location.pathname);
  let live=true;setBooting(true);setError("");
  void (async()=>{try{
   if(linkToken){const info=await api<typeof link>("/referral-portal/auth/inspect",{token:linkToken});if(live)setLink(info);}
   else {const me=await api<Account>("/referral-portal/me");if(live)setAccount(me);}
  }catch(e){if(live&&!(e instanceof ApiError&&e.status===401))setError(message(e));}
  finally{if(live)setBooting(false);}})();return()=>{live=false;};
 },[linkToken,attempt]);
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
  try{await work();}catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}}
 const authenticated=async()=>{setAccount(await api<Account>("/referral-portal/me"));setPassword("");setLinkToken("");setLink(undefined);history.replaceState({},"","/referidos");};
 const denied=useCallback(()=>{setAccount(null);setError("El acceso venció o fue revocado. Volvé a ingresar.");},[]);
 return <div className="referral-portal-shell">
  <a href="#portal-main" className="skip-link">Saltar al contenido</a>
  <header className="portal-topbar"><a className="brand" href="/referidos">La Pulpería<span>PANEL DE REFERIDOS</span></a>
   {account?<div><span>{account.email}</span><button disabled={busy} onClick={()=>void run(async()=>{await api("/referral-portal/auth/logout",{});setAccount(null);setNotice("Sesión cerrada.");})}>Salir del panel de referidos</button></div>:<a href="/">Acceso de soporte</a>}
  </header>
  <main id="portal-main" className="page referral-portal" tabIndex={-1}>
   {error&&<p role="alert" className="error-banner">{error} <button onClick={()=>setAttempt(v=>v+1)}>Reintentar</button></p>}
   {notice&&<p role="status" className="panel portal-notice">{notice}</p>}
   {booting?<p role="status">Comprobando tu acceso…</p>:account?<Dashboard account={account} onDenied={denied}/>:linkToken?
    <section className="panel portal-access"><h1>{link?.purpose==="invite"?"Registrá tu acceso de referido":"Confirmá el ingreso"}</h1>
     {link?<><p>{link.email} · {link.alias??link.code}</p><p>Este acceso queda limitado a tus referidos. Tus credenciales son exclusivas de este panel.</p>
      <form onSubmit={e=>{e.preventDefault();void run(async()=>{await api("/referral-portal/auth/consume",{token:linkToken,...(link.purpose==="invite"?{displayName:name,password}:{})});await authenticated();});}}>
       <fieldset disabled={busy}>{link.purpose==="invite"&&<><label>Tu nombre<input autoComplete="name" required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Contraseña del panel<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label><p>Usá al menos 12 caracteres.</p></>}
        <button type="submit" className="primary">{link.purpose==="invite"?"Registrar mi acceso":"Ingresar con este enlace"}</button>
       </fieldset>
      </form></>:<p>El enlace no está disponible. Pedile una nueva invitación a soporte o solicitá un enlace de ingreso si ya registraste tus credenciales.</p>}
     <button onClick={()=>{setLinkToken("");setLink(undefined);setError("");history.replaceState({},"","/referidos");}}>Volver al ingreso de referidos</button>
    </section>:
    <section className="panel portal-access"><span className="eyebrow">TU COMUNIDAD</span><h1>Entrá a tu panel de referidos</h1>
     <p>Usá el correo invitado por soporte y la contraseña que registraste desde su invitación.</p>
     <form onSubmit={e=>{e.preventDefault();void run(async()=>{await api("/referral-portal/auth/login",{email:email.trim(),password});await authenticated();});}}>
      <fieldset disabled={busy}><label>Email del panel<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
       <label>Contraseña del panel<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
       <button type="submit" className="primary">Entrar a mis referidos</button>
      </fieldset>
     </form>
     <form onSubmit={e=>{e.preventDefault();void run(async()=>{const r=await api<{message:string}>("/referral-portal/auth/link",{email:email.trim()});setNotice(r.message);});}}>
      <label>Recibir enlace de ingreso por email<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
      <button type="submit" disabled={busy}>Enviarme un enlace de ingreso</button>
     </form><p>El enlace de ingreso vence en 10 minutos y solo puede usarse una vez.</p>
    </section>}
  </main>
 </div>;
}

function Dashboard({account,onDenied}:{account:Account;onDenied:()=>void}){
 const [summary,setSummary]=useState<Totals>(),[users,setUsers]=useState<Page<Member>>(),[matches,setMatches]=useState<Page<Match>>();
 const [userSearch,setUserSearch]=useState(""),[matchSearch,setMatchSearch]=useState("");
 const [uq,setUq]=useState({search:"",offset:0}),[mq,setMq]=useState({search:"",offset:0,kind:"all",status:"all",from:null as string|null,to:null as string|null});
 const [kind,setKind]=useState("all"),[status,setStatus]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [revision,setRevision]=useState(0),[error,setError]=useState("");
 const denied=useRef(onDenied);denied.current=onDenied;
 const fail=useCallback((e:unknown)=>{if(e instanceof ApiError&&(e.status===401||e.status===403))denied.current();else setError(message(e));},[]);
 useEffect(()=>{let live=true;void api<Totals>("/referral-portal/summary").then(r=>{if(live)setSummary(r);}).catch(e=>{if(live)fail(e);});return()=>{live=false;};},[revision,fail]);
 useEffect(()=>{let live=true;setUsers(undefined);void api<Page<Member>>("/referral-portal/users/search",{...uq,limit:20}).then(r=>{if(live)setUsers(r);}).catch(e=>{if(live)fail(e);});return()=>{live=false;};},[uq,revision,fail]);
 useEffect(()=>{let live=true;setMatches(undefined);void api<Page<Match>>("/referral-portal/matches/search",{...mq,limit:20}).then(r=>{if(live)setMatches(r);}).catch(e=>{if(live)fail(e);});return()=>{live=false;};},[mq,revision,fail]);
 return <>
  <header className="portal-heading"><div><span className="eyebrow">CÓDIGO {account.code}</span><h1>{account.alias??account.displayName}</h1><p>{(summary?.premium??account.premium)?"Código premium habilitado":"Comisiones premium deshabilitadas para nuevas partidas"}</p></div>
   <button onClick={()=>{setError("");setRevision(v=>v+1);}}>Actualizar mi panel</button></header>
  {error&&<p role="alert" className="error-banner">{error}</p>}
  {!summary&&!error&&<p role="status">Cargando totales…</p>}
  {summary&&<><dl className="portal-totals">
   {[["Usuarios vinculados",String(summary.totalUsers)],["Pozo total de sus partidas",portalMoney(summary.grossPlayedMinor)],["Entradas de mis usuarios",portalMoney(summary.usersStakedMinor)],
    ["Comisiones generadas",portalMoney(summary.earnedMinor)],["Saldo real del dueño",portalMoney(summary.ownerBalanceMinor)],["Disponible para retirar",portalMoney(summary.ownerAvailableMinor)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl><p className="portal-explanation">Importes de mesas en ARS. Los totales jugados incluyen partidas liquidadas; cada pozo se cuenta una vez aunque participen dos de tus usuarios. Las entradas son solo lo aportado por tus referidos. Las entradas y premios de torneos se contabilizan por separado en la billetera. El saldo del dueño incluye su actividad de billetera y las comisiones acreditadas; no es lo mismo que la comisión acumulada.</p>
  <dl className="portal-totals portal-counts">{[["Entre mis referidos",summary.sameCodeMatches],["Contra otro código",summary.otherCodeMatches],["Contra usuarios sin código",summary.normalMatches],["En juego",summary.activeMatches],["Devueltas",summary.refundedMatches]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  <p>Las comisiones premium corresponden a partidas de dos jugadores y comienzan desde la habilitación del código. Las partidas devueltas no generan comisión. Los importes se calculan en centavos y se acreditan una sola vez.</p></>}
  <section className="panel portal-section"><h2>Todos mis usuarios</h2>
   <form className="portal-filters" onSubmit={e=>{e.preventDefault();setUq({search:userSearch.trim(),offset:0});}}><label>Buscar entre mis usuarios<input type="search" maxLength={100} value={userSearch} onChange={e=>setUserSearch(e.target.value)}/></label><button type="submit">Buscar usuarios</button></form>
   {!users&&!error&&<p role="status">Cargando usuarios…</p>}
   {users&&<><ul className="portal-records">{users.items.map(u=><li key={u.userId}><div><strong>{u.displayName}</strong><span>{u.username?`@${u.username}`:"Sin nombre de usuario"}</span><small>Vinculado: {date(u.linkedAt)}</small></div>
    <dl><div><dt>Partidas ARS</dt><dd>{u.matchesPlayed}</dd></div><div><dt>Aportado en entradas</dt><dd>{portalMoney(u.stakedMinor)}</dd></div><div><dt>Resultado neto</dt><dd>{portalMoney(u.netMinor)}</dd></div></dl></li>)}</ul>
    {!users.items.length&&<p>No hay usuarios para esta búsqueda.</p>}<div className="portal-actions"><button disabled={!uq.offset} onClick={()=>setUq({...uq,offset:uq.offset-20})}>Usuarios anteriores</button><button disabled={!users.hasMore} onClick={()=>setUq({...uq,offset:uq.offset+20})}>Más usuarios</button></div></>}
  </section>
  <section className="panel portal-section"><h2>Partidas de mis referidos</h2>
   <form className="portal-filters" onSubmit={e=>{e.preventDefault();setMq({search:matchSearch.trim(),offset:0,kind,status,from:from?new Date(from+"T00:00:00-03:00").toISOString():null,to:to?new Date(to+"T00:00:00-03:00").toISOString():null});}}>
    <label>Buscar usuario en partidas<input type="search" maxLength={100} value={matchSearch} onChange={e=>setMatchSearch(e.target.value)}/></label>
    <label>Tipo de enfrentamiento<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Todos</option>{Object.entries(kindLabel).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    <label>Estado de partida<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option>{Object.entries(statusLabel).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    <label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta (sin incluir)<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><button type="submit">Filtrar partidas</button>
   </form>
   {!matches&&!error&&<p role="status">Cargando partidas…</p>}
   {matches&&<><ul className="portal-records">{matches.items.map(m=><li key={m.matchId}><div><strong>{kindLabel[m.kind]}</strong><span>{m.players.map(p=>p.displayName).join(" vs ")}</span><small>{date(m.startedAt)} · {statusLabel[m.status]} · {m.seats} jugadores</small></div>
    <dl><div><dt>Pozo</dt><dd>{portalMoney(m.grossMinor)}</dd></div><div><dt>Entradas de mis usuarios</dt><dd>{portalMoney(m.usersStakedMinor)}</dd></div><div><dt>Mi comisión</dt><dd>{portalMoney(m.earnedMinor)}</dd></div></dl></li>)}</ul>
    {!matches.items.length&&<p>No hay partidas para estos filtros.</p>}<div className="portal-actions"><button disabled={!mq.offset} onClick={()=>setMq({...mq,offset:mq.offset-20})}>Partidas anteriores</button><button disabled={!matches.hasMore} onClick={()=>setMq({...mq,offset:mq.offset+20})}>Más partidas</button></div></>}
  </section>
 </>;
}
