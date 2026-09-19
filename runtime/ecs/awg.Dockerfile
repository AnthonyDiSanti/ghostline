# Build official stable source for ARM64; the resolver supplies immutable revisions and archive checksums.
FROM golang:1.25.12@sha256:e911f2ff66025cbb90770dd1356526980409da3747264b3c6033b92e10731a8b AS daemon
ARG AWG_COMMIT
ARG AWG_SHA256
ADD --checksum=sha256:${AWG_SHA256} https://codeload.github.com/amnezia-vpn/amneziawg-go/tar.gz/${AWG_COMMIT} /tmp/source.tar.gz
WORKDIR /source
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 && go mod download && go mod verify && \
    go build -trimpath -ldflags '-linkmode external -extldflags "-fno-PIC -static"' -o /usr/bin/amneziawg-go

FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18 AS tools
ARG TOOLS_COMMIT
ARG TOOLS_SHA256
ADD --checksum=sha256:${TOOLS_SHA256} https://codeload.github.com/amnezia-vpn/amneziawg-tools/tar.gz/${TOOLS_COMMIT} /tmp/source.tar.gz
WORKDIR /source
RUN apk add --no-cache build-base=0.5-r4 linux-headers=7.0.0-r1 && tar -xzf /tmp/source.tar.gz --strip-components=1 && make -C src

# Keep only the protocol and existing Ghostline adapters, without a third-party supervisor or installer.
FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18
RUN apk add --no-cache iproute2=7.0.0-r0 iptables=1.8.13-r0 bash=5.3.9-r1
COPY --from=daemon /usr/bin/amneziawg-go /usr/bin/amneziawg-go
COPY --from=tools /source/src/wg /usr/bin/awg
COPY --from=tools /source/src/wg-quick/linux.bash /usr/bin/awg-quick
COPY --from=daemon /source/LICENSE /usr/share/licenses/amneziawg-go/LICENSE
COPY --from=tools /source/COPYING /usr/share/licenses/amneziawg-tools/COPYING
RUN chmod 0755 /usr/bin/awg /usr/bin/awg-quick && \
    ln -s /usr/bin/awg /usr/bin/wg && ln -s /usr/bin/awg-quick /usr/bin/wg-quick
COPY --chmod=755 start.sh /usr/local/bin/ghostline-awg
COPY --chmod=755 awg-start.sh /usr/local/bin/ghostline-ecs-awg
ENTRYPOINT ["/usr/local/bin/ghostline-ecs-awg"]
