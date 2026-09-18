import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
const backend = resolve("../truco-back");
const require = createRequire(resolve(backend, "package.json"));
let fixture;
export function assertTestMail() {
  if (!fixture)
    throw new Error(
      "Ejecutar npm run test:browser para usar el proveedor de correo simulado.",
    );
}
let testPool;
let testApp;

// Only this isolated browser-test database is used; never creates a production admin.
export async function prepareTestAdmin(password) {
  assertTestMail();
  const email = "soporte@lapulperia.cloud";
  const { UsersService } = require("./dist/modules/users/users.service.js");
  const { passwordHash } = require("./dist/modules/auth/password.js");
  const existing = (
    await testPool.query(
      "SELECT id FROM identity.users WHERE kind='email' AND email=$1",
      [email],
    )
  ).rows[0];
  const userId =
    existing?.id ||
    (await testApp.get(UsersService).register({
      email,
      password,
      username: "SoporteAdminBrowser",
      avatarId: "paisano",
    }));
  await testPool.query("DELETE FROM identity.sessions WHERE user_id=$1", [
    userId,
  ]);
  await testPool.query(
    "DELETE FROM identity.email_challenges WHERE user_id=$1",
    [userId],
  );
  await testPool.query(
    "UPDATE identity.users SET role='user',email_verified_at=NULL WHERE id=$1",
    [userId],
  );
  await testPool.query(
    "UPDATE identity.email_credentials SET password_hash=$2 WHERE user_id=$1",
    [userId, await passwordHash(password)],
  );
  return { userId, email };
}
export async function revokeTestAdmin(userId) {
  assertTestMail();
  await testPool.query(
    "UPDATE identity.users SET role='user' WHERE id=$1 AND email='soporte@lapulperia.cloud'",
    [userId],
  );
}
export function testOtp(email) {
  const code = fixture?.inbox.get(email.toLowerCase())?.code;
  if (!code)
    throw new Error(
      "Usar npm run test:browser: OTP disponible únicamente en el proveedor simulado en memoria.",
    );
  return code;
}
export async function startBrowserApi(port = 3004) {
  require("reflect-metadata");
  const { Pool } = require("pg");
  const env = {
    ...require("dotenv").parse(
      await readFile(resolve(backend, ".env"), "utf8").catch(() => ""),
    ),
    ...process.env,
  };
  const dbUrl = new URL(env.TEST_DATABASE_URL || env.DATABASE_URL);
  dbUrl.pathname = "/pulperia_panel_browser_test";
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  try {
    if (
      !(
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          "pulperia_panel_browser_test",
        ])
      ).rowCount
    )
      await admin.query("CREATE DATABASE pulperia_panel_browser_test");
  } finally {
    await admin.end();
  }
  const { migrate } = await import(
    pathToFileURL(resolve(backend, "scripts/migrate.mjs"))
  );
  await migrate(dbUrl.toString());
  const { emailFixture } = await import(
    pathToFileURL(resolve(backend, "tests/email-fixture.mjs"))
  );
  fixture = emailFixture();
  const { Test } = require("@nestjs/testing");
  const { AppModule } = require("./dist/app.module.js");
  const { CONFIG, readConfig } = require("./dist/config.js");
  const { configureApp } = require("./dist/bootstrap.js");
  const { EmailProvider } = require("./dist/modules/email/email.provider.js");
  const { Database } = require("./dist/database/database.module.js");
  const config = readConfig({
    DATABASE_URL: dbUrl.toString(),
    ...fixture.config,
    PORT: String(port),
    ADMIN_PANEL_URL: "http://127.0.0.1:5177",
    APP_URL: `http://localhost:${port}`,
    ALLOWED_ORIGINS: `http://localhost:${port},http://localhost:5177,http://127.0.0.1:5177`,
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(EmailProvider)
    .useValue(fixture.provider)
    .compile();
  const app = configureApp(
    module.createNestApplication({ logger: false, rawBody: true }),
  );
  await app.listen(port, "127.0.0.1");
  testPool = app.get(Database);
  testApp = app;
  return app;
}
