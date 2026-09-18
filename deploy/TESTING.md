# Producción y testing en la misma VPS

`main` ejecuta `deploy.yml` para producción. `development` ejecuta `deploy-testing.yml` para testing. Un PR a cualquiera de esas ramas verifica sin desplegar. La ejecución manual solo despliega cuando la rama coincide con el workflow. Los workflows usan la imagen exacta del commit verificado.

| Servicio | Producción (`main`) | Testing (`development`) | Loopback prod / test |
| --- | --- | --- | --- |
| Juego | https://lapulperia.cloud | https://testing.lapulperia.cloud | 8080 / 8082 |
| Backend | https://back.lapulperia.cloud | https://testingback.lapulperia.cloud | 3001 / 3003 |
| Panel | https://panel.lapulperia.cloud | https://testingpanel.lapulperia.cloud | 8081 / 8083 |

## Aislamiento

Testing tiene proyectos Compose `pulperia-back-testing`, `pulperia-front-testing`, `pulperia-panel-testing`, red `pulperia-testing-web`, DB `pulperia_testing` y volumen `pulperia-back-testing_postgres_data`. Producción conserva proyectos `pulperia-back/front/panel`, red `pulperia-web` y volumen `pulperia-back_postgres_data`. No se copian cuentas, sesiones, fichas, compras ni precios de producción. Las migraciones TypeORM inicializan testing en el primer arranque.

Cada backend tiene además una red privada de DB por proyecto; PostgreSQL no publica puertos. Los tres puertos HTTP de cada ambiente están ligados a 127.0.0.1. No abrir 3001/3003/8080–8083 en el firewall. Testing usa `NODE_ENV=production` para compilar y servir con HTTPS y cookies seguras; el nombre de la rama no cambia esa protección.

El alias `truco-api` existe por separado en cada red. Juego y panel llaman a su propio `/api`; el juego también proxifica `/socket.io`. Por eso `APP_URL`, `FRONTEND_URL` y el callback OAuth del juego usan el dominio del juego. El dominio `back` publica la API para integraciones y health checks; no cambia el origen del login del navegador. Las cookies no tienen un Domain compartido. El panel testing enlaza al juego testing; sus imágenes siguen usando las URLs públicas de producción, sin copiarlas.

## 1. DNS

Crear registros A hacia `72.61.45.52` para `testing`, `testingback` y `testingpanel`. Si `back` aún no existe, crearlo también. No modificar los registros actuales del juego/panel de producción.

## 2. Carpetas en la VPS

Con el usuario autorizado para sudo, Docker y Compose >= 2.30:

```bash
sudo install -d -o deploy -g "$(id -gn deploy)" -m 750 \
  /opt/pulperia/testing/truco-back \
  /opt/pulperia/testing/truco-front \
  /opt/pulperia/testing/truco-panel
sudo -u deploy docker ps
docker compose version
```

Los workflows fijan esas rutas; no se necesita `TESTING_DEPLOY_PATH`. Los scripts rechazan un despliegue testing dirigido a la carpeta de producción. El script de deploy crea la red compartida del ambiente si falta. No clonar repositorios ni instalar Node en la VPS.

## 3. Reutilizar los secrets existentes

**No hace falta crear ni duplicar secrets para testing.** Los workflows de development usan los mismos secrets que producción en cada repo.

En los tres repos se reutilizan `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USERNAME`, `PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_PRIVATE_KEY` y `PRODUCTION_SSH_KNOWN_HOSTS`.

En **truco-back** también se reutilizan `POSTGRES_USER`, `POSTGRES_PASSWORD`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `OTP_HASH_SECRET` y `SESSION_DAYS`, con los mismos requisitos/defaults que producción. No se usa ningún secret `TESTING_*`.

Las diferencias ya están definidas en los workflows: DB `pulperia_testing`, dominios/callbacks/CORS de testing y puertos 3003 (API), 8082 (juego) y 8083 (panel). Las carpetas siguen siendo `/opt/pulperia/testing/truco-*`, con proyectos, red y volumen propios. No se reutilizan el nombre de la DB, los puertos HTTP ni la ruta de despliegue de producción.

El acceso SSH y las credenciales son compartidos; los datos siguen separados. La cuenta de soporte debe existir y tener el email verificado en la DB de testing; no se importan cuentas ni contraseñas de usuarios desde producción.

Cambiar `POSTGRES_PASSWORD` en GitHub después de inicializar las bases no actualiza automáticamente sus roles PostgreSQL. Si se rota la contraseña compartida, actualizar ambos roles y el secret sin borrar volúmenes.

## 4. Publicar development

