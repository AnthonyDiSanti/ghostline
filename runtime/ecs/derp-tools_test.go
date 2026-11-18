package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func identityFixture(t *testing.T) ([]byte, bundle, publicIdentity) {
	// Every test uses disposable private identities; no fixture key is embedded in source or output.
	t.Helper()
	directory := t.TempDir()
	now := time.Now()
	if err := provision(directory, "192.0.2.10", now); err != nil {
		t.Fatal("fixture provisioning failed")
	}
	data, err := os.ReadFile(filepath.Join(directory, "bundle.json"))
	if err != nil {
		t.Fatal("fixture read failed")
	}
	b, public, err := decodeBundle(data, now)
	if err != nil {
		t.Fatal("fixture validation failed")
	}
	return data, b, public
}

func TestIdentityValidation(t *testing.T) {
	data, b, _ := identityFixture(t)
	if len(data) > 4096 {
		t.Fatal("identity exceeds standard SecureString capacity")
	}
	for _, mutate := range []func(*bundle){
		func(b *bundle) { b.IP = "192.0.2.11" },
		func(b *bundle) { b.IP = "example.test" },
		func(b *bundle) { b.PrivateKey = "invalid" },
		func(b *bundle) { b.Schema = 2 },
	} {
		changed := b
		mutate(&changed)
		encoded, _ := json.Marshal(changed)
		if _, _, err := decodeBundle(encoded, time.Now()); err == nil {
			t.Fatal("invalid identity accepted")
		}
	}
	for _, invalid := range [][]byte{append(data, []byte("{}")...), []byte(strings.Repeat(" ", 4097)),
		[]byte(strings.Replace(string(data), `"schemaVersion":1`, `"schemaVersion":1,"unexpected":true`, 1))} {
		if _, _, err := decodeBundle(invalid, time.Now()); err == nil {
			t.Fatal("invalid envelope accepted")
		}
	}
	if _, _, err := decodeBundle(data, time.Now().Add(366*24*time.Hour)); err == nil {
		t.Fatal("expired identity accepted")
	}
	if _, _, err := decodeBundle(data, time.Now().Add(-time.Hour)); err == nil {
		t.Fatal("future identity accepted")
	}
}

func TestPinnedCertificateVerification(t *testing.T) {
	_, b, identity := identityFixture(t)
	pair, _ := tls.X509KeyPair([]byte(b.Certificate), []byte(b.PrivateKey))
	cert, _ := x509.ParseCertificate(pair.Certificate[0])
	state := tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	config, err := pinnedTLS(identity, time.Now)
	if err != nil || config.VerifyConnection(state) != nil {
		t.Fatal("correct pinned certificate rejected")
	}
	wrong := identity
	wrong.Pin = "sha256-raw:" + strings.Repeat("0", 64)
	config, err = pinnedTLS(wrong, time.Now)
	if err != nil || config.VerifyConnection(state) == nil {
		t.Fatal("wrong pin accepted")
	}
	wrong = identity
	wrong.IP = "192.0.2.11"
	config, _ = pinnedTLS(wrong, time.Now)
	if config.VerifyConnection(state) == nil {
		t.Fatal("wrong IP SAN accepted")
	}
	config, _ = pinnedTLS(identity, func() time.Time { return cert.NotAfter.Add(time.Second) })
	if config.VerifyConnection(state) == nil {
		t.Fatal("expired pinned certificate accepted")
	}
	config, _ = pinnedTLS(identity, time.Now)
	if config.VerifyConnection(tls.ConnectionState{}) == nil {
		t.Fatal("missing leaf accepted")
	}
	wrong = identity
	wrong.Pin = "sha256-raw:invalid"
	if _, err := pinnedTLS(wrong, time.Now); err == nil {
		t.Fatal("malformed pin accepted")
	}
}

func TestRenderingRejectsDiskStorage(t *testing.T) {
	data, _, _ := identityFixture(t)
	directory := t.TempDir()
	if err := render(directory, data); err == nil {
		t.Fatal("disk-backed or incorrectly owned storage accepted")
	}
	entries, _ := os.ReadDir(directory)
	if len(entries) != 0 {
		t.Fatal("rejected storage contains output")
	}
}

func TestProvisionNeverOverwritesIdentity(t *testing.T) {
	directory := t.TempDir()
	if err := provision(directory, "192.0.2.10", time.Now()); err != nil {
		t.Fatal("provision failed")
	}
	before, _ := os.ReadFile(filepath.Join(directory, "bundle.json"))
	if err := provision(directory, "192.0.2.10", time.Now()); err == nil {
		t.Fatal("existing identity overwritten")
	}
	after, _ := os.ReadFile(filepath.Join(directory, "bundle.json"))
	if string(before) != string(after) {
		t.Fatal("identity changed")
	}
}

func TestUnswappedMountBoundary(t *testing.T) {
	// Nested or sibling mounts must not borrow another tmpfs's protection.
	active := "Filename Type Size Used Priority\n/swap file 1024 0 -2\n"
	for _, test := range []struct {
		mounts, swaps, directory string
		safe                     bool
	}{
		{"tmpfs /config tmpfs rw,noswap,nosuid 0 0\n", active, "/config/derp", true},
		{"tmpfs /config tmpfs rw,nosuid 0 0\n", active, "/config/derp", false},
		{"tmpfs /config-other tmpfs rw,noswap 0 0\n", active, "/config/derp", false},
		{"tmpfs /config tmpfs rw,noswap 0 0\ntmpfs /config/derp tmpfs rw 0 0\n", active, "/config/derp", false},
		{"tmpfs /config tmpfs rw 0 0\n", "Filename Type Size Used Priority\n", "/config/derp", true},
	} {
		if unswappedMount(test.mounts, test.swaps, test.directory) != test.safe {
			t.Fatal("incorrect unswapped mount decision")
		}
	}
}
