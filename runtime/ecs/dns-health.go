package main

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/netip"
	"os"
	"time"
)

const endpoint = "127.0.0.1:5353"

var publicNames = [...]string{"example.com", "google.com"}

type dnsQuery func(string, string, time.Duration) ([]byte, int, error)

func question(name string, recordType uint16) ([]byte, error) {
	// Fixed probe names use DNS's wire label format; no system resolver is consulted.
	var out []byte
	for _, label := range splitLabels(name) {
		if len(label) == 0 || len(label) > 63 {
			return nil, errors.New("invalid DNS label")
		}
		out = append(out, byte(len(label)))
		out = append(out, label...)
	}
	out = append(out, 0, 0, 0, 0, 1)
	binary.BigEndian.PutUint16(out[len(out)-4:len(out)-2], recordType)
	return out, nil
}

func splitLabels(name string) []string {
	// The probe only uses the fixed ASCII names above and the onion apex.
	for i := range name {
		if name[i] == '.' {
			return append(splitLabels(name[:i]), splitLabels(name[i+1:])...)
		}
	}
	return []string{name}
}

func query(name, network string, timeout time.Duration) ([]byte, int, error) {
	return queryType(name, network, 1, timeout)
}

func queryType(name, network string, recordType uint16, timeout time.Duration) ([]byte, int, error) {
	// Query CoreDNS directly over each requested transport, never /etc/resolv.conf.
	q, err := question(name, recordType)
	if err != nil {
		return nil, 0, err
	}
	request := make([]byte, 12, 12+len(q))
	if _, err = rand.Read(request[:2]); err != nil {
		return nil, 0, err
	}
	binary.BigEndian.PutUint16(request[2:4], 0x0100)
	binary.BigEndian.PutUint16(request[4:6], 1)
	request = append(request, q...)
	conn, err := net.DialTimeout(network, endpoint, timeout)
	if err != nil {
		return nil, 0, err
	}
	defer conn.Close()
	if err = conn.SetDeadline(time.Now().Add(timeout)); err != nil {
		return nil, 0, err
	}
	var answer []byte
	if network == "tcp" {
		frame := make([]byte, 2+len(request))
		binary.BigEndian.PutUint16(frame[:2], uint16(len(request)))
		copy(frame[2:], request)
		if err = writeAll(conn, frame); err != nil {
			return nil, 0, err
		}
		length := make([]byte, 2)
		if _, err = io.ReadFull(conn, length); err != nil {
			return nil, 0, err
		}
		answer = make([]byte, binary.BigEndian.Uint16(length))
		_, err = io.ReadFull(conn, answer)
	} else {
		if err = writeAll(conn, request); err != nil {
			return nil, 0, err
		}
		answer = make([]byte, 65535)
		var n int
		n, err = conn.Read(answer)
		answer = answer[:n]
	}
	if err != nil {
		return nil, 0, err
	}
	if len(answer) < 12+len(q) || string(answer[:2]) != string(request[:2]) ||
		binary.BigEndian.Uint16(answer[2:4])&0x8200 != 0x8000 ||
		binary.BigEndian.Uint16(answer[4:6]) != 1 || string(answer[12:12+len(q)]) != string(q) {
		return nil, 0, errors.New("invalid DNS response")
	}
	return answer, 12 + len(q), nil
}

func writeAll(conn net.Conn, data []byte) error {
	// TCP writes can be short; the same loop is safe for our small UDP datagram.
	for len(data) > 0 {
		n, err := conn.Write(data)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		data = data[n:]
	}
	return nil
}

func skipName(message []byte, offset int) (int, error) {
	// A compressed pointer occupies two bytes; the answer parser need not expand it.
	for offset < len(message) {
		length := int(message[offset])
		if length&0xc0 == 0xc0 {
			if offset+1 < len(message) {
				return offset + 2, nil
			}
			break
		}
		if length&0xc0 != 0 || offset+1+length > len(message) {
			break
		}
		offset += 1 + length
		if length == 0 {
			return offset, nil
		}
	}
	return 0, errors.New("invalid DNS answer name")
}

func publicIPv4(raw []byte) bool {
	// Reject non-public destinations even if a DNS server replies NOERROR.
	if len(raw) != 4 {
		return false
	}
	addr := netip.AddrFrom4([4]byte(raw))
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range [...]netip.Prefix{
		netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("192.0.0.0/24"),
		netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("198.18.0.0/15"),
		netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"),
		netip.MustParsePrefix("240.0.0.0/4"),
	} {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}

func publicAAnswer(message []byte, offset int) (bool, error) {
	// Parse answer records defensively and require an actual public A address.
	if len(message) < 12 || message[3]&0x0f != 0 {
		return false, nil
	}
	for count := int(binary.BigEndian.Uint16(message[6:8])); count > 0; count-- {
		var err error
		offset, err = skipName(message, offset)
		if err != nil || offset+10 > len(message) {
			return false, errors.New("truncated DNS answer")
		}
		kind := binary.BigEndian.Uint16(message[offset : offset+2])
		class := binary.BigEndian.Uint16(message[offset+2 : offset+4])
		size := int(binary.BigEndian.Uint16(message[offset+8 : offset+10]))
		offset += 10
		if offset+size > len(message) {
			return false, errors.New("truncated DNS answer data")
		}
		if kind == 1 && class == 1 && size == 4 && publicIPv4(message[offset:offset+size]) {
			return true, nil
		}
		offset += size
	}
	return false, nil
}

func localReady(ask dnsQuery) bool {
	// The onion apex is answered locally, proving both listener transports.
	for _, network := range [...]string{"udp", "tcp"} {
		answer, _, err := ask("onion", network, 2*time.Second)
		if err != nil || len(answer) < 4 || answer[3]&0x0f != 3 {
			return false
		}
	}
	return true
}

func healthy(ask dnsQuery) bool {
	// Either independent public name may prove the configured encrypted forward path.
	if !localReady(ask) {
		return false
	}
	for _, name := range publicNames {
		answer, offset, err := ask(name, "udp", 6*time.Second)
		if err == nil {
			valid, parseErr := publicAAnswer(answer, offset)
			if parseErr == nil && valid {
				return true
			}
		}
	}
	return false
}

func offlineReady() bool {
	// Package-only check: with networking disabled, ordinary A and AAAA queries must fail closed.
	for _, tc := range [...]struct {
		network    string
		recordType uint16
	}{{"udp", 1}, {"tcp", 28}} {
		answer, _, err := queryType("example.com", tc.network, tc.recordType, 20*time.Second)
		if err != nil || len(answer) < 4 || answer[3]&0x0f != 2 {
			return false
		}
	}
	return true
}

func main() {
	// Exit status alone reports health; no client names or responses enter logs.
	var valid bool
	switch {
	case len(os.Args) == 1:
		valid = healthy(query)
	case len(os.Args) == 2 && os.Args[1] == "--local":
		valid = localReady(query)
	case len(os.Args) == 2 && os.Args[1] == "--offline":
		valid = offlineReady()
	}
	if !valid {
		os.Exit(1)
	}
}