Guardar los cambios de esta implementación en commits de `development` y publicar la rama en los tres repos:

```bash
git push -u origin development
```

Desplegar primero **truco-back**, esperar Actions en verde y luego desplegar **truco-front** y **truco-panel**. Si las ramas ya están publicadas, cada push vuelve a desplegar. Para repetir sin nuevos commits, ejecutar el workflow testing con la rama `development` cuando esté disponible en Actions. GitHub lista `workflow_dispatch` cuando el workflow existe también en la rama por defecto; antes de eso usar push. No publicar archivos .env, specs ni evidencia local.

## 5. Nginx y HTTPS

Cada repo incluye `deploy/vps-testing-nginx.conf`, listo para su dominio/puerto. Copiar el archivo del repo correspondiente a la VPS como:

```text
/etc/nginx/sites-available/truco-back-testing
/etc/nginx/sites-available/truco-front-testing
/etc/nginx/sites-available/truco-panel-testing
```

En una instalación Nginx con sites-available/sites-enabled, habilitar solo estos sitios nuevos:

```bash
sudo ln -s /etc/nginx/sites-available/truco-back-testing /etc/nginx/sites-enabled/truco-back-testing
sudo ln -s /etc/nginx/sites-available/truco-front-testing /etc/nginx/sites-enabled/truco-front-testing
sudo ln -s /etc/nginx/sites-available/truco-panel-testing /etc/nginx/sites-enabled/truco-panel-testing
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --redirect \
  -d testing.lapulperia.cloud \
  -d testingback.lapulperia.cloud \
  -d testingpanel.lapulperia.cloud
```

Estos archivos son el bootstrap HTTP: Certbot agrega TLS cuando DNS resuelve a la VPS. No sobrescribir después el sitio certificado con el archivo HTTP original. Si usás otro proxy, configurar los mismos dominios/puertos y sobrescribir X-Forwarded-For con la IP real y X-Forwarded-Proto con el esquema público.

Para publicar `back.lapulperia.cloud`, el repo backend incluye por separado `deploy/vps-production-nginx.conf`, con loopback 3001. Requiere desplegar el Compose actualizado en `main` y habilitar ese sitio/certificado si no existe. Agregar `https://back.lapulperia.cloud` al `ALLOWED_ORIGINS` de producción conservando juego/panel. Mantener `APP_URL` y callback del juego en `https://lapulperia.cloud`.

## 6. OAuth y verificación

En el mismo cliente Google que usa producción, agregar los callbacks de testing sin quitar los existentes:

```text
https://testing.lapulperia.cloud/api/auth/google/callback
https://testingpanel.lapulperia.cloud/api/auth/google/panel/callback
```

Si el cliente OAuth tiene audiencia Testing, agregar las cuentas que probarán el acceso. El cliente OAuth y la cuenta Resend son los mismos que en producción; los envíos de correo desde testing son reales.

Comprobar desde la VPS:

```bash
curl -fsS http://127.0.0.1:3003/api/health/ready
curl -fsS http://127.0.0.1:8082/api/health/ready
curl -fsS http://127.0.0.1:8083/api/health/ready
curl -fsS https://testingback.lapulperia.cloud/api/health/ready
```

Abrir juego y panel testing, registrar/verificar una cuenta nueva, ingresar, crear una sala y comprobar administración con el soporte verificado de testing. Una cuenta/sesión de producción no se importa. Para logs:

```bash
cd /opt/pulperia/testing/truco-back/current
docker compose --env-file deploy.env -f compose.yaml logs --tail=100 api
```

## Promoción y recuperación

Promover mediante PR `development` → `main` en cada repo; al mergear se despliega producción con sus secretos y datos existentes. No promover la DB ni copiar los .env de testing. Los releases y locks están separados por ruta. Para volver a un release, entrar en su carpeta del mismo ambiente y ejecutar `docker compose --env-file deploy.env -f compose.yaml up -d --wait`. Verificar compatibilidad de migraciones; no hay rollback automático del esquema.

El smoke Docker del backend levanta dos proyectos desechables simultáneos con PostgreSQL y prueba aislamiento de sesiones/redes/volúmenes y persistencia al recrear la API. Los smokes de juego/panel usan una API de transporte simulada para verificar proxy/WS/cookies. OAuth y correo externos requieren verificación posterior con las credenciales compartidas y los callbacks de testing.

Referencias: [aislamiento por proyecto Compose](https://docs.docker.com/compose/how-tos/project-name/), [filtros de ramas de Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Certbot con Nginx](https://certbot.eff.org/instructions?os=snap&ws=nginx).
