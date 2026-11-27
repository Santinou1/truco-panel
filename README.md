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

## Partidas por usuario

En **Partidas por usuario**, escribí parte del nombre o del usuario, o el correo completo. Elegí dos cuentas verificadas distintas de las sugerencias que aparecen al escribir. Configurá una partida a 15 o 30 puntos y elegí con o sin flor. Cargá los puntos que suma el ganador y los que se descuentan al perdedor en el ranking diario de Patacones reales. El formulario admite enteros entre 0 y 1000. Copiá el enlace y compartilo con ambos jugadores. Tienen 24 horas para iniciar la mesa gratuita.

## Auditoría de transferencias

Buscá cargas y retiros por nombre, usuario, correo o referencia desde **Auditoría de transferencias**. Filtrá por tipo, estado o errores y abrí **Ver detalle** para revisar importes y actividad de Cresium. En las cargas, **Bruto recibido** muestra las transferencias registradas y **Neto acreditado** el importe asentado en el saldo. En los retiros, el detalle muestra si falta aprobación y confirma el neto cuando se registra el pago. Disponible para la cuenta superadministradora.

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

La sección Torneos permite crear, editar y duplicar borradores; publicar torneos programados o al completar 8, 16 o 32 cupos; reprogramar pospuestos; cancelar; resolver cruces sin ganador y registrar pagos manuales con referencia. Cuenta superadministradora verificada requerida en la API. Entradas y comisión configurables; acreditación interna del premio al campeón. Los torneos históricos conservan sus pagos manuales. El juego usa `/torneos` en truco-front. Prueba conjunta: `npm run test:tournaments:browser` desde truco-back; DB y puertos separados.

Los programados comienzan a la hora publicada con cupo completo de inscriptos, aunque no confirmen presencia. Solo faltantes de inscripción posponen. Una ausencia durante 60 segundos clasifica al rival; doble ausencia sortea el pase y queda registrada en auditoría. La reserva anticipada es opcional; no disponer de mesa al comienzo implica perder el cruce.

Simulaciones: el panel permite configurar de 0 a 8/16 bots. Se incorporan al publicar y juegan automáticamente; los cupos restantes son para personas. Se identifican como simulación, sin premios ni ELO. Guía técnica y ejemplos en `../truco-back/TOURNAMENTS.md`.

## Ranking diario

El ranking administrativo comparte la identidad plata/verde para Freeroll y oro para Reales. Usa iconografía de código, Roboto local licenciado para datos y los títulos del sistema visual; no depende de ilustraciones nuevas sin publicar. El selector, calendario, estadísticas y tablas conservan teclado y diseño desde 320 px.

La sección **Ranking diario** permite elegir **Freeroll · gratis** (premio diario declarado $20.000 ARS) o **Patacones reales** (mesas reales e invitaciones gratuitas asignadas a ese ranking, premio $50.000 ARS). El calendario, líderes, totales, clasificación, historial y detalle se consultan por ranking. Al cambiar el selector se vuelve al calendario y se reinician los filtros. Elegí una fecha para consultar la jornada; **Ver partidas** abre el historial del jugador y permite buscar por nombre, correo del rival o ID de partida y filtrar por resultado. No acredita premios automáticamente. En **Mesas con patacones reales** se editan los puntos por resultado y tramo. Si el abandono o el vencimiento de la reconexión define un ganador, se aplican los puntos de victoria y derrota en ambos rankings.

El detalle muestra los equipos, el marcador, las horas de inicio y final en Argentina y la duración. En **Manos de la partida** podés abrir cada mano y ver las cartas jugadas en primera, segunda y tercera con las imágenes publicadas del mazo. Cada baza muestra sus cantos, respuestas y puntos. La API comprueba el rol de superadministrador vigente en cada consulta. La prueba conjunta `npm run test:ranking:browser` se ejecuta desde `truco-back`.

## Integración de testing — 2026-11-08

El juego en `development` incorpora **Guardar usuario** y alertas compactas cerrables. Esta entrega conserva el acceso, los permisos y la edición de precios del panel; comparte la API vigente con el juego.

El [informe y las nueve capturas del juego](https://github.com/Santinou1/truco-front/releases/tag/testing-2026-11-08-guardar-usuario-alertas) se adjuntan fuera de Git. Destino del panel: [testingpanel.lapulperia.cloud](https://testingpanel.lapulperia.cloud), publicado por el workflow de `development` después del backend.

Verificación local de esta integración: `npm test` (4 pruebas), `npm run build` y `npm run test:browser` aprobados. La suite de navegador usa API/PostgreSQL reales y OTP simulado; comprueba borradores, reintentos, permisos, sesión y pantallas desde 320 px.

Las cargas recibidas y retenidas por revisión de origen tienen **Acreditar**. En el detalle, revisá cuenta, referencia e importe total (neto más la cobertura de Cresium informada), escribí el motivo y confirmá. El saldo se acredita inmediatamente al confirmar la API y queda registrado el administrador, motivo y fecha en el historial. Los reintentos no duplican el crédito. Una orden sin movimiento recibido o con neto cero no permite acreditar; los retiros mantienen su circuito propio.
# Torneos con entrada y premio

En Torneos → Crear torneo, elegir la moneda y el valor de entrada: patacones ficticios o reales (ARS). Con 0 es gratuito. El importe real se ingresa en pesos y se envía en centavos. La inscripción cobra una sola vez; retirarse antes del inicio o cancelar devuelve la entrada. Una posposición conserva el cobro y la inscripción.

El premio total se ingresa en pesos: se acredita automáticamente al campeón en patacones reales después de descontar la comisión elegida (20% por defecto). Los torneos históricos conservan el pago manual 70/30; editar un borrador lo actualiza al contrato nuevo. Duplicar conserva entrada y moneda. Las simulaciones con bots requieren entrada y premio cero.

En el borrador, **Destinatarios del torneo → Exclusivo por referido** permite elegir un código o alias existente mediante búsqueda y páginas. Podrán verlo e inscribirse los referidos vinculados y el dueño. **Comisión (%)** admite 0–100 con dos decimales para cualquier torneo; muestra los importes antes de guardar. Duplicar conserva ambos valores. Al publicar se fijan el destino y el porcentaje.

## Accesos de referidos premium

Cada acceso tiene **Ir al panel**: abre su tablero en otra pestaña con la sesión de `soporte@lapulperia.cloud`. La vista de superadministrador permite consultar usuarios, partidas, filtros, páginas, comisiones y saldo, incluso si el acceso está pendiente o revocado. Cada consulta valida los permisos vigentes. No hace falta la contraseña del referido y la consulta no modifica su sesión, credenciales ni premium. **Volver a la administración** regresa al panel principal.

En Referidos → Accesos y códigos premium, seleccionar código o alias, email y si se habilita premium. El destinatario registra credenciales propias desde un enlace de uso único de 24 horas; luego ingresa en /referidos o solicita un enlace de 10 minutos. No accede a soporte. El tablero incluye todos sus usuarios paginados, partidas por tipo, importes y comisiones/saldo. Soporte puede revocar acceso y premium de inmediato. Contrato y pruebas: [REFERRAL_PORTAL.md](../truco-back/REFERRAL_PORTAL.md).

Las nuevas mesas de patacones reales tienen comisión fija del 10%. La comisión de torneos sigue siendo configurable.
