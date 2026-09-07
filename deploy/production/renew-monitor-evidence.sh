#!/usr/bin/env bash
set -Eeuo pipefail
# Refresh operational evidence only after real production checks and cleanup pass.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
container="losttofound-losttofound-1"
exec 9>/srv/losttofound/state/monitor-evidence.lock
flock -n 9 || exit 0
verified_date="$(date -u +%F)"
# Run login checks before deliberately triggering the edge rate limiter.
for verifier in verify-two-user-isolation verify-malware-scanner verify-edge-controls; do
  timeout 300 docker exec -i "$container" node --input-type=module <"${app_root}/scripts/${verifier}.mjs"
done
# Reuse the deployed image; this maintenance job does not build or release code.
image="$(docker inspect "$container" --format '{{.Config.Image}}')"
[[ "$image" =~ ^losttofound:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]
export LOSTTOFOUND_IMAGE_TAG="${image#losttofound:}"
next_env="$(mktemp "${env_file}.next.XXXXXX")"
trap 'rm -f "$next_env"' EXIT
awk -v checked="$verified_date" '
  !/^(MALWARE_SCANNER_TESTED_AT|EDGE_CONTROLS_TESTED_AT|TWO_USER_ISOLATION_TESTED_AT)=/ { print }
  END {
    print "MALWARE_SCANNER_TESTED_AT=" checked
    print "EDGE_CONTROLS_TESTED_AT=" checked
    print "TWO_USER_ISOLATION_TESTED_AT=" checked
  }
' "$env_file" >"$next_env"
chmod 0600 "$next_env"
cp -p "$env_file" "${env_file}.before-monitor-renewal"
mv "$next_env" "$env_file"
docker compose --env-file "$env_file" -f "${script_dir}/compose.yml" up -d --no-build --no-deps --wait --wait-timeout 120 losttofound
curl --fail --silent --show-error https://custodyfolio.com/api/records/readiness >/dev/null
echo "Monitor evidence renewed and production readiness verified for ${verified_date}."
