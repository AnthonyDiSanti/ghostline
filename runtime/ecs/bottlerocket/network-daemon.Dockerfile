# Ongoing networking has no Docker client, host diagnostics or filesystem preparation package.
FROM alpine:3.24.1@sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18
LABEL org.opencontainers.image.title="Ghostline network daemon" \
    org.opencontainers.image.description="Restricted ECS host networking and renewable forwarding leases; no host filesystem or secret access"
RUN apk add --no-cache python3=3.14.7-r1 iproute2=7.0.0-r0 iptables=1.8.13-r0 \
    ipset=7.24-r0 conntrack-tools=1.4.9-r0
COPY daemon.py discovery.py guard.py network.py readiness.py /opt/ghostline/
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/opt/ghostline/daemon.py"]
