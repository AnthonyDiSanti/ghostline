FROM amneziavpn/amneziawg-go@sha256:c68009d33df3aef4654db72bf1a7880cfa0a631fe866c50d9ae3dd34ddd7c13a
COPY --chmod=755 start.sh /usr/local/bin/ghostline-awg
COPY --chmod=755 awg-start.sh /usr/local/bin/ghostline-ecs-awg
ENTRYPOINT ["/usr/local/bin/ghostline-ecs-awg"]
