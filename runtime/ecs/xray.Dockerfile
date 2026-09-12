FROM alpine:3.15@sha256:6a0657acfef760bd9e293361c9b558e98e7d740ed0dffca823d17098a4ffddf5
RUN apk add --no-cache jq
COPY Xray-linux-64.zip /tmp/xray.zip
RUN echo '8195d909f1109b8f3d99eefe401a3c451d7bf4af71f24d3815420f77e5dd2a40  /tmp/xray.zip' | sha256sum -c - \
    && unzip /tmp/xray.zip -d /usr/bin && chmod +x /usr/bin/xray && rm /tmp/xray.zip
COPY --chmod=755 xray-start.sh /usr/local/bin/ghostline-xray
ENTRYPOINT ["/usr/local/bin/ghostline-xray"]
