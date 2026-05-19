//go:build windows

package terminal

import (
	"bytes"
	"os/exec"
	"strconv"
	"strings"
)

func listProcesses() ([]processInfo, error) {
	out, err := exec.Command(
		"powershell",
		"-NoProfile",
		"-Command",
		"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation",
	).Output()
	if err != nil {
		return nil, err
	}

	return parseWindowsProcessCSV(out), nil
}

func listListeningTCPPorts(pids []int) ([]listeningPort, error) {
	tracked := make(map[int]struct{}, len(pids))
	for _, pid := range pids {
		if pid > 0 {
			tracked[pid] = struct{}{}
		}
	}
	if len(tracked) == 0 {
		return nil, nil
	}

	out, err := exec.Command("netstat", "-ano", "-p", "tcp").Output()
	if err != nil {
		return nil, err
	}

	return parseWindowsNetstatTCP(out, tracked), nil
}

func parseWindowsProcessCSV(out []byte) []processInfo {
	lines := bytes.Split(out, []byte{'\n'})
	processes := make([]processInfo, 0, len(lines))
	for _, line := range lines {
		fields := parseCSVLine(strings.TrimSpace(string(line)))
		if len(fields) < 2 {
			continue
		}
		pid, pidErr := strconv.Atoi(strings.TrimSpace(fields[0]))
		ppid, ppidErr := strconv.Atoi(strings.TrimSpace(fields[1]))
		if pidErr != nil || ppidErr != nil {
			continue
		}
		processes = append(processes, processInfo{PID: pid, PPID: ppid})
	}
	return processes
}

func parseWindowsNetstatTCP(out []byte, tracked map[int]struct{}) []listeningPort {
	lines := strings.Split(string(out), "\n")
	ports := make([]listeningPort, 0, len(lines))
	for _, rawLine := range lines {
		fields := strings.Fields(strings.TrimSpace(rawLine))
		if len(fields) < 5 || !strings.EqualFold(fields[0], "TCP") || !strings.EqualFold(fields[3], "LISTENING") {
			continue
		}
		pid, err := strconv.Atoi(fields[4])
		if err != nil {
			continue
		}
		if _, ok := tracked[pid]; !ok {
			continue
		}

		address, port, ok := parseWindowsNetworkAddress(fields[1])
		if !ok {
			continue
		}

		ports = append(ports, listeningPort{PID: pid, Address: address, Port: port, ProcessName: "unknown"})
	}
	return ports
}

func parseWindowsNetworkAddress(value string) (string, int, bool) {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "[")
	value = strings.TrimSuffix(value, "]")

	colonIndex := strings.LastIndex(value, ":")
	if colonIndex <= 0 || colonIndex == len(value)-1 {
		return "", 0, false
	}

	port, err := strconv.Atoi(value[colonIndex+1:])
	if err != nil || port <= 0 {
		return "", 0, false
	}

	address := strings.Trim(value[:colonIndex], "[]")
	if address == "" || address == "*" {
		address = "0.0.0.0"
	}

	return address, port, true
}

func parseCSVLine(line string) []string {
	if line == "" || strings.HasPrefix(line, "\"ProcessId\"") {
		return nil
	}

	parts := strings.Split(line, ",")
	if len(parts) < 2 {
		return nil
	}

	for i := range parts {
		parts[i] = strings.Trim(parts[i], "\"\r\n ")
	}

	return parts
}
