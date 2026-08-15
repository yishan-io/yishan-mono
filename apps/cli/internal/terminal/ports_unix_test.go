//go:build !windows

package terminal

import "testing"

func TestParseLsofListeningTCPPorts(t *testing.T) {
	ports := parseLsofListeningTCPPorts([]byte("p101\ncnode\nn*:3000\nn127.0.0.1:5173\np202\ncpython\nn[::1]:8000\n"))

	if len(ports) != 3 {
		t.Fatalf("expected 3 ports, got %d", len(ports))
	}
	if ports[0].PID != 101 || ports[0].ProcessName != "node" || ports[0].Address != "0.0.0.0" || ports[0].Port != 3000 {
		t.Fatalf("unexpected first port: %+v", ports[0])
	}
	if ports[1].PID != 101 || ports[1].ProcessName != "node" || ports[1].Address != "127.0.0.1" || ports[1].Port != 5173 {
		t.Fatalf("unexpected second port: %+v", ports[1])
	}
	if ports[2].PID != 202 || ports[2].ProcessName != "python" || ports[2].Address != "::1" || ports[2].Port != 8000 {
		t.Fatalf("unexpected third port: %+v", ports[2])
	}
}

func TestParseProcesses(t *testing.T) {
	processes := parseProcesses([]byte(" 10 1\n 11 10\n invalid\n"))

	if len(processes) != 2 {
		t.Fatalf("expected 2 processes, got %d", len(processes))
	}
	if processes[0] != (processInfo{PID: 10, PPID: 1}) {
		t.Fatalf("unexpected first process: %+v", processes[0])
	}
	if processes[1] != (processInfo{PID: 11, PPID: 10}) {
		t.Fatalf("unexpected second process: %+v", processes[1])
	}
}
