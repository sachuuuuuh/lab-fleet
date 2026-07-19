#!/bin/sh
set -e

if ! getent group labfleet >/dev/null 2>&1; then
  addgroup --system labfleet
fi
if ! id labfleet >/dev/null 2>&1; then
  adduser --system --ingroup labfleet --home /var/lib/lab-fleet --no-create-home --shell /usr/sbin/nologin labfleet
fi

install -d -o labfleet -g labfleet -m 0700 /var/lib/lab-fleet
install -m 0644 "/opt/Lab Fleet/resources/agent/lab-fleet-agent.service" /etc/systemd/system/lab-fleet-agent.service
chmod 0755 "/opt/Lab Fleet/resources/agent/lab-fleet-agent" "/opt/Lab Fleet/resources/agent/lab-fleetctl"

if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -a -G labfleet "$SUDO_USER" || true
fi

systemctl daemon-reload
systemctl enable --now lab-fleet-agent.service

