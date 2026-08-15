//go:build !windows

package terminal

import (
	"bytes"
	"errors"
	"os/exec"
	"slices"
	"strconv"
	"strings"
)

const maxLsofPIDsPerInvocation = 256

func listProcesses() ([]processInfo, error) {
	out, err := exec.Command("ps", "-axo", "pid=,ppid=").Output()
	if err != nil {
		return nil, err
	}
	return parseProcesses(out), nil
}

func listListeningTCPPorts(pids []int) ([]listeningPort, error) {
	normalized := normalizePositivePIDs(pids)
	if len(normalized) == 0 {
		return nil, nil
	}

	ports := make([]listeningPort, 0)
	for start := 0; start < len(normalized); start += maxLsofPIDsPerInvocation {
		end := min(start+maxLsofPIDsPerInvocation, len(normalized))
		chunk := normalized[start:end]
		chunkPorts, err := listListeningTCPPortsForPIDChunk(chunk)
		if err != nil {
			return nil, err
		}
		ports = append(ports, chunkPorts...)
	}

	return ports, nil
}

func listListeningTCPPortsForPIDChunk(pids []int) ([]listeningPort, error) {
	pidValues := make([]string, 0, len(pids))
	for _, pid := range pids {
		pidValues = append(pidValues, strconv.Itoa(pid))
	}

	args := []string{
		"-nP",
		"-a",
		"-p",
		strings.Join(pidValues, ","),
		"-iTCP",
		"-sTCP:LISTEN",
		"-F",
		"pcn",
	}
	out, err := exec.Command("lsof", args...).Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
			// lsof exits 1 when no rows match; treat as empty result.
			return nil, nil
		}
		return nil, err
	}
	return parseLsofListeningTCPPorts(out), nil
}

func normalizePositivePIDs(pids []int) []int {
	if len(pids) == 0 {
		return nil
	}

	seen := make(map[int]struct{}, len(pids))
	unique := make([]int, 0, len(pids))
	for _, pid := range pids {
		if pid <= 0 {
			continue
		}
		if _, ok := seen[pid]; ok {
			continue
		}
		seen[pid] = struct{}{}
		unique = append(unique, pid)
	}
	slices.Sort(unique)
	return unique
}

func parseProcesses(out []byte) []processInfo {
	lines := bytes.Split(out, []byte{'\n'})
	processes := make([]processInfo, 0, len(lines))
	for _, line := range lines {
		fields := strings.Fields(string(line))
		if len(fields) < 2 {
			continue
		}
		pid, pidErr := strconv.Atoi(fields[0])
		ppid, ppidErr := strconv.Atoi(fields[1])
		if pidErr != nil || ppidErr != nil {
			continue
		}
		processes = append(processes, processInfo{PID: pid, PPID: ppid})
	}
	return processes
}

func parseLsofListeningTCPPorts(out []byte) []listeningPort {
	var current listeningPort
	ports := []listeningPort{}
	for _, rawLine := range bytes.Split(out, []byte{'\n'}) {
		line := string(rawLine)
		if len(line) < 2 {
			continue
		}
		value := strings.TrimSpace(line[1:])
		switch line[0] {
		case 'p':
			if current.PID > 0 && current.Port > 0 {
				ports = append(ports, current)
			}
			pid, err := strconv.Atoi(value)
			if err != nil {
				current = listeningPort{}
				continue
			}
			current = listeningPort{PID: pid}
		case 'c':
			current.ProcessName = value
		case 'n':
			address, port, ok := parseLsofNetworkAddress(value)
			if !ok {
				continue
			}
			current.Address = address
			current.Port = port
			ports = append(ports, current)
			current.Port = 0
			current.Address = ""
		}
	}
	if current.PID > 0 && current.Port > 0 {
		ports = append(ports, current)
	}
	return ports
}

func parseLsofNetworkAddress(value string) (string, int, bool) {
	value = strings.TrimSpace(strings.TrimPrefix(value, "TCP "))
	value = strings.TrimSuffix(value, " (LISTEN)")
	colonIndex := strings.LastIndex(value, ":")
	if colonIndex < 0 || colonIndex == len(value)-1 {
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
