import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function verifySimulationControl(browser, page, base) {
  const dir = "docs/evidence/053-control-simulacion-admin";
  await mkdir(dir, { recursive: true });
  const headers = { "X-Requested-With": "LaPulperia" };
  const api = page.context().request;
  const state = async () =>
    (await api.get(base + "/api/admin/simulation")).json();
  const toggle = (enabled) =>
    page.getByRole("button", {
      name: enabled ? "Activar simulación" : "Desactivar simulación",
      exact: true,
    });
  const report = {
    checkedAt: new Date().toISOString(),
    scope:
      "Panel/API/PostgreSQL reales; OTP simulado y fallos HTTP controlados",
    checks: [],
  };
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  let player;
  try {
    await page.route("**/api/admin/simulation", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              message: "No pudimos consultar el salón de pruebas.",
            }),
          })
        : route.continue(),
    );
    await page
      .getByRole("button", { name: "Simulación con bots", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("No pudimos consultar");
    await page.unroute("**/api/admin/simulation");
    await page.getByRole("button", { name: "Reintentar carga" }).click();
    await expect(toggle(true)).toBeEnabled();
    assert.deepEqual(
      { ...(await state()), updatedAt: null },
      { available: true, enabled: false, version: 0, updatedAt: null },
    );
    await page.screenshot({
      path: dir + "/01-panel-desactivada.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: dir + "/02-panel-movil.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    const created = await guest.request.post(base + "/api/auth/guest", {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { displayName: "Prueba de control de bots" },
    });
    assert.equal(created.status(), 200);
    assert.equal(
      (await guest.request.get(base + "/api/admin/simulation")).status(),
      403,
    );
    assert.equal(
      (
        await guest.request.post(base + "/api/admin/simulation", {
          headers,
          data: { enabled: true, expectedVersion: 0 },
        })
      ).status(),
      403,
    );
    const beforeWallet = await (
      await guest.request.get(base + "/api/wallet/me")
    ).json();
    const beforeElo = await (
      await guest.request.get(base + "/api/elo/me")
    ).json();
    const game = process.env.SIMULATION_GAME_URL;
    if (game) {
      assert.equal(
        (
          await guest.request.post(base + "/api/users/me/profile", {
            headers,
            data: {
              username: "SimControl" + Date.now().toString(36),
              avatarId: "paisano",
            },
          })
        ).status(),
        200,
      );
      player = await guest.newPage();
      await player.goto(game + "/lobby");
      await expect(
        player.getByRole("heading", { name: "¿Sale un truco?" }),
      ).toBeVisible();
      await expect(
        player.getByRole("heading", {
          name: "Siempre hay una mesa para probar",
        }),
      ).toHaveCount(0);
    }

    // Let the real server commit, but delay its HTTP response. The panel must
    // keep the previous state until that response actually arrives.
    let release,
      committed,
      posts = 0;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    const saved = new Promise((resolve) => {
      committed = resolve;
    });
    await page.route("**/api/admin/simulation", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch();
      committed();
      await released;
      await route.fulfill({ response });
    });
    try {
      await toggle(true).click();
      await saved;
      assert.equal((await state()).enabled, true);
      await expect(page.locator(".simulation-control .primary")).toBeDisabled();
      await expect(
        page.getByText("Simulación activada.", { exact: true }),
      ).toHaveCount(0);
    } finally {
      release();
    }
    await expect(
      page.getByText("Simulación activada.", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/admin/simulation");
    assert.equal(posts, 1);
    await expect(toggle(false)).toBeEnabled();
    await page.screenshot({
      path: dir + "/03-panel-activada.png",
      fullPage: true,
    });
    let list = await (
      await guest.request.get(base + "/api/simulation/tables")
    ).json();
    assert.equal(list.enabled, true);
    assert.equal(list.tables.length, 6);
    const oldIds = list.tables.map((table) => table.id);
    let tableId;
    if (player) {
      await expect(
        player.getByRole("heading", {
          name: "Siempre hay una mesa para probar",
        }),
      ).toBeVisible({ timeout: 12000 });
      await player.getByRole("button", { name: "Ver todas las mesas" }).click();
      tableId = list.tables.find(
        (table) => table.joinable && table.playerCount === 2,
      ).id;
      await player
        .locator(`[data-simulation-table="${tableId}"]`)
        .getByRole("button", { name: "Sentarme →" })
        .click();
      await player
        .getByRole("button", { name: "Estoy listo", exact: true })
        .click();
      await expect(player.locator(".art-table")).toBeVisible();
      await player.screenshot({
        path: dir + "/04-juego-con-bot.png",
        fullPage: true,
      });
    }

    await page.route("**/api/admin/simulation", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              message: "No pudimos guardar el cambio. Reintentá.",
            }),
          })
        : route.continue(),
    );
    await toggle(false).click();
    await expect(page.getByRole("alert")).toContainText("No pudimos guardar");
    assert.equal((await state()).enabled, true);
    await expect(toggle(false)).toBeEnabled();
    await page.screenshot({
      path: dir + "/05-error-sin-exito-falso.png",
      fullPage: true,
    });
    await page.unroute("**/api/admin/simulation");
    await toggle(false).click();
    await expect(
      page.getByText("Simulación desactivada.", { exact: true }),
    ).toBeVisible();
    list = await (
      await guest.request.get(base + "/api/simulation/tables")
    ).json();
    assert.equal(list.enabled, false);
    assert.equal(list.tables.length, 0);
    if (player) {
      await expect(
        player.getByRole("heading", { name: "Esta mesa de prueba terminó" }),
      ).toBeVisible({ timeout: 12000 });
      await expect(player.locator(".art-table")).toHaveCount(0);
      assert.equal(
        (
          await guest.request.post(
            base + `/api/simulation/tables/${tableId}/ready`,
            { headers, data: {} },
          )
        ).status(),
        404,
      );
      await player.screenshot({
        path: dir + "/06-mesa-cerrada.png",
        fullPage: true,
      });
      await player
        .getByRole("button", { name: "Volver al salón", exact: true })
        .click();
      await expect(
        player.getByRole("heading", { name: "¿Sale un truco?" }),
      ).toBeVisible();
      await expect(
        player.getByRole("heading", {
          name: "Siempre hay una mesa para probar",
        }),
      ).toHaveCount(0);
    }
    await page.reload();
    await page
      .getByRole("button", { name: "Simulación con bots", exact: true })
      .click();
    await expect(toggle(true)).toBeEnabled();
    await toggle(true).click();
    await expect(toggle(false)).toBeEnabled();
    list = await (
      await guest.request.get(base + "/api/simulation/tables")
    ).json();
    assert.ok(list.tables.every((table) => !oldIds.includes(table.id)));
    // An administrator who loaded an older state receives a real 409.
    const external = await api.post(base + "/api/admin/simulation", {
      headers,
      data: { enabled: false, expectedVersion: (await state()).version },
    });
    assert.equal(external.status(), 200);
    // The local view still says enabled. A concurrent activation makes its next
    // disable stale, so it must refresh rather than overwrite the newer choice.
    await api.post(base + "/api/admin/simulation", {
      headers,
      data: { enabled: true, expectedVersion: (await state()).version },
    });
    await toggle(false).click();
    await expect(page.getByRole("alert")).toContainText("El estado cambió");
    await page.getByRole("button", { name: "Actualizar estado" }).click();
    await expect(toggle(false)).toBeEnabled();
    await toggle(false).click();
    await expect(toggle(true)).toBeEnabled();
    assert.deepEqual(
      await (await guest.request.get(base + "/api/wallet/me")).json(),
      beforeWallet,
    );
    assert.deepEqual(
      await (await guest.request.get(base + "/api/elo/me")).json(),
      beforeElo,
    );
    report.checks = [
      "Carga con error recuperable, estado inicial apagado y móvil 320 px",
      "Activación real y confirmación sólo tras respuesta; bloqueo de doble envío",
      "Error 503 controlado conserva estado; desactivación y reintento reales",
      "Persistencia al recargar, reactivación sin mesas anteriores y conflicto 409 real",
      "No administradores reciben 403; saldo y ELO conservados",
    ];
    if (player)
      report.checks.push(
        "Panel → API → juego reales: aparece el salón, partida humana contra bot y cierre de mesa/controles al desactivar",
      );
    report.status = "passed";
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await page
      .screenshot({ path: dir + "/failure-panel.png", fullPage: true })
      .catch(() => {});
    await player
      ?.screenshot({ path: dir + "/failure-juego.png", fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await page.unroute("**/api/admin/simulation");
    const current = await state().catch(() => null);
    if (current?.enabled)
      await api.post(base + "/api/admin/simulation", {
        headers,
        data: { enabled: false, expectedVersion: current.version },
      });
    await guest.close();
    await writeFile(
      dir + "/verification.json",
      JSON.stringify(report, null, 2),
    );
    await page.getByRole("button", { name: /Catálogo y precios/ }).click();
  }
}
