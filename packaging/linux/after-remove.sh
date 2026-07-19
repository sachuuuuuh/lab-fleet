#!/bin/sh
set -e

if [ "$1" = "purge" ]; then
  systemctl disable --now lab-fleet-agent.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/lab-fleet-agent.service
  rm -rf /var/lib/lab-fleet
  systemctl daemon-reload
fi

