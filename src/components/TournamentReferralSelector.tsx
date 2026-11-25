import { useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";

type Referral = { code: string; alias: string | null; ownerName: string };
export function TournamentReferralSelector({ value, onChange, onDenied }: {
  value: string | null;
  onChange: (code: string) => void;
  onDenied: (status: 401 | 403) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ search: "", offset: 0, revision: 0 });
  const [result, setResult] = useState<{ items: Referral[]; hasMore: boolean }>({ items: [], hasMore: false });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const denied = useRef(onDenied);
  denied.current = onDenied;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void api<{ items: Referral[]; hasMore: boolean }>("/admin/referrals/codes/search", {
      search: query.search, status: "all", limit: 20, offset: query.offset,
    }).then(data => { if (live) setResult(data); }).catch(e => {
      if (!live) return;
      setError(message(e));
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) denied.current(e.status);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [query]);
  const find = () => setQuery({ search: search.trim(), offset: 0, revision: query.revision + 1 });
  return <section className="tournament-referral-selector" aria-label="Selección de referido">
    <label>Buscar código, alias o dueño
      <input type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); find(); } }} />
    </label>
    <button type="button" disabled={loading} onClick={find}>Buscar referido</button>
    <label>Código o alias de destino
      <select required value={value ?? ""} onChange={e => onChange(e.target.value)} aria-describedby="referral-audience-help">
        <option value="">Elegí un referido</option>
        {value && !result.items.some(item => item.code === value) && <option value={value}>{value} · Seleccionado</option>}
        {result.items.map(item => <option key={item.code} value={item.code}>
          {item.code}{item.alias ? ` · ${item.alias}` : ""} · {item.ownerName}
        </option>)}
      </select>
    </label>
    {loading && <p role="status">Cargando referidos…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={find}>Reintentar búsqueda</button></p>}
    {!loading && !error && <>
      {!result.items.length && <p>No encontramos referidos para esta búsqueda.</p>}
      <div className="tournament-actions">
        <button type="button" disabled={!query.offset} onClick={() => setQuery({ ...query, offset: query.offset - 20 })}>Referidos anteriores</button>
        <button type="button" disabled={!result.hasMore} onClick={() => setQuery({ ...query, offset: query.offset + 20 })}>Más referidos</button>
      </div>
    </>}
    <p id="referral-audience-help">Solo podrán verlo e inscribirse el dueño del código y las personas que lo tengan vinculado. Cambiar el alias conserva este destino.</p>
  </section>;
}
