#!/bin/sh
set -eu
# Package notices from the exact checksum-verified compiled dependency graph, including the Go runtime.
destination=$1
shift
cache=$(go env GOMODCACHE)
compiler=$(go env GOROOT)
inventory=$(mktemp)
trap 'rm -f "$inventory" "$inventory.sorted"' EXIT
go list -deps -f '{{with .Module}}{{.Dir}}{{end}}' "$@" > "$inventory"
sort -u "$inventory" > "$inventory.sorted"
mkdir -p "$destination/go"
cp "$compiler/LICENSE" "$destination/go/LICENSE"
while IFS= read -r directory; do
  [ -n "$directory" ] || continue
  case "$directory" in
    "$cache"/*) name=${directory#"$cache"/} ;;
    /source) name=tailscale ;;
    *) printf '%s\n' 'Unexpected module license location.' >&2; exit 1 ;;
  esac
  mkdir -p "$destination/$name"
  found=false
  for filename in LICENSE LICENSE.txt LICENCE LICENCE.txt COPYING NOTICE NOTICE.txt; do
    if [ -f "$directory/$filename" ]; then
      cp "$directory/$filename" "$destination/$name/$filename"
      found=true
    fi
  done
  [ "$found" = true ] || { printf '%s\n' 'Compiled module license is missing.' >&2; exit 1; }
done < "$inventory.sorted"
