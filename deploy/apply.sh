#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base="${1:?Deployment base required}"
run_id="${2:?Run ID required}"
[[ "$base" =~ ^/[A-Za-z0-9_/-]+$ && "$base" != / && "$base" != *..* ]]
[[ "$run_id" =~ ^[0-9]+$ ]]
exec 9>"$base/deploy.lock"
flock -w 300 9
if [[ -f "$base/deployed-run-id" ]] && (( run_id < $(cat "$base/deployed-run-id") )); then
  echo "A newer deployment already completed; skipping this run."
  rm -f -- image.tar.gz
  exit 0
fi
trap 'rm -f -- image.tar.gz bundle.tar' EXIT
minimum=2.30.0
actual="$(docker compose version --short | sed 's/^v//')"
[[ "$(printf '%s\n' "$minimum" "$actual" | sort -V | head -n1)" == "$minimum" ]] || { echo 'Docker Compose >=2.30 required'; exit 1; }
docker network inspect pulperia-web >/dev/null 2>&1 || docker network create pulperia-web >/dev/null || docker network inspect pulperia-web >/dev/null
docker load -i image.tar.gz
docker compose --env-file deploy.env -f compose.yaml config --quiet
docker compose --env-file deploy.env -f compose.yaml up -d --wait --wait-timeout 180 --remove-orphans
ln -sfn "$PWD" "$base/current"
printf '%s\n' "$run_id" > "$base/deployed-run-id"
echo 'Panel deployment healthy.'
