"""Read the complete reference configuration without altering the source container."""
import base64
import json
import subprocess
import sys


def docker(*args):
    # Capture secret output; the caller writes this stream directly to a protected bundle.
    return subprocess.check_output(["docker", "exec", sys.argv[1], *args], stderr=subprocess.DEVNULL)


names = docker("find", "/opt/amnezia/xray", "-maxdepth", "1", "-type", "f").decode().splitlines()
files = {name.rsplit("/", 1)[1]: base64.b64encode(docker("cat", name)).decode() for name in names}
print(json.dumps({"files": files, "versionText": docker("xray", "version").decode()}))
