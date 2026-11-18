# Use upstream's exact forked toolchain; the source and toolchain downloads are independently checksum-bound.
FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18 AS build
ARG DERP_COMMIT
ARG DERP_SHA256
ARG DERP_VERSION
ARG DERP_GO_REV
ARG DERP_GO_SHA256
ADD --checksum=sha256:${DERP_GO_SHA256} https://github.com/tailscale/go/releases/download/build-${DERP_GO_REV}/linux-arm64.tar.gz /tmp/go.tar.gz
ADD --checksum=sha256:${DERP_SHA256} https://codeload.github.com/tailscale/tailscale/tar.gz/${DERP_COMMIT} /tmp/source.tar.gz
WORKDIR /source
RUN mkdir -p /usr/local/go && tar -xzf /tmp/go.tar.gz -C /usr/local/go --strip-components=1 && \
    tar -xzf /tmp/source.tar.gz --strip-components=1 && test "$(cat go.toolchain.rev)" = "${DERP_GO_REV}"
ENV PATH="/usr/local/go/bin:${PATH}" CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go mod download && go mod verify
COPY derp-tools.go derp-tools_test.go cmd/ghostline-derp-tools/
RUN go test ./cmd/ghostline-derp-tools && \
    go build -trimpath -ldflags="-s -w -X tailscale.com/version.longStamp=${DERP_VERSION} -X tailscale.com/version.shortStamp=${DERP_VERSION} -X tailscale.com/version.gitCommitStamp=${DERP_COMMIT}" -o /out/derper ./cmd/derper && \
    go build -trimpath -ldflags='-s -w' -o /out/derp-tools ./cmd/ghostline-derp-tools

# The initializer reuses this exact renderer build while retaining its existing private shell/jq boundary.
FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS gateway-config
RUN apk add --no-cache jq=1.8.2-r0
COPY --from=build /out/derp-tools /usr/local/bin/derp-tools
COPY --chmod=755 config-start.sh /usr/local/bin/ghostline-config
COPY --chmod=755 gateway-config.sh /usr/local/bin/ghostline-gateway-config
COPY xray-log-policy.jq /usr/local/share/ghostline/xray-log-policy.jq
ENTRYPOINT ["/usr/local/bin/ghostline-gateway-config"]

# Probe libraries remain test-only; the runtime image contains no synthetic client or credentials.
FROM build AS probe-build
COPY derp-probe.go cmd/ghostline-derp-probe/main.go
RUN go build -trimpath -ldflags='-s -w' -o /out/derp-probe ./cmd/ghostline-derp-probe

FROM scratch AS proof
COPY --from=probe-build /out/derp-probe /usr/local/bin/derp-probe
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/derp-probe"]

FROM scratch AS runtime
LABEL org.opencontainers.image.title="Ghostline DERP and STUN" \
    org.opencontainers.image.description="Pinned official Tailscale derper with private certificate rendering and bounded health checks"
COPY --from=build /out/derper /out/derp-tools /usr/local/bin/
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /source/LICENSE /usr/share/licenses/tailscale/LICENSE
USER 65532:65532
EXPOSE 8443/tcp 3478/udp
ENTRYPOINT ["/usr/local/bin/derper"]
