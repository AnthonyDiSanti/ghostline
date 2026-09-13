#!/bin/sh
set -eu
umask 077
temporary=''

cleanup() {
  # Failed preparation must never leave a partial configuration for the engine.
  if [ -n "$temporary" ]; then rm -f -- "$temporary"; fi
}
trap cleanup EXIT

prepare() {
  # Decode only the engine file, preserving its bytes and withholding parser diagnostics.
  encoded=$(printf '%s' "${GHOSTLINE_CONFIG:-}" | jq -er '
    .files["server.json"] | select(type == "string" and length > 0) |
    select(test("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"))') || return 1
  unset GHOSTLINE_CONFIG
  temporary=$(mktemp /config/.server.XXXXXX) || return 1
  printf '%s' "$encoded" | base64 -d > "$temporary" || return 1
  unset encoded
  jq -e 'type == "object"' "$temporary" > /dev/null || return 1
  chmod 0400 "$temporary" || return 1
  chown 65532:65532 "$temporary" || return 1
  mv -f "$temporary" /config/server.json || return 1
  temporary=''
  chmod 0700 /config || return 1
  chown 65532:65532 /config || return 1
}

if ! prepare 2>/dev/null; then
  printf '%s\n' 'Xray configuration preparation failed; details withheld.' >&2
  exit 1
fi
