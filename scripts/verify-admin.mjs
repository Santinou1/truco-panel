import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  prepareTestAdmin,
  createTestReferralOwner,
  createTestReferralLinks,
  createTestTransfers,
  revokeTestAdmin,
  testOtp,
} from "./browser-mail-fixture.mjs";

async function verifyFiatTransferAudit(page, base, headers, dir) {
  const fixture = await createTestTransfers();
  const endpoint = base + "/api/admin/fiat-transfers";
  const detail = (kind, id) => page.request.get(`${endpoint}/${kind}/${id}`);
  const search = data => page.request.post(endpoint + "/search", { headers, data });
  const first = await search({ search: fixture.userId, limit: 1 });
  assert.equal(first.status(), 200);
  assert.equal(first.headers()["cache-control"], "no-store");
  const firstPage = await first.json();
  assert.equal(firstPage.hasMore, true);
  const secondPage = await (await search({ search: fixture.userId, limit: 1, offset: 1 })).json();
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
  const byReference = await (await search({ search: fixture.providerReference })).json();
  assert.equal(byReference.items[0].id, fixture.credited);
  const rejected = await (await search({ search: fixture.email, kind: "withdrawal", status: "failed" })).json();
  assert.deepEqual(rejected.items.map(item => item.id), [fixture.rejected]);
  const errors = await (await search({ search: fixture.email, kind: "deposit", withErrors: true })).json();
  assert.deepEqual(errors.items.map(item => item.id), [fixture.issuanceError]);
  const failure = await detail("deposit", fixture.issuanceError);
  const rawFailure = await failure.text();
  assert.equal(failure.status(), 200);
  assert.match(rawFailure, /"httpStatus":500/);
  assert.doesNotMatch(rawFailure, /private-fixture|ciphertext/);
  const trail = await (await detail("withdrawal", fixture.rejected)).json();
  assert.equal(trail.events.length, 50);
  assert.equal(trail.hasMore, true);
  const older = await (await page.request.get(`${endpoint}/withdrawal/${fixture.rejected}?offset=50`)).json();
  assert.equal(older.events.length, 2);
  assert.equal(older.hasMore, false);
  assert.equal((await search({ status: "invalid" })).status(), 400);
  assert.equal((await detail("withdrawal", fixture.credited)).status(), 404);

  await page.getByRole("button", { name: "Auditoría de transferencias", exact: true }).click();
  const query = page.getByLabel("Usuario o referencia");
  await query.fill(fixture.email);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const table = page.getByRole("region", { name: "Resultados de transferencias" });
  await expect(table.locator("tbody tr")).toHaveCount(5);
  const posted = table.getByRole("row").filter({ hasText: "Acreditada" });
  const review = table.getByRole("row").filter({ hasText: "En revisión" });
  await expect(posted).toContainText(/486,75/);
  await expect(posted.getByRole("button", { name: /Acreditar/ })).toHaveCount(0);
  await expect(review.getByRole("button", { name: /Acreditar/ })).toBeVisible();
  await expect(review).toContainText(/0,00/);
  await page.screenshot({ path: dir + "/auditoria-transferencias.png", fullPage: true });
  await posted.getByRole("button", { name: /Ver detalle/ }).click();
  await expect(page.getByText("Acreditación en el saldo")).toBeVisible();
  await expect(page.getByText("Transferencia recibida")).toBeVisible();
  await expect(page.getByText("Orden de carga iniciada")).toBeVisible();
  await page.screenshot({ path: dir + "/auditoria-carga.png", fullPage: true });
  await page.getByRole("button", { name: /Volver a transferencias/ }).click();
  await expect(query).toHaveValue(fixture.email);
  await review.getByRole("button", { name: /Acreditar/ }).click();
  await expect(page.getByText(/No se confirmó la titularidad/).first()).toBeVisible();
  await expect(page.getByText("Acreditación en el saldo")).toHaveCount(0);
  const credit = page.getByRole("button", { name: /^Acreditar \$/ });
  await expect(credit).toBeDisabled();
  const reason = page.getByLabel("Motivo de la acreditación");
  await reason.fill("Transferencia verificada por soporte en prueba aislada");
  await page.setViewportSize({ width: 320, height: 850 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: dir + "/acreditar-carga-mobile.png", fullPage: true });
  const creditUrl = `${endpoint}/deposit/${fixture.review}/credit`;
  await page.route(creditUrl, route => route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Acreditación temporalmente no disponible"})}));
  await credit.click();
  await expect(page.getByRole("alert")).toHaveText("Acreditación temporalmente no disponible");
  await expect(reason).toHaveValue("Transferencia verificada por soporte en prueba aislada");
  await expect(page.getByText("Acreditación en el saldo")).toHaveCount(0);
  await page.unroute(creditUrl);
  // Commit for real, then lose the response. Retrying must confirm the existing credit.
  await page.route(creditUrl, async route => {
    assert.equal((await route.fetch()).status(),200);
    await route.abort("failed");
  });
  await credit.click();
  await expect(page.getByRole("alert")).toContainText("Revisá tu conexión");
  await page.unroute(creditUrl);
  await credit.click();
  await expect(page.getByRole("status").filter({hasText:"La transferencia ya estaba acreditada"})).toBeVisible();
  await expect(page.getByText("Aprobación administrativa", {exact:true})).toBeVisible();
  await expect(page.getByText("Acreditación en el saldo", {exact:true})).toBeVisible();
  await expect(page.getByLabel("Motivo de la acreditación")).toHaveCount(0);
  const approved = await (await detail("deposit", fixture.review)).json();
  assert.equal(approved.transfer.settledMinor,"50000");
  assert.equal(approved.transfer.status,"credited");
  assert.equal(approved.events.filter(event=>event.kind==="credit").length,2);
  assert.equal(approved.events.filter(event=>event.kind==="admin_credit").length,1);
  await page.screenshot({ path: dir + "/acreditacion-confirmada.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Volver a transferencias/ }).click();
  await expect(table.getByRole("row").filter({hasText:"En revisión"})).toHaveCount(0);
  await expect(table.getByRole("button", {name:/Acreditar/})).toHaveCount(0);
  await page.getByLabel("Tipo", { exact: true }).selectOption("withdrawal");
  await page.getByLabel("Estado", { exact: true }).selectOption("awaiting_signature");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 850 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await table.getByRole("button", { name: /Ver detalle/ }).click();
  await expect(page.getByText("Retiro solicitado", { exact: true })).toBeVisible();
  await expect(page.getByText("Neto transferido", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin confirmar", { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: dir + "/auditoria-retiro-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Catálogo y precios/ }).click();
  return fixture;
}

export async function verifyAdmin(browser, base) {
  const dir = "docs/evidence/001-panel-administracion";
  await mkdir(dir, { recursive: true });
  const password = "AdminSoloPruebas123!";
  const admin = await prepareTestAdmin(password);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(12000);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const report = {
    checkedAt: new Date().toISOString(),
    scope: "React/Vite + Nest + PostgreSQL reales; correo OTP simulado",
    checks: [],
    oauthReal: false,
  };
  const headers = { "X-Requested-With": "LaPulperia" };
  const input = () =>
    page.getByRole("spinbutton", {
      name: "Precio de Oro (Marcos)",
      exact: true,
    });
  const save = () =>
    page.getByRole("button", {
      name: "Guardar precio de Oro (Marcos)",
      exact: true,
    });
  const heading = () =>
    page.getByRole("heading", { name: "Los precios de la casa", exact: true });
  async function login() {
    await page.goto(base + "/");
    await page.getByLabel("Email", { exact: true }).fill(admin.email);
    await page.locator("input[type=password]").fill(password);
    await page.getByRole("button", { name: "Entrar al panel" }).click();
  }
  let initialPrice;
  try {
    await page.goto(base + "/");
    assert.equal((await context.request.post(base + "/api/admin/fiat-transfers/search", { headers, data: {} })).status(), 401);
    assert.equal((await context.request.get(base + "/api/admin/internal-trial")).status(), 401);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await expect(
      page.getByRole("button", { name: "Catálogo y precios", exact: false }),
    ).toHaveCount(0);
    await page.goto(base + "/login");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await login();
    await expect(
      page.getByRole("heading", { name: "Verificá tu correo" }),
    ).toBeVisible();
    await page.getByLabel("Código de verificación").fill(testOtp(admin.email));
    await page.getByRole("button", { name: "Verificar y entrar" }).click();
    await expect(heading()).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await expect(page.locator(".admin-card")).toHaveCount(20);
    assert.ok(
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.every((image) =>
            image.src.startsWith("https://lapulperia.cloud/media/"),
          ),
        ),
    );
    await expect(
      page.getByRole("button", { name: "Catálogo y precios", exact: false }),
    ).toBeVisible();
    await page.getByRole("button", {name:"Prueba interna", exact:true}).click();
    const internal = base + "/api/admin/internal-trial";
    const trial = await (await context.request.get(internal)).json();
    assert.equal(trial.profiles.length,10);
    const invites = page.getByLabel("Correos invitados, uno por línea");
    await expect(invites).toHaveValue(trial.invites.join("\n"));
    const profileName = page.getByLabel("Nombre del perfil 1", {exact:true});
    const temporaryName = "Perfil de prueba UI";
    await profileName.fill(temporaryName);
    await page.getByRole("button", {name:"Actualizar resultados"}).click();
    await expect(page.getByText("Resultados actualizados.", {exact:true})).toBeVisible();
    await expect(profileName).toHaveValue(temporaryName);
    await invites.fill([...trial.invites,"taller@example.test"].join("\n"));
    await page.getByRole("button", {name:"Guardar configuración"}).click();
    await expect(page.getByText("Configuración guardada.", {exact:true})).toBeVisible();
    const savedTrial = await (await context.request.get(internal)).json();
    assert.equal(savedTrial.profiles[0].name,temporaryName);
    assert.ok(savedTrial.invites.includes("taller@example.test"));
    // Display-only fixture for a winner with a $501 stake and a $901.80 payout.
    await page.route(internal, route => route.fulfill({ json: {
      ...savedTrial, profiles: savedTrial.profiles.map((profile, i) =>
        i === 0 ? {...profile, available:100400.80, net:"400.80"} : profile),
    } }));
    await page.getByRole("button", {name:"Actualizar resultados"}).click();
    const winnerRow = page.getByRole("row").filter({hasText:temporaryName});
    await expect(winnerRow.locator("td").nth(0)).toContainText("100.400,80");
    await expect(winnerRow.locator("td").nth(2)).toContainText("400,80");
    await page.unroute(internal);
    await page.setViewportSize({width:320,height:850});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
    await invites.fill(trial.invites.join("\n"));
    await profileName.fill(trial.profiles[0].name);
    await Promise.all([page.waitForResponse(r=>r.url()===internal && r.request().method()==="POST" && r.ok()),
      page.getByRole("button", {name:"Guardar configuración"}).click()]);
    await page.setViewportSize({width:1440,height:1000});
    report.checks.push("Prueba interna: diez saldos, edición de perfil e invitados, borradores y vista de 320 px");
    const audit = await verifyFiatTransferAudit(page, base, headers, dir);
    report.checks.push("Auditoría: búsqueda, paginación, importes, cargas en revisión, aprobación, errores y móvil");
    const activity = () => page.getByRole("button", { name: "Actividad del salón", exact: true });
    await activity().click();
    const readActivity = async () => (await context.request.get(base + "/api/admin/lobby-activity")).json();
    const initialActivity = await readActivity();
    assert.equal(initialActivity.available, true);
    const toggleName = (enabled) => enabled ? "Desactivar actividad" : "Activar actividad";
    const toggle = (enabled) => page.getByRole("button", { name: toggleName(enabled), exact: true });
    await toggle(initialActivity.enabled).click();
    await expect(toggle(!initialActivity.enabled)).toBeVisible();
    assert.equal((await readActivity()).enabled, !initialActivity.enabled);
    await page.reload();
    await activity().click();
    await expect(toggle(!initialActivity.enabled)).toBeVisible();
    await page.screenshot({ path: dir + "/actividad-del-salon.png" });
    await toggle(!initialActivity.enabled).click();
    await expect(toggle(initialActivity.enabled)).toBeVisible();
    await page.getByRole("button", { name: "Catálogo y precios", exact: false }).click();
    report.checks.push("El interruptor del salón guarda ambos estados en la API y conserva el cambio al recargar");
    initialPrice = Number(await input().inputValue());
    const nextPrice = initialPrice === 375 ? 376 : 375;
    report.checks.push(
      "Ingreso común /, rutas antiguas redirigen a raíz, OTP de soporte y redirección por rol; 20 diseños del catálogo",
    );

    const me = await (await context.request.get(base + "/api/users/me")).json();
    assert.equal(me.role, "super_admin");
    assert.equal(me.adminPanelUrl, base);
    const referralOwner = await createTestReferralOwner();
    await page.getByRole("button", { name: "Referidos", exact: true }).click();
    await page.getByLabel("Usuario, correo o ID exacto").fill(referralOwner.id);
    await page.getByRole("button", { name: "Buscar cuenta" }).click();
    const assign = page.getByRole("button", { name: "Generar y asignar" });
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/admin/referrals/code") && response.status() === 200),
      assign.click(),
    ]);
    await expect(page.getByText(/^Código: [0-9]{4}$/)).toBeVisible();
    const savedCode = await referralOwner.summary();
    assert.match(savedCode.ownCode, /^[0-9]{4}$/);
    await expect(page.getByText("Código: " + savedCode.ownCode)).toBeVisible();
    await createTestReferralLinks(savedCode.ownCode);
    const tracking = page.getByRole("region", { name: "Seguimiento de referidos" });
    await tracking.getByLabel("Buscar en seguimiento").fill(savedCode.ownCode);
    await tracking.getByLabel("Estado", { exact: true }).selectOption("with_links");
    await tracking.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(tracking.getByText("3 vinculados", { exact: true })).toBeVisible();
    await expect(tracking.getByText("1 con premio", { exact: true })).toBeVisible();
    await tracking.getByRole("button", { name: "Ver referidos del código " + savedCode.ownCode }).click();
    const notStarted = tracking.getByRole("row").filter({ hasText: "Amiga por empezar" });
    const inProgress = tracking.getByRole("row").filter({ hasText: "Amigo en camino" });
    const rewarded = tracking.getByRole("row").filter({ hasText: "Amiga premiada" });
    await expect(notStarted).toContainText("Faltan 10 partidas");
    await expect(inProgress).toContainText("Faltan 6 partidas");
    await expect(inProgress).toContainText("Invitador de prueba");
    await expect(rewarded).toContainText("Acreditado");
    await tracking.screenshot({ path: dir + "/seguimiento-referidos.png" });
    await tracking.getByLabel("Estado", { exact: true }).selectOption("rewarded");
    await tracking.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(rewarded).toBeVisible();
    await expect(inProgress).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 850 });
    assert.ok(await tracking.evaluate(element =>
      element.getBoundingClientRect().right <= document.documentElement.clientWidth + 1));
    await expect(tracking.getByRole("region", { name: "Usuarios referidos" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Catálogo y precios", exact: false }).click();
    report.checks.push("Referidos: asignación, búsqueda, dueño del código, progreso, filtro de premio y tabla móvil");
    assert.equal(
      (await context.request.get(base + "/api/admin/panel")).status(),
      404,
    );
    const beforeBalance = await (
      await context.request.get(base + "/api/wallet/me")
    ).json();
    const beforeInventory = await (
      await context.request.get(base + "/api/users/me/inventory")
    ).json();
    await input().fill(String(nextPrice));
    await page.getByLabel("Categoría", { exact: true }).selectOption("avatars");
    await page.getByLabel("Categoría", { exact: true }).selectOption("frames");
    await expect(input()).toHaveValue(String(nextPrice));
    await page.getByLabel("Buscar diseño", { exact: true }).fill("oro");
    await expect(page.locator(".admin-card:visible")).toHaveCount(1);
    await save().click();
    await expect(
      page.getByText(`Guardado: ${nextPrice} patacones.`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(input()).toHaveValue(String(nextPrice));
    const publicCatalog = await (
      await context.request.get(base + "/api/catalog")
    ).json();
    assert.equal(
      publicCatalog.frames.find((item) => item.id === "oro").price,
      nextPrice,
    );
    report.checks.push(
      "Borrador conservado al filtrar, guardar y recargar; precio reflejado en catálogo público compartido con el juego",
    );

    await input().fill("-1");
    await save().click();
    assert.equal(
      await input().evaluate((element) => element.validity.valid),
      false,
    );
    await input().fill("1.5");
    await save().click();
    assert.equal(
      await input().evaluate((element) => element.validity.valid),
      false,
    );
    await input().fill("444");
    await page.route("**/api/admin/assets", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "Error de guardado de prueba" }),
          })
        : route.continue(),
    );
    await save().click();
    await expect(
      page.getByText("Error de guardado de prueba", { exact: true }),
    ).toBeVisible();
    await expect(input()).toHaveValue("444");
    await page.unroute("**/api/admin/assets");
    await save().click();
    await expect(
      page.getByText("Guardado: 444 patacones.", { exact: true }),
    ).toBeVisible();
    await input().fill(String(nextPrice));
    await save().click();
    await expect(
      page.getByText(`Guardado: ${nextPrice} patacones.`, { exact: true }),
    ).toBeVisible();
    report.checks.push(
      "Validación, error de red simulado sin éxito falso ni perder borrador, reintento real",
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: dir + "/admin-desktop.png", fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page
        .getByLabel("Categoría", { exact: true })
        .selectOption("frames");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: dir + `/admin-mobile-${width}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "sin overflow " + width,
      );
      await expect(
        page.getByRole("button", { name: "Catálogo y precios", exact: false }),
      ).toBeInViewport();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(heading()).toBeVisible();
    await page.getByLabel("Buscar diseño", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Categoría", { exact: true })).toBeFocused();
    report.checks.push(
      "Escritorio, 768/390/320 px, imágenes remotas reales, teclado y movimiento reducido",
    );

    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await login();
    await expect(heading()).toBeVisible();
    // Same destination as OAuth callback, with a real authenticated cookie; no Google consent simulated.
    await page.goto(base + "/auth/callback");
    await expect(heading()).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await page.goto(base + "/");
    await expect(heading()).toBeVisible();
    assert.deepEqual(
      await (await context.request.get(base + "/api/wallet/me")).json(),
      beforeBalance,
    );
    assert.deepEqual(
      await (
        await context.request.get(base + "/api/users/me/inventory")
      ).json(),
      beforeInventory,
    );
    report.checks.push(
      "Logout/login y callback restauran ruta; saldo e inventario conservados",
    );

    // Load error from API: recover without a fresh login.
    await page.route("**/api/admin/assets", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Catálogo temporalmente no disponible",
        }),
      }),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Reintentar carga" }),
    ).toBeVisible();
    await page.unroute("**/api/admin/assets");
    await page.getByRole("button", { name: "Reintentar carga" }).click();
    await expect(input()).toBeVisible();

    // Revoking the actual session tests the expired-session path on a mounted screen.
    await context.request.post(base + "/api/auth/logout", {
      headers,
      data: {},
    });
    await input().fill("777");
    await save().click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(base + "/");
    await expect(page.locator(".admin-card")).toHaveCount(0);
    await login();
    await expect(heading()).toBeVisible();
    await context.request.post(base + "/api/admin/assets", {
      headers,
      data: { category: "frames", assetId: "oro", price: initialPrice },
    });
    await revokeTestAdmin(admin.userId);
    assert.equal((await context.request.post(base + "/api/admin/fiat-transfers/search", { headers, data: {} })).status(), 403);
    assert.equal((await context.request.get(base + "/api/admin/fiat-transfers/deposit/" + audit.credited)).status(), 403);
    await input().fill("888");
    await save().click();
    await expect(
      page.getByRole("heading", { name: "Este panel es privado" }),
    ).toBeVisible();
    await expect(page.locator(".admin-card")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Catálogo y precios", exact: false }),
    ).toHaveCount(0);
    assert.equal(
      (
        await context.request.post(base + "/api/admin/assets", {
          headers,
          data: { category: "frames", assetId: "oro", price: 999 },
        })
      ).status(),
      403,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Este panel es privado" }),
    ).toBeVisible();
    await page.screenshot({
      path: dir + "/acceso-restringido.png",
      fullPage: true,
    });
    report.checks.push(
      "Fallo de carga recuperable; sesión revocada vuelve a /; rol retirado oculta panel y API devuelve 403",
    );

    const other = await browser.newContext();
    try {
      const guest = await other.request.post(base + "/api/auth/guest", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: { displayName: "Prueba sin rol" },
      });
      assert.equal(guest.status(), 200);
      assert.equal((await other.request.get(base + "/api/admin/internal-trial")).status(), 403);
      assert.equal((await other.request.post(base + "/api/admin/internal-trial", {headers, data:{}})).status(), 403);
      const outsider = await other.newPage();
      let adminCalls = 0;
      outsider.on("request", (request) => {
        if (request.url().endsWith("/api/admin/assets")) adminCalls++;
      });
      await outsider.goto(base + "/");
      await expect(
        outsider.getByRole("heading", { name: "Este panel es privado" }),
      ).toBeVisible();
      assert.equal(adminCalls, 0);
      await expect(
        outsider.getByRole("button", {
          name: "Catálogo y precios",
          exact: false,
        }),
      ).toHaveCount(0);
    } finally {
      await other.close();
    }
    assert.deepEqual(errors, []);
    report.status = "passed";
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await page
      .screenshot({ path: dir + "/failure.png", fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await writeFile(
      dir + "/report.json",
      JSON.stringify({ ...report, errors }, null, 2),
    );
    await context.close();
  }
}
