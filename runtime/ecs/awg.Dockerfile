# Match the daemon/tools source versions in the deployed amd64 image; upstream publishes no ARM64 image.
FROM golang:1.25.12@sha256:e911f2ff66025cbb90770dd1356526980409da3747264b3c6033b92e10731a8b AS daemon
ADD --checksum=sha256:10bf7458e090bf52f87df27adcd3904a60e4d17fab844d9415e46379147f1ab4 https://codeload.github.com/amnezia-vpn/amneziawg-go/tar.gz/b5928efb6ca19f0153958460c3d141f04abc5c2e /tmp/source.tar.gz
WORKDIR /source
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 && go mod download && go mod verify && \
    go build -trimpath -ldflags '-linkmode external -extldflags "-fno-PIC -static"' -o /usr/bin/amneziawg-go

FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18 AS tools
ADD --checksum=sha256:22438f231d39ea27e4bdc69707ec3103357f3cecc9ad3eecba18a61e5b39c9b9 https://codeload.github.com/amnezia-vpn/amneziawg-tools/tar.gz/ee0f0a9aa34ff0a0da4b3433b9512781cfe02843 /tmp/source.tar.gz
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
