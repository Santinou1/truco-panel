import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm, copyFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { deploymentFiles } from './config.mjs';

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180000 });
  if (result.status !== 0) throw new Error(`Docker ${args[0]}: ${result.stderr || result.error?.message}`);
  return result.stdout.trim();
}
async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Container readiness timeout');
}

const sha = process.env.GITHUB_SHA || '0'.repeat(40);
const testing = process.env.DEPLOY_ENVIRONMENT === 'testing';
const image = `pulperia-panel${testing ? '-testing' : ''}:${sha}`;
const id = `pulperia-panel-smoke-${process.pid}-${Date.now()}`;
const runtime = resolve('.runtime');
await mkdir(runtime, { recursive: true });
const dir = await mkdtemp(join(runtime, 'panel-smoke-'));
const containers = [];
let networkCreated = false, browser;
try {
  await writeFile(join(dir, 'deploy.env'), deploymentFiles({ GITHUB_SHA: sha, DEPLOY_ENVIRONMENT: process.env.DEPLOY_ENVIRONMENT })['deploy.env']);
  await copyFile('deploy/compose.yaml', join(dir, 'compose.yaml'));
  const compose = JSON.parse(docker('compose', '--env-file', join(dir, 'deploy.env'), '-f', join(dir, 'compose.yaml'), 'config', '--format', 'json'));
  assert.equal(compose.name, testing ? 'pulperia-panel-testing' : 'pulperia-panel');
  assert.equal(compose.services.web.ports[0].host_ip, '127.0.0.1');
  assert.equal(String(compose.services.web.ports[0].published), testing ? '8083' : '8081');
  assert.equal(compose.services.web.image, image);
  assert.equal(compose.networks.web.name, testing ? 'pulperia-testing-web' : 'pulperia-web');
  assert.equal(compose.networks.web.external, true);

  docker('network', 'create', id); networkCreated = true;
  const fixture = id + '-api'; containers.push(fixture);
  docker('run', '-d', '--name', fixture, '--network', id, '--network-alias', 'truco-api',
    '--mount', `type=bind,source=${resolve('deploy/proxy-fixture.mjs')},target=/fixture.mjs,readonly`,
    'node:22-bookworm-slim', 'node', '/fixture.mjs');
  const web = id + '-web'; containers.push(web);
  docker('run', '-d', '--name', web, '--network', id, '-p', '127.0.0.1::80', image);
  const base = 'http://' + docker('port', web, '80').split('\n')[0];
  await waitFor(base + '/healthz');
  docker('exec', web, 'nginx', '-t');
  const response = await fetch(base + '/');
  const index = await response.text();
  assert.ok(index.includes('<div id="root">'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await (await fetch(base + '/auth/callback')).text(), index);
  for (const font of ['Rye/Rye-Regular.ttf', 'Bree_Serif/BreeSerif-Regular.ttf']) assert.equal((await fetch(base + '/fonts/' + font)).status, 200);
  for (const path of ['/assets/missing.js', '/media/missing.webp']) assert.equal((await fetch(base + path)).status, 404);
  const js = index.match(/src="([^\"]+\.js)"/)[1];
  assert.equal((await fetch(base + js)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(docker('exec', web, 'sh', '-c', 'find /usr/share/nginx/html -type f -name "*.webp"'), '');

  await waitFor(base + '/api/health/ready');
  const proxy = await fetch(base + '/api/check?one=two', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Requested-With': 'LaPulperia',
    'X-Forwarded-For': '203.0.113.9', 'X-Forwarded-Proto': 'https',
    Origin: 'https://panel.example.com', Cookie: 'smoke=fixture',
  }, body: '{"price":250}' });
  assert.deepEqual(await proxy.json(), {
    method: 'POST', url: '/api/check?one=two', body: '{"price":250}',
    ip: '203.0.113.9', proto: 'https', origin: 'https://panel.example.com',
    requestedWith: 'LaPulperia', cookie: 'smoke=fixture',
  });
  assert.match(proxy.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/auth/callback');
  await expect(page.getByRole('heading', { name: 'Entrá a la administración' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir al juego' })).toHaveAttribute('href', process.env.VITE_GAME_URL || 'https://lapulperia.cloud');
  assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.src.startsWith('https://lapulperia.cloud/media/'))));
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Panel Docker: SPA, fuentes, imágenes por URL, proxy/cookies y acceso en navegador aprobados. API de transporte simulada; sin OAuth/DB real.');
} finally {
  await browser?.close();
  for (const name of containers.reverse()) spawnSync('docker', ['rm', '-fv', name], { stdio: 'ignore' });
  if (networkCreated) spawnSync('docker', ['network', 'rm', id], { stdio: 'ignore' });
  assert.ok(dir.startsWith(runtime + sep));
  await rm(dir, { recursive: true, force: true });
}
