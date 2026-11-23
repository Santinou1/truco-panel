import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
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
export async function createTestReferralOwner() {
  assertTestMail();
  const { UsersService } = require("./dist/modules/users/users.service.js");
  const { ReferralsService } = require("./dist/modules/referrals/referrals.service.js");
  const id = await testApp.get(UsersService).google({
    sub: randomUUID(), email: "referido-fixture@example.test", name: "Invitador de prueba",
  });
  return { id, summary: () => testApp.get(ReferralsService).summary(id) };
}

export async function createTestReferralLinks(code) {
  assertTestMail();
  const { UsersService } = require("./dist/modules/users/users.service.js");
  const { ReferralsService } = require("./dist/modules/referrals/referrals.service.js");
  const users = testApp.get(UsersService);
  const referrals = testApp.get(ReferralsService);
  for (const [name, alias, games] of [
    ["Amiga por empezar", "por-empezar", 0],
    ["Amigo en camino", "en-camino", 4],
    ["Amiga premiada", "premiada", 10],
  ]) {
    const sub = randomUUID();
    const id = await users.google({ sub, name, email: alias + "@example.test" });
    await referrals.link(id, code);
    await testPool.query(
      "UPDATE identity.referrals SET games=$2::smallint, rewarded_at=CASE WHEN $2::smallint=10 THEN now() END WHERE referred_id=$1",
      [id, games],
    );
  }
}

export async function createTestTransfers() {
  assertTestMail();
  const { UsersService } = require("./dist/modules/users/users.service.js");
  const email = `transferencias-${randomUUID()}@example.test`;
  const userId = await testApp.get(UsersService).google({
    sub: randomUUID(), email, name: "Titular de prueba",
  });
  const credited = randomUUID(), review = randomUUID(), issuanceError = randomUUID();
  const pending = randomUUID(), rejected = randomUUID();
  const providerReference = String(randomInt(1000000000, 1000000000000));
  const deposit = randomUUID();
  await testPool.transaction(async tx => {
    await tx.query("INSERT INTO identity.personas(user_id,details_ciphertext) VALUES($1,'private-fixture')", [userId]);
    for (const [id, cvu] of [[credited, "0000000000000000000001"], [review, "0000000000000000000002"], [issuanceError, null]]) {
      await tx.query(`
        INSERT INTO economy_fiat.deposit_orders(id,user_id,request_id,company_id,amount_minor,alias,cvu,attempts,expires_at)
        VALUES($1,$2,$3,'77',50000,$4,$5::text,1,CASE WHEN $5::text IS NOT NULL THEN now()+interval '30 minutes' END)
      `, [id, userId, randomUUID(), "fixture." + id, cvu]);
    }
    await tx.query(`
      INSERT INTO economy_fiat.deposit_transactions(id,order_id,company_id,provider_transaction_id,gross_minor,net_minor,review_reason)
      VALUES($1,$2,'77',$3,50000,48675,NULL),($4,$5,'77',$6,50000,48675,'origin_unconfirmed')
    `, [deposit, credited, providerReference, randomUUID(), review, String(randomInt(1000000000, 1000000000000))]);
    await tx.query("INSERT INTO economy_fiat.journal_entries(deposit_id,user_id,amount_minor) VALUES($1,$2,48675)",
      [deposit, userId]);
    await tx.query('UPDATE economy_fiat.deposit_transactions SET cresium_fee_minor=1325 WHERE order_id=$1',[review]);
    await tx.query(`
      INSERT INTO economy_fiat.cresium_audit(id,order_id,company_id,operation,outcome,http_status,response_ciphertext)
      VALUES($1,$2,'77','create_order','provider_error',500,'private-fixture')
    `, [randomUUID(), issuanceError]);
    await tx.query(`
      INSERT INTO economy_fiat.withdrawal_destinations(user_id,account_fingerprint,account_ciphertext,id)
      VALUES($1,'fixture','private-fixture',gen_random_uuid())
    `, [userId]);
    for (const id of [pending, rejected]) {
      await tx.query(`
        INSERT INTO economy_fiat.withdrawals(id,user_id,request_id,company_id,environment,amount_minor,
          account_fingerprint,account_type,account_suffix)
        VALUES($1,$2,$3,'77','sandbox',20000,'fixture','CBU','0001')
      `, [id, userId, randomUUID()]);
    }
    await tx.query(`
      UPDATE economy_fiat.withdrawals
      SET status='awaiting_signature',provider_address_id='123',provider_transaction_id=$2,net_minor=19350
      WHERE id=$1
    `, [pending, String(randomInt(1000000000, 1000000000000))]);
    await tx.query("UPDATE economy_fiat.withdrawals SET status='failed' WHERE id=$1", [rejected]);
    await tx.query(`
      INSERT INTO economy_fiat.cresium_audit(id,withdrawal_id,company_id,operation,outcome,http_status,created_at)
      SELECT gen_random_uuid(),$1,'77','withdrawal_lookup_transaction','received',200,now()-n*interval '1 second'
      FROM generate_series(1,50) AS n
    `, [rejected]);
  });
  return { email, userId, credited, review, issuanceError, rejected, providerReference };
}

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
    NODE_ENV: "test",
    LOBBY_ACTIVITY_ENABLED: "1",
    INTERNAL_PLAY_ENABLED: "1",
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
