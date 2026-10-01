"""Bounded loopback observation of successful reconciliation, without control or secrets."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def snapshot(path, now=None):
    # A stale success must not outlive the kernel's five-second forwarding leases.
    try:
        value = json.loads(path.read_text())
        age = (time.monotonic() if now is None else now) - value['tick']
        if not 0 <= age < 3:
            raise ValueError('Stale reconciliation')
        return {'schema': 1, 'healthy': True, 'peers': value['peers']}
    except (OSError, ValueError, KeyError, TypeError):
        return {'schema': 1, 'healthy': False, 'peers': {}}


def serve(path):
    # One bounded observer thread cannot block lease renewal. Only host loopback can reach this endpoint.
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(1)
            super().setup()

        def do_GET(self):
            if self.path != '/ready':
                self.send_error(404)
                return
            body = json.dumps(snapshot(path)).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            # Readiness reads are not browsing telemetry and need no request log.
            pass

    server = HTTPServer(('127.0.0.1', 51680), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
