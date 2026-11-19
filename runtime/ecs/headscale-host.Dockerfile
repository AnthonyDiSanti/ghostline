# Generic coordinator storage/diagnostic tooling; the Headscale application image remains upstream-owned.
FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18 AS grpcurl
# Use the release archive for ARM64. This version restores Unix socket dialing.
ADD --checksum=sha256:ad66227d90631da5428b4a5ccf28d63846f0f15649d8b2367df044a59edbb617 https://github.com/fullstorydev/grpcurl/releases/download/v1.9.4/grpcurl_1.9.4_linux_arm64.tar.gz /tmp/grpcurl.tar.gz
RUN mkdir /out && tar -xzf /tmp/grpcurl.tar.gz -C /out grpcurl LICENSE

FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18
RUN apk add --no-cache python3=3.14.10-r1 util-linux=2.42.3-r1 coreutils=9.11-r0 \
    e2fsprogs=1.47.4-r0 docker-cli=29.9.3-r1 iptables=1.8.13-r0 iptables-legacy=1.8.13-r0 openssl=3.5.9-r0
COPY --from=grpcurl /out/grpcurl /usr/local/bin/grpcurl
COPY --from=grpcurl /out/LICENSE /usr/share/licenses/grpcurl/LICENSE
COPY headscale-host.py /opt/ghostline/headscale-host.py
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/opt/ghostline/headscale-host.py"]
