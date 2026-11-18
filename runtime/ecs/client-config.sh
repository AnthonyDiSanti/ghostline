#!/bin/sh
set -eu
umask 077
temporary=''
complete=false
# Local probes stage client JSON directly; they do not depend on the deployed server initializer's delivery API.
cleanup() {
  [ -z "$temporary" ] || rm -f "$temporary"
  if [ "$complete" != true ]; then rm -f /config/server.json; fi
}
trap cleanup EXIT
prepare() {
  [ "$(stat -f -c %T /config)" = tmpfs ] || return 1
  [ "$(stat -c %u:%g:%a /config)" = '65532:65532:700' ] || return 1
  temporary=$(mktemp /config/.pending-client.XXXXXX) || return 1
  # The same policy keeps probe diagnostics quiet while preserving the existing protocol identity.
  jq -ef /test/log-policy.jq > "$temporary" || return 1
  jq -e 'type == "object"' "$temporary" > /dev/null || return 1
  chmod 0400 "$temporary" || return 1
  mv -f "$temporary" /config/server.json || return 1
  temporary=''
  complete=true
}
if ! prepare 2>/dev/null; then
  printf '%s\n' 'Client preparation failed; details withheld.' >&2
  exit 1
fi
