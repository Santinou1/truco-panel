import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { startBrowserApi } from "./browser-mail-fixture.mjs";
import { verifyAdmin } from "./verify-admin.mjs";

// Builds the shared API, then uses its own database and an in-memory mail provider.
execFileSync(
  process.execPath,
  [
    "../truco-back/node_modules/typescript/bin/tsc",
    "-p",
    "../truco-back/tsconfig.json",
  ],
  { stdio: "inherit" },
);
const app = await startBrowserApi();
let vite, browser;
try {
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 5177,
      strictPort: true,
      hmr: false,
      proxy: {
        "/api": { target: "http://127.0.0.1:3004", changeOrigin: true },
      },
    },
  });
  await vite.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5177");
  await expect(
    page.getByRole("heading", { name: "Entrá a la administración" }),
  ).toBeVisible();
  const images = JSON.parse(await readFile("src/asset-manifest.json", "utf8"));
  const decoded = await page.evaluate(async (urls) => {
    return Promise.all(
      urls.map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return {
          url: image.currentSrc,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );
  }, Object.values(images));
  assert.ok(
    decoded.every(
      (image) =>
        image.url.startsWith("https://lapulperia.cloud/media/") &&
        image.width > 0 &&
        image.height > 0,
    ),
  );
  assert.ok(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((image) =>
          image.src.startsWith("https://lapulperia.cloud/media/"),
        ),
      ),
  );
  assert.equal(
    await page.locator('link[rel="icon"]').getAttribute("href"),
    images["economia/moneda.png"],
  );
  await mkdir("docs/evidence/002-imagenes-remotas", { recursive: true });
  await writeFile(
    "docs/evidence/002-imagenes-remotas/browser-images.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        status: "passed",
        source:
          "Imágenes reales de lapulperia.cloud, sin interceptación ni copias locales",
        decoded,
      },
      null,
      2,
    ),
  );
  await mkdir("docs/evidence/001-panel-administracion", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/001-panel-administracion/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Login desborda a 320 px");
  await page.screenshot({
    path: "docs/evidence/001-panel-administracion/login-mobile.png",
    fullPage: true,
  });
  await page.close();
  console.log(
    JSON.stringify(
      await verifyAdmin(browser, "http://127.0.0.1:5177"),
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await vite?.close();
  await app.close();
}
