import { useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../api";
import type { AssetPrice, CosmeticKind } from "../types";
import { asset, catalog, label } from "../catalog";
import "./admin.css";

const categories: Record<CosmeticKind, string> = {
  avatars: "Personajes",
  frames: "Marcos",
  tables: "Mesas",
  cardBacks: "Reversos",
};
const keyOf = (item: AssetPrice) => `${item.category}:${item.assetId}`;
type Denied = (status: 401 | 403) => void;

function PriceEditor({
  item,
  hidden,
  onSaved,
  onDenied,
}: {
  item: AssetPrice;
  hidden: boolean;
  onSaved: (item: AssetPrice) => void;
  onDenied: Denied;
}) {
  const [draft, setDraft] = useState(String(item.price));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const visual = catalog[item.category].find(
    (entry) => entry.id === item.assetId,
  );
  const image = visual?.image;
  const name = label(item.label);
  const inputId = `price-${item.category}-${item.assetId}`;
  const changed = draft.trim() !== "" && Number(draft) !== item.price;

  const save = async () => {
    if (lock.current || !changed) return;
    const price = Number(draft);
    if (!Number.isInteger(price) || price < 0 || price > 2147483647) {
      setFailed(true);
      setStatus("Ingresá un número entero entre 0 y 2147483647.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setFailed(false);
    setStatus("Guardando…");
    try {
      const saved = await api<{ price: number }>("/admin/assets", {
        category: item.category,
        assetId: item.assetId,
        price,
      });
      if (!mounted.current) return;
      onSaved({ ...item, price: saved.price });
      setDraft(String(saved.price));
      setStatus(`Guardado: ${saved.price.toLocaleString("es-AR")} fichas.`);
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        onDenied(error.status);
        return;
      }
      setFailed(true);
      setStatus(message(error));
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <article
      className="admin-card panel"
      hidden={hidden}
      data-category={item.category}
      aria-label={`${categories[item.category]}: ${name}`}
    >
      <div className="admin-card-heading">
        <div className="admin-art">
          {image ? (
            <img src={asset(image)} alt={name} loading="lazy" />
          ) : (
            <span>{name}</span>
          )}
        </div>
        <div>
          <span className="eyebrow">{categories[item.category]}</span>
          <h2>{name}</h2>
          <p className="admin-current">
            Actual: <strong>{item.price.toLocaleString("es-AR")}</strong> fichas
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={inputId}>Precio en fichas</label>
        <div className="admin-price-control">
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={2147483647}
            step={1}
            aria-label={`Precio de ${name} (${categories[item.category]})`}
            aria-describedby={`${inputId}-status`}
            value={draft}
            disabled={saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus("");
              setFailed(false);
            }}
          />
          <button
            className="primary"
            type="submit"
            disabled={saving || !changed}
            aria-label={`Guardar precio de ${name} (${categories[item.category]})`}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <p
          id={`${inputId}-status`}
          className={"admin-row-status" + (failed ? " failed" : "")}
          role="status"
          aria-live="polite"
        >
          {status || (changed ? "Cambio sin guardar" : "")}
        </p>
      </form>
    </article>
  );
}

export function Admin({ onDenied }: { onDenied: Denied }) {
  const [items, setItems] = useState<AssetPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CosmeticKind | "">("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void api<{ items: AssetPrice[] }>("/admin/assets")
      .then((result) => {
        if (live) setItems(result.items);
      })
      .catch((error) => {
        if (!live) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          onDenied(error.status);
          return;
        }
        setError(message(error));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt, onDenied]);

  const search = query.trim().toLocaleLowerCase("es");
  const visible = (item: AssetPrice) =>
    (!category || category === item.category) &&
    item.label.toLocaleLowerCase("es").includes(search);
  const count = items.filter(visible).length;
  return (
    <main className="page admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DE LA PULPERÍA</span>
          <h1>Los precios de la casa</h1>
          <p>
            Personajes, marcos, mesas y reversos. Elegí un diseño y guardá su
            nuevo valor.
          </p>
          <span className="admin-badge">Superadministrador</span>
        </div>
        <img src={asset("economia/cofre-cerrado.png")} alt="" />
      </header>
      <section className="stats" aria-label="Resumen del catálogo">
        <div>
          <span>Diseños comprables</span>
          <strong>{loading ? "—" : items.length}</strong>
          <small>Disponibles en el juego</small>
        </div>
        <div>
          <span>Categorías</span>
          <strong>
            {loading ? "—" : new Set(items.map((item) => item.category)).size}
          </strong>
          <small>Una identidad, muchos estilos</small>
        </div>
        <div>
          <span>Sin costo</span>
          <strong>
            {loading ? "—" : items.filter((item) => item.price === 0).length}
          </strong>
          <small>Dentro del catálogo comprable</small>
        </div>
      </section>
      <div className="section-heading">
        <h2>Catálogo de diseños</h2>
        <span>Precios en fichas</span>
      </div>
      <div className="admin-toolbar panel">
        <label htmlFor="admin-search">
          Buscar diseño
          <input
            id="admin-search"
            type="search"
            placeholder="Nombre del diseño…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="admin-category">
          Categoría
          <select
            id="admin-category"
            aria-label="Categoría"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as CosmeticKind | "")
            }
          >
            <option value="">Todos los diseños</option>
            {Object.entries(categories).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-summary" role="status">
          {loading
            ? "Cargando catálogo…"
            : `${count} de ${items.length} diseños comprables`}
        </p>
      </div>
      {error ? (
        <div className="panel admin-load-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar carga
          </button>
        </div>
      ) : loading ? (
        <p className="admin-loading" role="status">
          Consultando los precios de la casa…
        </p>
      ) : (
        <>
          <section className="admin-grid" aria-label="Precios de diseños">
            {items.map((item) => (
              <PriceEditor
                key={keyOf(item)}
                item={item}
                hidden={!visible(item)}
                onDenied={onDenied}
                onSaved={(saved) =>
                  setItems((previous) =>
                    previous.map((old) =>
                      keyOf(old) === keyOf(saved) ? saved : old,
                    ),
                  )
                }
              />
            ))}
          </section>
          {!count && (
            <div className="empty-state">
              <h2>No encontramos ese diseño</h2>
              <p>Probá con otro nombre o categoría.</p>
              <button
                className="secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                }}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </>
      )}
      <p className="admin-footnote">
        Los valores están expresados en fichas. Los diseños iniciales siguen
        incluidos sin costo.
      </p>
    </main>
  );
}
