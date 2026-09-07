#!/usr/bin/env bash
set -Eeuo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unit_dir="${HOME}/.config/systemd/user"
install -d -m 0700 "$unit_dir"
cat >"${unit_dir}/custodyfolio-monitor-evidence.service" <<UNIT
[Unit]
Description=Verify and renew Custody Folio production monitor evidence
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash ${script_dir}/renew-monitor-evidence.sh
TimeoutStartSec=20min
UMask=0077
UNIT
cat >"${unit_dir}/custodyfolio-monitor-evidence.timer" <<'UNIT'
[Unit]
Description=Renew Custody Folio production verification evidence weekly

[Timer]
OnCalendar=Sun *-*-* 08:00:00 UTC
RandomizedDelaySec=15min
Persistent=true
Unit=custodyfolio-monitor-evidence.service

[Install]
WantedBy=timers.target
UNIT
chmod 0600 "${unit_dir}/custodyfolio-monitor-evidence.service" "${unit_dir}/custodyfolio-monitor-evidence.timer"
systemctl --user daemon-reload
systemctl --user enable --now custodyfolio-monitor-evidence.timer
systemctl --user list-timers custodyfolio-monitor-evidence.timer --no-pager
