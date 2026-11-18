// Ghostline's bounded certificate renderer and local DERP/STUN health check.
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"tailscale.com/net/stun"
	"tailscale.com/types/key"
)

type bundle struct {
	Schema      int             `json:"schemaVersion"`
	IP          string          `json:"ip"`
	Certificate string          `json:"certificate"`
	PrivateKey  string          `json:"privateKey"`
	ServerKey   key.NodePrivate `json:"serverKey"`
}

type publicIdentity struct {
	IP      string    `json:"ip"`
	Pin     string    `json:"pin"`
	Expires time.Time `json:"expires"`
}

type safeFailure string

func (failure safeFailure) Error() string { return string(failure) }

func decodeBundle(data []byte, now time.Time) (bundle, publicIdentity, error) {
	// Bound the SecureString envelope and reject extra fields before writing any private files.
	var b bundle
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if len(data) > 4096 || decoder.Decode(&b) != nil || decoder.Decode(new(any)) != io.EOF || b.Schema != 1 || b.ServerKey.IsZero() {
		return b, publicIdentity{}, errors.New("invalid DERP identity envelope")
	}
	ip := net.ParseIP(b.IP)
	if ip == nil || ip.To4() == nil || ip.String() != b.IP {
		return b, publicIdentity{}, errors.New("DERP requires a canonical IPv4 identity")
	}
	pair, err := tls.X509KeyPair([]byte(b.Certificate), []byte(b.PrivateKey))
	if err != nil || len(pair.Certificate) != 1 {
		return b, publicIdentity{}, errors.New("invalid DERP TLS key pair")
	}
	cert, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil || cert.VerifyHostname(b.IP) != nil || now.Before(cert.NotBefore) || !now.Before(cert.NotAfter) {
		return b, publicIdentity{}, errors.New("invalid DERP IP certificate or validity")
	}
	hash := sha256.Sum256(cert.Raw)
	return b, publicIdentity{b.IP, "sha256-raw:" + hex.EncodeToString(hash[:]), cert.NotAfter}, nil
}

func writePrivate(path string, value []byte) error {
	// Exclusive creation prevents accidental credential rotation or following a pre-existing symlink.
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0400)
	if err != nil {
		return err
	}
	_, err = file.Write(value)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}

func unswappedMount(mounts, swaps, directory string) bool {
	// A noswap tmpfs is safe even when Docker Desktop's unrelated VM swap is enabled.
	if len(strings.Split(strings.TrimSpace(swaps), "\n")) == 1 {
		return true
	}
	longest, protected := -1, false
	for _, line := range strings.Split(mounts, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		mount := fields[1]
		if (directory == mount || strings.HasPrefix(directory, strings.TrimRight(mount, "/")+"/")) && len(mount) > longest {
			longest = len(mount)
			protected = fields[2] == "tmpfs" && strings.Contains(","+fields[3]+",", ",noswap,")
		}
	}
	return protected
}

func render(directory string, data []byte) error {
	// Only the initializer may render into the dedicated host RAM directory.
	info, err := os.Lstat(directory)
	if err != nil {
		return err
	}
	var fs syscall.Statfs_t
	attributes, ok := info.Sys().(*syscall.Stat_t)
	swaps, swapErr := os.ReadFile("/proc/swaps")
	mounts, mountErr := os.ReadFile("/proc/mounts")
	if !ok || !info.IsDir() || info.Mode().Perm() != 0700 || attributes.Uid != 65532 || attributes.Gid != 65532 {
		return safeFailure("storage ownership")
	}
	if syscall.Statfs(directory, &fs) != nil || fs.Type != 0x01021994 {
		return safeFailure("storage filesystem")
	}
	if swapErr != nil || mountErr != nil || !unswappedMount(string(mounts), string(swaps), directory) {
		return safeFailure("storage swap")
	}
	b, identity, err := decodeBundle(data, time.Now())
	if err != nil {
		return err
	}
	config, err := json.Marshal(struct{ PrivateKey key.NodePrivate }{b.ServerKey})
	if err != nil {
		return err
	}
	metadata, err := json.Marshal(identity)
	if err != nil {
		return err
	}
	files := map[string][]byte{b.IP + ".crt": []byte(b.Certificate), b.IP + ".key": []byte(b.PrivateKey),
		"derper.json": config, "public.json": metadata}
	written := []string{}
	for name, value := range files {
		path := filepath.Join(directory, name)
		if err := writePrivate(path, value); err != nil {
			for _, path := range written {
				_ = os.Remove(path)
			}
			return err
		}
		written = append(written, path)
	}
	return nil
}

