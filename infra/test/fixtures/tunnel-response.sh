#!/bin/sh
set -eu
# A random response reachable inside the server namespace proves encrypted application-data delivery.
while :; do
  printf 'HTTP/1.1 200 OK\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#1}" "$1" | nc -l -p 8080 >/dev/null
done
