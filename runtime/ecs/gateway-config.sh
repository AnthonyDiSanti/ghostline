#!/bin/sh
set -eu
umask 077
complete=false

# The SDK loader supplies a private stdin pipe; values never become container-creation environment or argv.
unset bundles xray_bundle awg_bundle derp_bundle

cleanup() {
  # No engine can start on failure; discard both protocols if either renderer failed.
  if [ "$complete" != true ]; then
    rm -f /config/xray/server.json /config/xray/.pending.* /config/awg/awg0.conf /config/awg/.pending.*
    rm -f /config/derp/*.crt /config/derp/*.key /config/derp/derper.json /config/derp/public.json
  fi
}
trap cleanup EXIT

prepare() {
  [ "$(stat -f -c %T /config)" = tmpfs ] || return 1
  [ "$(stat -c %u:%g:%a /config)" = '65532:65532:700' ] || return 1
  bundles=$(cat) || return 1
  printf '%s' "$bundles" | jq -e '(.xray | type == "string" and length > 0) and (.awg | type == "string" and length > 0)' > /dev/null || return 1
  # Preserve directory inodes: Docker may have bound these children into waiting engines already.
  [ -d /config/xray ] && [ -d /config/awg ] || return 1
  rm -f /config/xray/server.json /config/awg/awg0.conf || return 1
  # jq's raw join output preserves trailing newlines; shell command substitution would silently trim AWG bytes.
  printf '%s' "$bundles" | jq -jr '.xray' | /usr/local/bin/ghostline-config xray /config/xray || return 1
  printf '%s' "$bundles" | jq -jr '.awg' | /usr/local/bin/ghostline-config awg /config/awg || return 1
  if [ -d /config/derp ]; then
    # A partial/missing identity must fail the whole initializer before any engine becomes eligible.
    printf '%s' "$bundles" | jq -e '.derp | type == "string" and length > 0' > /dev/null || return 1
    rm -f /config/derp/*.crt /config/derp/*.key /config/derp/derper.json /config/derp/public.json || return 1
    printf '%s' "$bundles" | jq -jr '.derp' | /usr/local/bin/derp-tools render --directory /config/derp || return 1
  elif printf '%s' "$bundles" | jq -e '.derp | type == "string" and length > 0' > /dev/null; then
    return 1
  fi
  unset bundles
}

if ! prepare 2>/dev/null; then
  printf '%s\n' 'Configuration preparation failed; details withheld.' >&2
  exit 1
fi
complete=true
