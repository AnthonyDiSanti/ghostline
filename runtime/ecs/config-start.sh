#!/bin/sh
set -eu
umask 077
temporary=''
directory=${2:-/config}

# Protocol directories share a writer UID; AWG's existing root engine reads through its dedicated group.
case "${1:-}" in
  xray) filename=server.json; directory_mode=700; file_mode=400 ;;
  awg) filename=awg0.conf; directory_mode=750; file_mode=440 ;;
  *) exit 2 ;;
esac

cleanup() {
  # Failed preparation must not leave a partial configuration for a later engine.
  if [ -n "$temporary" ]; then rm -f -- "$temporary"; fi
}
trap cleanup EXIT

prepare() {
  # Never fall back to disk or swap when a host or test omitted the protected RAM mount.
  [ "$(stat -f -c %T "$directory")" = tmpfs ] || return 1
  if ! awk '$2 == "/config" && $3 == "tmpfs" && ("," $4 ",") ~ /,noswap,/ { found=1 } END { exit !found }' /proc/mounts; then
    [ "$(wc -l < /proc/swaps)" -eq 1 ] || return 1
  fi
  [ "$(stat -c %u:%g:%a "$directory")" = "65532:65532:$directory_mode" ] || return 1
  # Fixed ports enforce stop-first task replacement, so no old engine may be reading this volume.
  rm -f "$directory/$filename" "$directory"/.pending.* || return 1
  temporary=$(mktemp "$directory/.pending.XXXXXX") || return 1
  if [ "$filename" = server.json ]; then
    encoded=$(printf '%s' "${GHOSTLINE_CONFIG:-}" | jq -er '
      .files["server.json"] | select(type == "string" and length > 0) |
      select(test("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"))') || return 1
    unset GHOSTLINE_CONFIG
    printf '%s' "$encoded" | base64 -d > "$temporary" || return 1
    unset encoded
    jq -e 'type == "object"' "$temporary" > /dev/null || return 1
  else
    printf '%s' "${GHOSTLINE_CONFIG:-}" > "$temporary" || return 1
    unset GHOSTLINE_CONFIG
    # Validate the server envelope without interpreting hooks or changing a single credential byte.
    # The protocol engine remains responsible for detailed AWG option validation via setconf.
    awk '
      function peer_valid() { return public_key == 1 && allowed == 1 }
      /^[[:space:]]*(#.*)?$/ { next }
      /^\[Interface\]$/ { if (section != "") exit 1; section="interface"; interfaces++; next }
      /^\[Peer\]$/ {
        if (section == "" || (section == "peer" && !peer_valid())) exit 1
        section="peer"; peers++; public_key=0; allowed=0; next
      }
      {
        if (section == "" || $0 !~ /^[A-Za-z][A-Za-z0-9]*[[:space:]]*=/) exit 1
        name=$0; sub(/[[:space:]]*=.*/, "", name)
        value=$0; sub(/^[^=]*=[[:space:]]*/, "", value); sub(/[[:space:]]*$/, "", value)
        if (value == "" || name ~ /^(PreUp|PostUp|PreDown|PostDown|SaveConfig)$/) exit 1
        if (name ~ /^(PrivateKey|PublicKey|PresharedKey|HeaderProtectionKey)$/ &&
            (length(value) != 44 || value !~ /^[A-Za-z0-9+\/]+=$/)) exit 1
        if (name == "PrivateKey") { if (section != "interface") exit 1; private_key++ }
        if (name == "ListenPort") { if (section != "interface" || value != "443") exit 1; listen++ }
        if (name == "PublicKey") { if (section != "peer") exit 1; public_key++ }
        if (name == "AllowedIPs") { if (section != "peer") exit 1; allowed++ }
      }
      END { if (interfaces != 1 || private_key != 1 || listen != 1 || peers < 1 || !peer_valid()) exit 1 }
    ' "$temporary" || return 1
  fi
  chmod "$file_mode" "$temporary" || return 1
  mv -f "$temporary" "$directory/$filename" || return 1
  temporary=''
}

if ! prepare 2>/dev/null; then
  printf '%s\n' 'Configuration preparation failed; details withheld.' >&2
  exit 1
fi
