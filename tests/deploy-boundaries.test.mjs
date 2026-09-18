import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const service = 'panel';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
// No actual SSH runs: the accepted control reaches a stub which stops the upload.
const command = 'ssh() { echo SSH_STUB_REACHED; return 90; }; export -f ssh; exec bash deploy/upload.sh';

test('upload rechaza cruces de ambiente antes de SSH y acepta la ruta dedicada de testing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pulperia-upload-boundary-'));
  try {
    await mkdir(join(dir, 'deploy'));
    await mkdir(join(dir, '.deploy'));
    for (const file of ['upload.sh', 'apply.sh', 'compose.yaml']) await copyFile(resolve('deploy', file), join(dir, 'deploy', file));
    for (const [environment, project, network, path, accepted] of [
      ['testing', `pulperia-${service}-testing`, 'pulperia-testing-web', `/opt/pulperia/truco-${service}`, false],
      ['production', `pulperia-${service}`, 'pulperia-web', `/opt/pulperia/testing/truco-${service}`, false],
      ['testing', `pulperia-${service}`, 'pulperia-testing-web', `/opt/pulperia/testing/truco-${service}`, false],
      ['testing', `pulperia-${service}-testing`, 'pulperia-web', `/opt/pulperia/testing/truco-${service}`, false],
      ['testing', `pulperia-${service}-testing`, 'pulperia-testing-web', `/opt/pulperia/testing/truco-${service}`, true],
    ]) {
      await writeFile(join(dir, '.deploy/deploy.env'), `DEPLOY_ENVIRONMENT=${environment}\nDEPLOY_PROJECT=${project}\nDEPLOY_NETWORK=${network}\n`);
      await writeFile(join(dir, '.deploy/image.tar.gz'), 'local test fixture');
      const result = spawnSync(bash, ['-c', command], {
        cwd: dir, encoding: 'utf8', timeout: 15000,
        env: { ...process.env, PRODUCTION_SSH_HOST: 'example.invalid', PRODUCTION_SSH_USERNAME: 'deploy', PRODUCTION_SSH_PORT: '22',
          PRODUCTION_SSH_PRIVATE_KEY: 'test-fixture-only', PRODUCTION_SSH_KNOWN_HOSTS: 'test-fixture-only',
          PRODUCTION_DEPLOY_PATH: path, DEPLOY_RUNTIME_FILES: '', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' },
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.includes('SSH_STUB_REACHED'), accepted, result.stderr);
      if (accepted) assert.equal(result.status, 90);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
