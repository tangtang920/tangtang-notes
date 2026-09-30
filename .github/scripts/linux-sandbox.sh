#!/usr/bin/env bash
set -euo pipefail
# Ubuntu 24+ restricts user namespaces by executable. Grant them only to the
# two test binaries; keep Electron's sandbox and the host's global policy on.
if [[ ! -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
  exit 0
fi
task_root="${GITHUB_WORKSPACE:-$(pwd)}"
task_electron="$(node -p "require('electron')")"
task_profile="$(mktemp)"
trap 'rm -f "$task_profile"' EXIT
cat > "$task_profile" <<EOF
abi <abi/4.0>,
include <tunables/global>

profile tangtang-electron-dev "$task_electron" flags=(unconfined) {
  userns,
}
profile tangtang-notes-test "$task_root/dist/linux-unpacked/tangtang-notes" flags=(unconfined) {
  userns,
}
EOF
sudo install -m 644 "$task_profile" /etc/apparmor.d/tangtang-notes-tests
sudo apparmor_parser -r /etc/apparmor.d/tangtang-notes-tests
