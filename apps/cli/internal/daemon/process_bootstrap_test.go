package daemon

import (
	"net"
	"net/url"
	"testing"
)

func TestResolveDaemonWSEndpoint_UsesActualListenerAddress(t *testing.T) {
	tests := []struct {
		name         string
		listenerAddr *net.TCPAddr
		want         string
	}{
		{name: "IPv4 loopback", listenerAddr: &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 3456}, want: "ws://127.0.0.1:3456/ws"},
		{name: "IPv6 loopback", listenerAddr: &net.TCPAddr{IP: net.ParseIP("::1"), Port: 3456}, want: "ws://[::1]:3456/ws"},
		{name: "IPv4 wildcard", listenerAddr: &net.TCPAddr{IP: net.ParseIP("0.0.0.0"), Port: 3456}, want: "ws://127.0.0.1:3456/ws"},
		{name: "IPv6 wildcard", listenerAddr: &net.TCPAddr{IP: net.ParseIP("::"), Port: 3456}, want: "ws://[::1]:3456/ws"},
		{name: "nonloopback is unavailable", listenerAddr: &net.TCPAddr{IP: net.ParseIP("192.168.1.20"), Port: 3456}, want: ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveDaemonWSEndpoint(test.listenerAddr); got != test.want {
				t.Fatalf("resolveDaemonWSEndpoint(%s) = %q, want %q", test.listenerAddr, got, test.want)
			}
		})
	}
}

func TestBindListener_DerivesEndpointFromDynamicPort(t *testing.T) {
	listener, _, _, err := bindListener(RunConfig{Host: "127.0.0.1", Port: 0})
	if err != nil {
		t.Fatalf("bindListener: %v", err)
	}
	defer listener.Close()

	endpoint := resolveDaemonWSEndpoint(listener.Addr())
	parsed, err := url.Parse(endpoint)
	if err != nil {
		t.Fatalf("parse endpoint: %v", err)
	}
	if parsed.Path != "/ws" || parsed.Port() == "0" || parsed.Port() == "" {
		t.Fatalf("endpoint = %q, want dynamic nonzero port and /ws path", endpoint)
	}
	if host, _, err := net.SplitHostPort(parsed.Host); err != nil || host != "127.0.0.1" {
		t.Fatalf("endpoint host = %q, err = %v", parsed.Host, err)
	}
}
