#!/usr/bin/env python3
"""Disposable SOCKS transport for the isolated AWG test namespace; no logging."""
import select
import socket
import socketserver
import struct


def read_exact(stream, count):
    """TCP messages may arrive in fragments; never interpret partial frames."""
    result = b""
    while len(result) < count:
        part = stream.recv(count - len(result))
        if not part:
            raise EOFError()
        result += part
    return result


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        # Only CONNECT is supported. DNS resolves inside the AWG namespace.
        client = self.request
        client.settimeout(30)
        try:
            version, count = read_exact(client, 2)
            methods = read_exact(client, count)
            if version != 5 or 0 not in methods:
                return
            client.sendall(b"\x05\x00")
            version, command, _, family = read_exact(client, 4)
            if version != 5 or command != 1:
                return
            if family == 3:
                host = read_exact(client, read_exact(client, 1)[0]).decode("ascii")
            elif family == 1:
                host = socket.inet_ntoa(read_exact(client, 4))
            else:
                return
            port = struct.unpack("!H", read_exact(client, 2))[0]
            with socket.create_connection((host, port), timeout=20) as upstream:
                client.sendall(b"\x05\x00\x00\x01" + b"\x00" * 6)
                while True:
                    ready, _, _ = select.select([client, upstream], [], [], 60)
                    if not ready:
                        return
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        (upstream if source is client else client).sendall(data)
        except (OSError, EOFError, UnicodeError):
            return


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("0.0.0.0", 1080), Handler) as server:
    server.serve_forever()
