// Synthetic two-client forwarding proof using the upstream DERP-map and TLS-pin path.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"tailscale.com/derp"
	"tailscale.com/derp/derphttp"
	"tailscale.com/net/netmon"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

func run() error {
	// Address and public certificate pin are explicit; no discovery DNS or insecure test mode is used.
	host := flag.String("host", "", "transport IPv4")
	ip := flag.String("identity", "", "certificate IPv4")
	pin := flag.String("pin", "", "public leaf certificate pin")
	port := flag.Int("port", 8443, "DERP TLS port")
	flag.Parse()
	if net.ParseIP(*host) == nil || net.ParseIP(*ip) == nil || *port < 1 || *port > 65535 || len(*pin) != len("sha256-raw:")+64 {
		return errors.New("invalid probe inputs")
	}
	region := &tailcfg.DERPRegion{RegionID: 990, RegionCode: "gl-proof", RegionName: "Ghostline proof", Nodes: []*tailcfg.DERPNode{{
		Name: "gl-proof-1", RegionID: 990, HostName: *ip, IPv4: *host, IPv6: "none", DERPPort: *port, CertName: *pin,
	}}}
	monitor := netmon.NewStatic()
	defer monitor.Close()
	firstKey, secondKey := key.NewNode(), key.NewNode()
	logf := func(string, ...any) {} // Public proof emits only aggregate outcomes, never client keys/connection logs.
	first := derphttp.NewRegionClient(firstKey, logf, monitor, func() *tailcfg.DERPRegion { return region })
	second := derphttp.NewRegionClient(secondKey, logf, monitor, func() *tailcfg.DERPRegion { return region })
	defer first.Close()
	defer second.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	if err := first.Connect(ctx); err != nil {
		return errors.New("first pinned DERP connection failed")
	}
	if err := second.Connect(ctx); err != nil {
		return errors.New("second pinned DERP connection failed")
	}
	payload := make([]byte, 1024)
	if _, err := rand.Read(payload); err != nil {
		return err
	}
	result := make(chan error, 1)
	go func() {
		for {
			message, err := second.Recv()
			if err != nil {
				result <- errors.New("DERP receive failed")
				return
			}
			if packet, ok := message.(derp.ReceivedPacket); ok {
				if packet.Source != firstKey.Public() || !bytes.Equal(packet.Data, payload) {
					result <- errors.New("relay payload/source mismatch")
					return
				}
				result <- nil
				return
			}
		}
	}()
	// Retry only disposable test data while the second server-side registration settles.
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := first.Send(secondKey.Public(), payload); err != nil {
				return errors.New("DERP send failed")
			}
		case err := <-result:
			if err != nil {
				return err
			}
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"relayBytes": len(payload), "exactPayload": true, "upstreamMapPin": true})
		case <-ctx.Done():
			return errors.New("DERP transfer deadline exceeded")
		}
	}
}

func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "DERP proof failed; details withheld.")
		os.Exit(1)
	}
}
