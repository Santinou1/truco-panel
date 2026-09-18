import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function deploymentFiles(env) {
  const sha = env.GITHUB_SHA;
  const port = env.PANEL_HTTP_PORT || '8081';
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('GITHUB_SHA inválido');
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('PANEL_HTTP_PORT inválido');
  return { 'deploy.env': `DEPLOY_IMAGE=pulperia-panel:${sha}\nPANEL_HTTP_PORT=${port}\n` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = deploymentFiles(process.env);
  await mkdir('.deploy', { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) await writeFile('.deploy/' + name, content, { mode: 0o600 });
  console.log('Configuración del panel validada.');
}
