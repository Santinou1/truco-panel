import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  prepareTestAdmin,
  revokeTestAdmin,
  testOtp,
} from "./browser-mail-fixture.mjs";

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
    initialPrice = Number(await input().inputValue());
    const nextPrice=initialPrice===375?376:375;
    report.checks.push(
      "Ingreso común /, rutas antiguas redirigen a raíz, OTP de soporte y redirección por rol; 20 diseños del catálogo",
    );

    const me = await (await context.request.get(base + "/api/users/me")).json();
    assert.equal(me.role, "super_admin");
    assert.equal(me.adminPanelUrl, base);
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
      page.getByText(`Guardado: ${nextPrice} fichas.`, { exact: true }),
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
      page.getByText("Guardado: 444 fichas.", { exact: true }),
    ).toBeVisible();
    await input().fill(String(nextPrice));
    await save().click();
    await expect(
      page.getByText(`Guardado: ${nextPrice} fichas.`, { exact: true }),
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
