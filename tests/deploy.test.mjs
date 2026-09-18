import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentFiles } from '../deploy/config.mjs';

test('deploy usa imagen y puerto propios, sin propagar secretos al panel', () => {
  const sha = 'a'.repeat(40);
  assert.equal(deploymentFiles({ GITHUB_SHA: sha, GOOGLE_CLIENT_SECRET: 'private' })['deploy.env'],
    `DEPLOY_ENVIRONMENT=production\nDEPLOY_PROJECT=pulperia-panel\nDEPLOY_NETWORK=pulperia-web\nDEPLOY_IMAGE=pulperia-panel:${sha}\nPANEL_HTTP_PORT=8081\n`);
  assert.ok(deploymentFiles({ GITHUB_SHA: sha, PANEL_HTTP_PORT: '8091' })['deploy.env'].endsWith('PANEL_HTTP_PORT=8091\n'));
  for (const port of ['80', '65536', '8081\nOTHER=value', 'oops']) {
    assert.throws(() => deploymentFiles({ GITHUB_SHA: sha, PANEL_HTTP_PORT: port }), /PANEL_HTTP_PORT/);
  }
  assert.throws(() => deploymentFiles({ GITHUB_SHA: 'main' }), /GITHUB_SHA/);
});

const testingEnv = { GITHUB_SHA: 'a'.repeat(40), DEPLOY_ENVIRONMENT: 'testing', GITHUB_REF: 'refs/heads/development' };
test('testing usa recursos propios y rechaza rama, puerto o ambiente incompatibles', () => {
  const files = deploymentFiles(testingEnv);
  assert.match(files['deploy.env'], /^DEPLOY_ENVIRONMENT=testing\nDEPLOY_PROJECT=pulperia-panel-testing\nDEPLOY_NETWORK=pulperia-testing-web\n/);
  assert.ok(files['deploy.env'].includes('DEPLOY_IMAGE=pulperia-panel-testing:' + 'a'.repeat(40)));
  assert.ok(files['deploy.env'].includes('PANEL_HTTP_PORT=8083\n'));
  for (const changes of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF: 'refs/pull/1/merge' }, { DEPLOY_ENVIRONMENT: 'unknown' }, { PANEL_HTTP_PORT: '8081' }]) {
    assert.throws(() => deploymentFiles({ ...testingEnv, ...changes }));
  }
});
