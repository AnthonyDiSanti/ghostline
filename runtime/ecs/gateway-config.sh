#!/bin/sh
set -eu
umask 077
complete=false

# Retain the pair only in shell memory; each child receives its selected bundle, never its sibling's.
# Unset scratch names first so an inherited export attribute cannot propagate them to subprocesses.
unset xray_bundle awg_bundle
xray_bundle=${GHOSTLINE_XRAY_BUNDLE:-}
awg_bundle=${GHOSTLINE_AWG_BUNDLE:-}
unset GHOSTLINE_XRAY_BUNDLE GHOSTLINE_AWG_BUNDLE GHOSTLINE_CONFIG

cleanup() {
  # No engine can start on failure; discard both protocols if either renderer failed.
  if [ "$complete" != true ]; then
    rm -f /config/xray/server.json /config/xray/.pending.* /config/awg/awg0.conf /config/awg/.pending.*
  fi
}
trap cleanup EXIT

prepare() {
  [ "$(stat -f -c %T /config)" = tmpfs ] || return 1
  [ "$(stat -c %u:%g:%a /config)" = '65532:65532:700' ] || return 1
  # Preserve directory inodes: Docker may have bound these children into waiting engines already.
  [ -d /config/xray ] && [ -d /config/awg ] || return 1
  rm -f /config/xray/server.json /config/awg/awg0.conf || return 1
  GHOSTLINE_CONFIG="$xray_bundle" /usr/local/bin/ghostline-config xray /config/xray || return 1
  unset xray_bundle
  GHOSTLINE_CONFIG="$awg_bundle" /usr/local/bin/ghostline-config awg /config/awg || return 1
  unset awg_bundle
}

if ! prepare 2>/dev/null; then
  printf '%s\n' 'Configuration preparation failed; details withheld.' >&2
  exit 1
fi
complete=true
