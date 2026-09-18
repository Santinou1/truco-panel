# CI/CD del panel — GitHub Actions y VPS

Mismo esquema que `truco-front`: **PR a main valida; push a main valida y despliega**. También permite Run workflow, con despliegue solo al seleccionar `main`.

La VPS recibe una imagen Docker del commit validado por SSH. El proyecto Compose `pulperia-panel` escucha en `127.0.0.1:8081` y usa la red existente `pulperia-web` para enviar `/api` a `truco-api:3001`. No despliega backend ni base de datos. Los nombres, puerto y directorio son propios del panel para no reemplazar el juego.

## Secrets en truco-panel

En GitHub → Settings → Secrets and variables → Actions, cargar los mismos datos SSH de los otros repos:

| Secret | Valor |
| --- | --- |
| `PRODUCTION_SSH_HOST` | IP o DNS de la misma VPS, sin protocolo. |
| `PRODUCTION_SSH_USERNAME` | Usuario Linux con Docker y permiso de escritura. |
| `PRODUCTION_SSH_PRIVATE_KEY` | Clave SSH privada dedicada, sin contraseña. |
| `PRODUCTION_SSH_KNOWN_HOSTS` | Entrada known_hosts con la huella verificada de la VPS. |
| `PRODUCTION_DEPLOY_PATH` | Directorio exclusivo del panel, por ejemplo `/root/repos/truco-panel`. No reutilizar el del front/back. Ruta absoluta sin espacios ni puntos. |
| `PRODUCTION_SSH_PORT` | Opcional: `22`. |
| `PANEL_HTTP_PORT` | Opcional: `8081`. Puerto de loopback al que apunta el proxy HTTPS. |

Variable pública opcional, en **Variables**: `VITE_GAME_URL`. Por defecto `https://lapulperia.cloud`; se incorpora al build para el enlace «Ir al juego». No poner credenciales en variables Vite. La API siempre usa `/api` del origen del panel.

Los secrets de repositorio no se comparten automáticamente con los otros repos; cargarlos aquí o habilitarlos como secrets de organización. Los PR no usan los secrets de despliegue.

## Preparar la VPS una vez

Usar Linux amd64 con Docker Engine, Compose >=2.30, Bash, tar, gzip y flock, igual que los otros proyectos. El backend debe estar desplegado en `pulperia-web` con alias `truco-api`.

Configurar DNS y HTTPS del dominio elegido para el panel. [Ejemplo Nginx de la VPS](vps-nginx.example.conf): reemplazar dominio/certificados y, si cambia, el puerto. El proxy público sobrescribe `X-Forwarded-For` y `X-Forwarded-Proto`; el contenedor solo es accesible desde loopback.

En los secrets de **truco-back**, configurar `ADMIN_PANEL_URL` con el origen HTTPS del panel y agregar ese mismo origen a `ALLOWED_ORIGINS`, conservando los del juego/API. Desplegar también los cambios de backend que incorporan ese retorno. Para Google, registrar adicionalmente `ADMIN_PANEL_URL/api/auth/google/panel/callback`. El juego conserva su `FRONTEND_URL` y su callback.

## Qué verifica y despliega

1. `npm ci`, `npm test`, `npm run build` y sintaxis Bash.
2. Imagen `pulperia-panel:SHA` con Nginx y build de producción.
3. Smoke real de Docker: SPA, fuentes, caché, ausencia de WebP copiados, proxy HTTP con cookies/cabeceras y pantalla de ingreso en Chromium, incluido móvil. Usa un fixture de transporte; no necesita repositorio privado del backend ni sus secretos.
4. Solo en `main`: configuración mínima, transferencia SSH con host verificado y `docker compose up -d --wait`. Se actualiza `current` al release saludable; el lock de despliegue evita ejecuciones simultáneas.

La integración real API/PostgreSQL/OTP sigue disponible localmente con `npm run test:browser`. Los archivos `.deploy`, `.runtime`, specs y evidencia permanecen ignorados; no se publican artifacts ni secretos. Las imágenes del catálogo se cargan por URL desde `lapulperia.cloud`, sin copiarlas al build.

Para revisar Docker localmente después de construir:

```powershell
docker build -t pulperia-panel:0000000000000000000000000000000000000000 .
node deploy/smoke.mjs
```

Para revertir, desde el release anterior en la VPS ejecutar `docker compose --env-file deploy.env -f compose.yaml up -d --wait`. Subir este repositorio a `main` activa el workflow; esta implementación no ejecuta ningún despliegue remoto.
