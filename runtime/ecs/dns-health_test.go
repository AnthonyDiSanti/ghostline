package main

import (
	"encoding/binary"
	"errors"
	"slices"
	"testing"
	"time"
)

func response(name string, code byte, address []byte) ([]byte, int) {
	// A compressed answer exercises the same wire layout returned by CoreDNS.
	q, _ := question(name, 1)
	message := make([]byte, 12, 12+len(q)+16)
	message[2] = 0x81
	message[3] = 0x80 | code
	binary.BigEndian.PutUint16(message[4:6], 1)
	if address != nil {
		binary.BigEndian.PutUint16(message[6:8], 1)
	}
	message = append(message, q...)
	offset := len(message)
	if address != nil {
		message = append(message, 0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4)
		message = append(message, address...)
	}
	return message, offset
}

func TestPublicAnswer(t *testing.T) {
	// NOERROR alone, SERVFAIL and non-public replies cannot satisfy health.
	for _, tc := range []struct {
		name    string
		code    byte
		address []byte
		want    bool
	}{
		{"public", 0, []byte{93, 184, 215, 14}, true},
		{"empty", 0, nil, false},
		{"servfail", 2, []byte{93, 184, 215, 14}, false},
		{"private", 0, []byte{10, 0, 0, 1}, false},
		{"shared", 0, []byte{100, 127, 0, 1}, false},
		{"documentation", 0, []byte{203, 0, 113, 1}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			packet, offset := response("example.com", tc.code, tc.address)
			got, err := publicAAnswer(packet, offset)
			if err != nil || got != tc.want {
				t.Fatalf("publicAAnswer() = %v, %v; want %v", got, err, tc.want)
			}
		})
	}
	packet, offset := response("example.com", 0, []byte{93, 184, 215, 14})
	if _, err := publicAAnswer(packet[:len(packet)-1], offset); err == nil {
		t.Fatal("truncated answer was accepted")
	}
}

func TestHealthFallbackAndLocalFailure(t *testing.T) {
	// Fallback is between fixed names; both local transports remain mandatory.
	var seen []string
	ask := func(name, network string, timeout time.Duration) ([]byte, int, error) {
		seen = append(seen, name+"/"+network)
		if name == "onion" {
			packet, offset := response(name, 3, nil)
			return packet, offset, nil
		}
		if name == "example.com" {
			packet, offset := response(name, 2, nil)
			return packet, offset, nil
		}
		packet, offset := response(name, 0, []byte{142, 250, 190, 14})
		return packet, offset, nil
	}
	if !healthy(ask) || !slices.Equal(seen, []string{"onion/udp", "onion/tcp", "example.com/udp", "google.com/udp"}) {
		t.Fatalf("healthy() did not use both local transports and fallback: %v", seen)
	}
	if healthy(func(string, string, time.Duration) ([]byte, int, error) { return nil, 0, errors.New("closed") }) {
		t.Fatal("missing local listener was accepted")
	}
}