func pinnedTLS(identity publicIdentity, now func() time.Time) (*tls.Config, error) {
	// Replace public-CA verification with the exact provisioned leaf pin, IP SAN and validity checks.
	if net.ParseIP(identity.IP) == nil || !strings.HasPrefix(identity.Pin, "sha256-raw:") {
		return nil, errors.New("invalid public identity")
	}
	want, err := hex.DecodeString(strings.TrimPrefix(identity.Pin, "sha256-raw:"))
	if err != nil || len(want) != sha256.Size {
		return nil, errors.New("invalid certificate pin")
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, ServerName: identity.IP, InsecureSkipVerify: true,
		VerifyConnection: func(state tls.ConnectionState) error {
			if len(state.PeerCertificates) < 1 {
				return errors.New("missing leaf certificate")
			}
			cert := state.PeerCertificates[0]
			hash := sha256.Sum256(cert.Raw)
			if !bytes.Equal(want, hash[:]) || cert.VerifyHostname(identity.IP) != nil || now().Before(cert.NotBefore) || !now().Before(cert.NotAfter) {
				return errors.New("DERP certificate identity rejected")
			}
			return nil
		}}, nil
}

func stunProbe(address string) error {
	// Use a fresh transaction and validate the actual mapped address in the correlated STUN response.
	connection, err := net.DialTimeout("udp4", address, time.Second)
	if err != nil {
		return err
	}
	defer connection.Close()
	if err := connection.SetDeadline(time.Now().Add(2 * time.Second)); err != nil {
		return err
	}
	tx := stun.NewTxID()
	if _, err := connection.Write(stun.Request(tx)); err != nil {
		return err
	}
	response := make([]byte, 1024)
	n, err := connection.Read(response)
	if err != nil {
		return err
	}
	got, mapped, err := stun.ParseResponse(response[:n])
	if err != nil || got != tx || !mapped.IsValid() || mapped.Port() == 0 {
		return errors.New("invalid STUN response")
	}
	return nil
}

func health(directory, host, tlsPort, stunPort string, useSTUN bool) error {
	// Health reads public metadata only; TCP and UDP share one bounded overall check.
	data, err := os.ReadFile(filepath.Join(directory, "public.json"))
	if err != nil {
		return err
	}
	var identity publicIdentity
	if err := json.Unmarshal(data, &identity); err != nil {
		return err
	}
	config, err := pinnedTLS(identity, time.Now)
	if err != nil {
		return err
	}
	transport := &http.Transport{TLSClientConfig: config, Proxy: nil, DisableKeepAlives: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 2 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("unexpected redirect") }}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, "GET", "https://"+net.JoinHostPort(host, tlsPort)+"/derp/probe", nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("DERP probe rejected")
	}
	if useSTUN {
		return stunProbe(net.JoinHostPort(host, stunPort))
	}
	return nil
}

