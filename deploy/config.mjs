import { deploymentEnvironment, deploymentPort } from './environment.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function deploymentFiles(env) {
  const environment = deploymentEnvironment(env, "panel");
  const sha = env.GITHUB_SHA;
  const port = deploymentPort(env, 'PANEL_HTTP_PORT', '8081', '8083');
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('GITHUB_SHA inválido');
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('PANEL_HTTP_PORT inválido');
  return { 'deploy.env': Object.entries({ ...environment, DEPLOY_IMAGE: `pulperia-panel${env.DEPLOY_ENVIRONMENT === 'testing' ? '-testing' : ''}:${sha}`, PANEL_HTTP_PORT: port }).map(([key, value]) => `${key}=${value}\n`).join('') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = deploymentFiles(process.env);
  await mkdir('.deploy', { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) await writeFile('.deploy/' + name, content, { mode: 0o600 });
  console.log('Configuración del panel validada.');
}
