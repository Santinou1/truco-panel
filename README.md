# La Pulpería — Panel de administración

Aplicación React/TypeScript independiente del juego. Usa el mismo `truco-back` para sesiones, permisos y precios. Conserva fuentes Rye/Bree Serif locales, paleta verde/dorada e imágenes publicadas de La Pulpería.

## Desarrollo

Requiere Node 22+. Con PostgreSQL y `npm start` activos en `../truco-back`:

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Abrir [el panel local](http://localhost:5176). `npm start` utiliza 5176 estricto; el juego continúa en 5174. `API_PROXY_TARGET` configura el destino privado del proxy `/api` (3002 por defecto). `VITE_GAME_URL` configura el enlace al juego y se incorpora durante el build. No colocar secretos en variables Vite.

En `.env` del backend:

```dotenv
ADMIN_PANEL_URL=http://localhost:5176
ALLOWED_ORIGINS=http://localhost:3002,http://127.0.0.1:3002,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5176,http://127.0.0.1:5176
```

Conservar `FRONTEND_URL` y `GOOGLE_REDIRECT_URI` del juego. Reiniciar el backend después de configurar los orígenes.

## Ingreso y permisos

La raíz `/` muestra el ingreso o el catálogo según la sesión. Acepta email/contraseña y verificación OTP para cuentas existentes, y Google si está configurado. La cuenta verificada `soporte@lapulperia.cloud` recibe el rol `super_admin` según la política existente del backend. No hay registro, invitado ni asignación de permisos desde este panel. Otras cuentas ven acceso restringido y pueden cerrar sesión para cambiar de cuenta.

Para Google, además del callback del juego, registrar exactamente:

```text
http://localhost:5176/api/auth/google/panel/callback
```

El enlace `/api/auth/google?app=panel` usa ese callback fijo y termina en `ADMIN_PANEL_URL/auth/callback`. El backend genera la URI desde `ADMIN_PANEL_URL`; nunca recibe una URL de retorno del navegador. Usar siempre el mismo hostname durante el flujo. Registrar el callback y completar el consentimiento real de Google es una verificación externa a los tests.

Se usan cookies HttpOnly y permisos consultados en cada operación. En local las cookies de `localhost` se comparten entre puertos: cerrar sesión puede afectar la sesión del juego en ese hostname. Con subdominios distintos y proxies propios, las cookies son independientes por host.

## Catálogo

Búsqueda y filtro por personajes, marcos, mesas y reversos; edición individual de precios enteros entre 0 y 2147483647. Los borradores se conservan al filtrar o fallar el guardado. Solo se confirma después de la respuesta de `POST /api/admin/assets`. `GET /api/catalog` publica el precio para el juego; las compras comparan nuevamente el precio vigente en el backend.

Los indicadores se calculan del catálogo real. Los saldos e inventarios no se modifican al editar precios. Las imágenes del catálogo, el cofre y el favicon se cargan directamente desde `https://lapulperia.cloud/media/`, usando las URLs con hash publicadas por el juego. `src/asset-manifest.json` contiene solo referencias: no se copian ni descargan imágenes al repositorio o durante el build. El build no depende del repositorio del juego. Fuentes y licencias OFL en `public/fonts`.

Al agregar diseños o cambiar imágenes publicadas, actualizar las URLs en `src/asset-manifest.json` y el catálogo en `src/catalog.json`; si cambia la moneda, actualizar también el favicon en `index.html`. Verificar primero que cada URL exista en el sitio publicado. Las imágenes requieren conexión con `lapulperia.cloud`; las URLs con hash deben seguir disponibles mientras estén referenciadas por el panel.

## Validación

```powershell
npm test
npm run build
npm run test:browser
```

La integración compila `../truco-back`, inicia API 3004 y Vite 5177, y usa exclusivamente `pulperia_panel_browser_test`. Requiere dependencias del backend y conexión PostgreSQL de su `.env`; no cambia la base de desarrollo. Correo simulado en memoria, sesión y precios reales. Cubre OTP/login, recarga, errores/reintento, borradores, catálogo público, permisos revocados, sesión vencida, invitados, teclado y escritorio/móvil. Evidencia en `docs/evidence`, ignorada por Git.

## Producción

CI/CD listo en [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): PR a `main` valida y push a `main` despliega por SSH a la misma VPS. Usa Docker/Nginx, puerto propio `8081` y el backend compartido. Ver [secrets y preparación de la VPS](deploy/README.md).

`npm run build` genera `dist/` autónomo. Servirlo con fallback de rutas a `index.html` y proxy `/api` al mismo backend del juego, conservando cookies, `Origin` y cabeceras. El proxy de Vite solo funciona en desarrollo; `npm run preview` sirve para revisar el build, no reemplaza ese proxy.

Configurar `ADMIN_PANEL_URL` con el origen HTTPS del panel y agregarlo a `ALLOWED_ORIGINS`. Registrar `ADMIN_PANEL_URL/api/auth/google/panel/callback` en Google. El backend mantiene su `FRONTEND_URL` y callback del juego. En el despliegue del backend por GitHub Actions, definir el secret opcional `ADMIN_PANEL_URL` y actualizar `ALLOWED_ORIGINS`. No requiere migraciones de base de datos adicionales.

## Torneos

La sección Torneos permite crear, editar y duplicar borradores; publicar torneos programados o al completar 16 cupos; reprogramar pospuestos; cancelar; resolver cruces sin ganador y registrar pagos manuales con referencia. Cuenta superadministradora verificada requerida en la API. Entradas gratuitas y reparto 70/30; no transfiere dinero. El juego usa `/torneos` en truco-front. Prueba conjunta: `npm run test:tournaments:browser` desde truco-back; DB y puertos separados.
