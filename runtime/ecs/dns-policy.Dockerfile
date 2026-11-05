# Retain the official CoreDNS binary and certificates; compile only the small health command.
ARG COREDNS_VERSION
ARG COREDNS_DIGEST
FROM coredns/coredns:${COREDNS_VERSION}@${COREDNS_DIGEST} AS coredns
FROM golang:1.25.12@sha256:e911f2ff66025cbb90770dd1356526980409da3747264b3c6033b92e10731a8b AS probe
WORKDIR /src
COPY dns-health.go dns-health_test.go ./
RUN go test dns-health.go dns-health_test.go && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/dns-health dns-health.go
# A fresh inode strips the upstream binary's port-53 file capability before non-root execution.
RUN --mount=type=bind,from=coredns,source=/coredns,target=/tmp/upstream-coredns,ro \
    install -D -m 0755 /tmp/upstream-coredns /out/coredns

FROM scratch
LABEL org.opencontainers.image.title="Ghostline CoreDNS" \
    org.opencontainers.image.description="Private encrypted upstream DNS for VPN engines"
COPY --from=probe /out/coredns /usr/local/bin/coredns
COPY --from=probe /out/dns-health /usr/local/bin/dns-health
COPY --from=coredns /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY dns-policy.Corefile /opt/ghostline/dns-policy.Corefile
COPY LICENSE.coredns /usr/share/licenses/coredns/LICENSE
USER 65532:65532
EXPOSE 5353/udp 5353/tcp
ENTRYPOINT ["/usr/local/bin/coredns", "-conf", "/opt/ghostline/dns-policy.Corefile"]
