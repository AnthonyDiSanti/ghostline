## Failure

Official Bottlerocket 1.65.0, `aws-ecs-3` on ARM64. A finite custom bootstrap image in ECR uses `mode="always"` and `essential=true`. After its selector moved between valid OCI manifests sharing filesystem layers, a controlled reboot logged a successful pull and unpack, then `parent snapshot sha256:… does not exist: not found` while native `host-ctr` created the container. The entrypoint never ran; essential boot halted. A later reboot on the same host succeeded.

## Controlled reproduction

Using containerd client 1.7.33 and server 2.2.7, including Bottlerocket's native host-containerd overlayfs snapshotter, we forced synchronous GC after cached-layer `Snapshotter.Stat` in the separate `Image.Unpack` path. `Unpack` returned nil, but creating a child snapshot failed with the same missing-parent error class. An explicit snapshot lease or `Pull(..., WithPullUnpack, WithPullSnapshotter(DefaultSnapshotter))` survived that GC and another GC after `Pull` returned. [Core-kit `host-ctr`](https://github.com/bottlerocket-os/bottlerocket-core-kit/blob/v16.3.0/sources/host-ctr/cmd/host-ctr/main.go) still pulls and unpacks separately.

## Candidate fix

The [apply-ready patch](https://gist.github.com/AnthonyDiSanti/3a31dd18a14dff65c21b2153fb550a30) moves unpack into `Pull` with the existing snapshotter, retaining the resolver, schema conversion, labels and retry loop. It applies to core-kit v16.3.0 and `develop` at `6b9a6f8`; `go test ./...` passes on `develop` with Go 1.26.1, and `gofmt` is clean. Please review whether this is the preferred repair and whether the GC boundary belongs in an upstream regression test.

The original failed boot did not capture a GC trace. The controlled test demonstrates the vulnerable path and matching error class, not the exact cause of that single boot. We have not built or qualified a modified Bottlerocket OS.