func provision(directory, ip string, now time.Time) error {
	// Provision once to protected files; deployment never rotates existing identities implicitly.
	address := net.ParseIP(ip)
	if address == nil || address.To4() == nil || address.String() != ip {
		return errors.New("invalid IPv4")
	}
	private, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return err
	}
	template := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: ip}, IPAddresses: []net.IP{address},
		NotBefore: now.Add(-5 * time.Minute), NotAfter: now.Add(365 * 24 * time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, BasicConstraintsValid: true}
	certificate, err := x509.CreateCertificate(rand.Reader, template, template, private.Public(), private)
	if err != nil {
		return err
	}
	encodedKey, err := x509.MarshalPKCS8PrivateKey(private)
	if err != nil {
		return err
	}
	b := bundle{1, ip, string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certificate})),
		string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encodedKey})), key.NewNode()}
	data, err := json.Marshal(b)
	if err != nil {
		return err
	}
	_, identity, err := decodeBundle(data, now)
	if err != nil {
		return err
	}
	metadata, err := json.Marshal(identity)
	if err != nil {
		return err
	}
	if err := writePrivate(filepath.Join(directory, "bundle.json"), data); err != nil {
		return err
	}
	return writePrivate(filepath.Join(directory, "public.json"), metadata)
}

func serve(directory, tlsPort, stunPort string, useSTUN bool) error {
	// Preserve the deployed privacy policy: upstream DERP logs can include client keys/addresses.
	data, err := os.ReadFile(filepath.Join(directory, "public.json"))
	if err != nil {
		return err
	}
	var identity publicIdentity
	if json.Unmarshal(data, &identity) != nil || !time.Now().Before(identity.Expires) {
		return errors.New("invalid public identity")
	}
	if _, err := pinnedTLS(identity, time.Now); err != nil {
		return err
	}
	arguments := []string{"derper", "-a", ":" + tlsPort, "-http-port", "-1", "-certmode", "manual", "-certdir", directory,
		"-hostname", identity.IP, "-c", filepath.Join(directory, "derper.json"), fmt.Sprintf("-stun=%t", useSTUN), "-stun-port", stunPort,
		"-accept-connection-limit", "20", "-accept-connection-burst", "40"}
	output, err := os.OpenFile("/dev/null", os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	for _, descriptor := range []int{1, 2} {
		if err := syscall.Dup3(int(output.Fd()), descriptor, 0); err != nil {
			output.Close()
			return err
		}
	}
	output.Close()
	// Exec retains native signals/exit status. ECS health and deployment observations expose failure safely.
	return syscall.Exec("/usr/local/bin/derper", arguments, os.Environ())
}

func run() error {
	// Fixed subcommands keep private identity material out of argv, diagnostics and health outputs.
	if len(os.Args) < 2 {
		return errors.New("missing command")
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	directory := flags.String("directory", "/etc/ghostline/derp", "private configuration directory")
	host := flags.String("host", "127.0.0.1", "probe transport address")
	ip := flags.String("ip", "", "certificate IPv4 identity")
	tlsPort := flags.String("tls-port", "8443", "DERP port")
	stunPort := flags.String("stun-port", "3478", "STUN port")
	useSTUN := flags.Bool("stun", true, "probe STUN")
	if err := flags.Parse(os.Args[2:]); err != nil || flags.NArg() != 0 {
		return errors.New("invalid arguments")
	}
	switch os.Args[1] {
	case "health":
		return health(*directory, *host, *tlsPort, *stunPort, *useSTUN)
	case "serve":
		return serve(*directory, *tlsPort, *stunPort, *useSTUN)
	case "provision":
		return provision(*directory, *ip, time.Now())
	case "render":
		// A bounded private pipe avoids secret-bearing process environments and creation records.
		data, err := io.ReadAll(io.LimitReader(os.Stdin, 4097))
		if err != nil || len(data) > 4096 {
			return errors.New("invalid renderer input")
		}
		return render(*directory, data)
	default:
		return errors.New("unknown command")
	}
}

func main() {
	if err := run(); err != nil {
		// Only fixed, explicitly safe categories may cross the runtime diagnostic boundary.
		var safe safeFailure
		if errors.As(err, &safe) {
			fmt.Fprintln(os.Stderr, "DERP operation failed:", safe)
		} else {
			fmt.Fprintln(os.Stderr, "DERP operation failed; details withheld.")
		}
		os.Exit(1)
	}
}
