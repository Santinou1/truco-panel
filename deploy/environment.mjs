// Fixed resource names keep a testing deployment away from production data.
export function deploymentEnvironment(env, service) {
  const name = env.DEPLOY_ENVIRONMENT || 'production';
  if (!['production', 'testing'].includes(name)) throw new Error('DEPLOY_ENVIRONMENT inválido');
  const testing = name === 'testing';
  const branch = testing ? 'refs/heads/development' : 'refs/heads/main';
  if (env.GITHUB_REF && env.GITHUB_REF !== branch) throw new Error('Rama incompatible con DEPLOY_ENVIRONMENT');
  return {
    DEPLOY_ENVIRONMENT: name,
    DEPLOY_PROJECT: `pulperia-${service}${testing ? '-testing' : ''}`,
    DEPLOY_NETWORK: testing ? 'pulperia-testing-web' : 'pulperia-web',
  };
}

export function deploymentPort(env, key, production, testing) {
  const isTesting = env.DEPLOY_ENVIRONMENT === 'testing';
  const port = env[key] || (isTesting ? testing : production);
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Puerto inválido: ' + key);
  if (isTesting && port !== testing) throw new Error(key + ' debe usar el puerto reservado de testing: ' + testing);
  if (!isTesting && ['8082', '8083', '3003'].includes(port)) throw new Error(key + ' reservado para testing');
  return port;
}
