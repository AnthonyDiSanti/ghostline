# Runtime lineage: AmneziaVPN 5.0.1.5, server_scripts/xray. Keep its Alpine family for migration.
FROM alpine:3.15@sha256:6a0657acfef760bd9e293361c9b558e98e7d740ed0dffca823d17098a4ffddf5
COPY Xray-linux-64.zip /tmp/xray.zip
RUN echo '8195d909f1109b8f3d99eefe401a3c451d7bf4af71f24d3815420f77e5dd2a40  /tmp/xray.zip' | sha256sum -c - \
    && unzip /tmp/xray.zip -d /usr/bin \
    && chmod +x /usr/bin/xray \
    && rm /tmp/xray.zip
WORKDIR /usr/bin
# Keep the real process in the foreground so Docker observes failure and restarts it.
ENTRYPOINT ["/usr/bin/xray", "run", "-config", "/opt/amnezia/xray/server.json"]
