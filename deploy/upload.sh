#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${PRODUCTION_SSH_HOST:?Missing SSH host}"
: "${PRODUCTION_SSH_USERNAME:?Missing SSH username}"
: "${PRODUCTION_SSH_PRIVATE_KEY:?Missing SSH key}"
: "${PRODUCTION_SSH_KNOWN_HOSTS:?Missing verified known_hosts}"
: "${PRODUCTION_DEPLOY_PATH:?Missing absolute deployment path}"
ssh_port="${PRODUCTION_SSH_PORT:-22}"
[[ "$PRODUCTION_SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]
[[ "$PRODUCTION_SSH_USERNAME" =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ "$ssh_port" =~ ^[0-9]+$ ]] && (( ssh_port > 0 && ssh_port <= 65535 ))
[[ "$PRODUCTION_DEPLOY_PATH" =~ ^/[A-Za-z0-9_/-]+$ && "$PRODUCTION_DEPLOY_PATH" != / && "$PRODUCTION_DEPLOY_PATH" != *..* ]]
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]]
environment="$(sed -n 's/^DEPLOY_ENVIRONMENT=//p' .deploy/deploy.env)"
network="$(sed -n 's/^DEPLOY_NETWORK=//p' .deploy/deploy.env)"
case "$environment" in
  testing)
    [[ "$PRODUCTION_DEPLOY_PATH" == /opt/pulperia/testing/truco-panel && "$network" == pulperia-testing-web ]]
    grep -Fxq 'DEPLOY_PROJECT=pulperia-panel-testing' .deploy/deploy.env
    ;;
  production)
    [[ "$PRODUCTION_DEPLOY_PATH" != */testing/* && "$network" == pulperia-web ]]
    grep -Fxq 'DEPLOY_PROJECT=pulperia-panel' .deploy/deploy.env
    ;;
  *) echo 'Invalid deployment environment'; exit 1 ;;
esac
remote="$PRODUCTION_DEPLOY_PATH/releases/$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
target="$PRODUCTION_SSH_USERNAME@$PRODUCTION_SSH_HOST"
ssh_dir="$(mktemp -d)"
trap 'rm -rf -- "$ssh_dir"; rm -f -- .deploy/*.env .deploy/bundle.tar .deploy/image.tar.gz' EXIT
printf '%s\n' "$PRODUCTION_SSH_PRIVATE_KEY" > "$ssh_dir/key"
printf '%s\n' "$PRODUCTION_SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
options=(-i "$ssh_dir/key" -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=20)
cp deploy/compose.yaml deploy/apply.sh .deploy/
tar -C .deploy -cf .deploy/bundle.tar compose.yaml apply.sh deploy.env image.tar.gz
ssh "${options[@]}" -p "$ssh_port" "$target" "umask 077; mkdir -p '$remote'; chmod 700 '$PRODUCTION_DEPLOY_PATH' '$remote'"
scp "${options[@]}" -P "$ssh_port" .deploy/bundle.tar "$target:$remote/bundle.tar"
ssh "${options[@]}" -p "$ssh_port" "$target" "set -eu; cd '$remote'; tar -xf bundle.tar; rm -f bundle.tar; chmod 600 ./*.env; bash apply.sh '$PRODUCTION_DEPLOY_PATH' '$GITHUB_RUN_ID'"
