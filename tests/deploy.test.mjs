import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentFiles } from '../deploy/config.mjs';

test('deploy usa imagen y puerto propios, sin propagar secretos al panel', () => {
  const sha = 'a'.repeat(40);
  assert.equal(deploymentFiles({ GITHUB_SHA: sha, GOOGLE_CLIENT_SECRET: 'private' })['deploy.env'],
    `DEPLOY_IMAGE=pulperia-panel:${sha}\nPANEL_HTTP_PORT=8081\n`);
  assert.ok(deploymentFiles({ GITHUB_SHA: sha, PANEL_HTTP_PORT: '8091' })['deploy.env'].endsWith('PANEL_HTTP_PORT=8091\n'));
  for (const port of ['80', '65536', '8081\nOTHER=value', 'oops']) {
    assert.throws(() => deploymentFiles({ GITHUB_SHA: sha, PANEL_HTTP_PORT: port }), /PANEL_HTTP_PORT/);
  }
  assert.throws(() => deploymentFiles({ GITHUB_SHA: 'main' }), /GITHUB_SHA/);
});
