import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/api.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { api, ApiError } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

test("precio: envía cookie HttpOnly y cabecera CSRF al backend compartido; conserva 401/403", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/admin/assets");
      assert.equal(options.credentials, "include");
      assert.equal(options.headers["X-Requested-With"], "LaPulperia");
      assert.deepEqual(JSON.parse(options.body), {
        category: "frames",
        assetId: "oro",
        price: 275,
      });
      return new Response('{"price":275}', { status: 200 });
    };
    assert.deepEqual(
      await api("/admin/assets", {
        category: "frames",
        assetId: "oro",
        price: 275,
      }),
      { price: 275 },
    );
    for (const status of [401, 403]) {
      globalThis.fetch = async () =>
        new Response('{"message":"Acceso denegado"}', { status });
      await assert.rejects(
        api("/admin/assets"),
        (error) => error instanceof ApiError && error.status === status,
      );
    }
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await assert.rejects(
      api("/admin/assets"),
      (error) => error instanceof ApiError && error.status === 0,
    );
  } finally {
    globalThis.fetch = original;
  }
});
