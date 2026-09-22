# Platform-only support; application images and the regional release manifest remain unchanged.
FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18
RUN apk add --no-cache python3=3.14.7-r1 iproute2=7.0.0-r0 iptables=1.8.13-r0 \
    iptables-legacy=1.8.13-r0 ipset=7.24-r0 conntrack-tools=1.4.9-r0 \
    docker-cli=29.5.3-r1 util-linux=2.42.3-r1 coreutils=9.11-r0
COPY network.py /opt/ghostline/network.py
COPY network-probe.py /opt/ghostline/network-probe.py
COPY bottlerocket/*.py /opt/ghostline/
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/opt/ghostline/bootstrap.py"]
