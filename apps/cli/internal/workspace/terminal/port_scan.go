package terminal

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/rpcerror"
)

func (m *Manager) ListDetectedPorts() []DetectedPort {
	return m.collectDetectedPortsForWindow(0, m.currentPortScopeWorkspaceID())
}

func (m *Manager) collectDetectedPortsForWindow(recentWindow time.Duration, workspaceScopeID string) []DetectedPort {
	sessions := m.listRunningSessions(recentWindow, workspaceScopeID)
	if len(sessions) == 0 && recentWindow > 0 {
		sessions = m.listRunningSessions(0, workspaceScopeID)
	}

	if len(sessions) == 0 {
		return nil
	}

	sessionByPID := make(map[int]*session)
	rootPIDs := make([]int, 0, len(sessions))
	for _, s := range sessions {
		pid := s.cmd.Process.Pid
		sessionByPID[pid] = s
		rootPIDs = append(rootPIDs, pid)
	}

	processes, err := listProcesses()
	if err != nil {
		return nil
	}
	pidToRoot := buildPIDToRootMap(rootPIDs, processes)

	trackedPIDs := make([]int, 0, len(pidToRoot))
	for pid := range pidToRoot {
		trackedPIDs = append(trackedPIDs, pid)
	}

	listeningPorts, err := listListeningTCPPorts(trackedPIDs)
	if err != nil {
		log.Debug().Err(err).Msg("[ports] listListeningTCPPorts error")
		return nil
	}
	log.Debug().Int("trackedPIDs", len(trackedPIDs)).Int("listeningPorts", len(listeningPorts)).Msg("[ports] lsof result")

	out := make([]DetectedPort, 0, len(listeningPorts))
	for _, port := range listeningPorts {
		rootPID, ok := pidToRoot[port.PID]
		if !ok {
			continue
		}
		session := sessionByPID[rootPID]
		log.Debug().Str("sessionId", session.id).Str("workspaceId", session.workspaceID).Int("port", port.Port).Msg("[ports] detected port")
		out = append(out, DetectedPort{
			SessionID:   session.id,
			WorkspaceID: session.workspaceID,
			PID:         port.PID,
			Port:        port.Port,
			Address:     port.Address,
			ProcessName: port.ProcessName,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].WorkspaceID != out[j].WorkspaceID {
			return out[i].WorkspaceID < out[j].WorkspaceID
		}
		if out[i].Port != out[j].Port {
			return out[i].Port < out[j].Port
		}
		return out[i].PID < out[j].PID
	})
	return out
}

func (m *Manager) listRunningSessions(recentWindow time.Duration, workspaceScopeID string) []*session {
	var threshold int64
	if recentWindow > 0 {
		threshold = time.Now().UTC().Add(-recentWindow).UnixNano()
	}
	workspaceScopeID = strings.TrimSpace(workspaceScopeID)

	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*session, 0, len(m.sessions))
	for _, currentSession := range m.sessions {
		if !currentSession.running.Load() || currentSession.cmd.Process == nil {
			continue
		}
		if workspaceScopeID != "" && currentSession.workspaceID != workspaceScopeID {
			continue
		}
		if threshold > 0 && currentSession.lastActivityUnixNano.Load() < threshold {
			continue
		}
		sessions = append(sessions, currentSession)
	}

	return sessions
}

func (m *Manager) ensurePortScanLoop() {
	m.portLoopMu.Lock()
	if m.portLoopRunning {
		m.portLoopMu.Unlock()
		return
	}
	m.portLoopRunning = true
	m.portLoopMu.Unlock()

	go m.runPortScanLoop()
}

func (m *Manager) runPortScanLoop() {
	defer func() {
		m.portLoopMu.Lock()
		m.portLoopRunning = false
		m.portLoopMu.Unlock()
	}()

	debounce := time.NewTimer(0)
	if !debounce.Stop() {
		<-debounce.C
	}
	debouncing := false

	idleCheck := time.NewTicker(30 * time.Second)
	defer idleCheck.Stop()

	scan := func() bool {
		debouncing = false
		if !m.hasActiveSessions() {
			if m.shouldPublishPortsUpdate(nil) {
				m.publishPortsChanged(nil)
			}
			return false
		}
		recentWindow := time.Duration(0)
		workspaceScopeID := m.currentPortScopeWorkspaceID()
		if m.hasRecentlyActiveSessions(portScanActivityWindow) {
			recentWindow = portScanActivityWindow
		}
		ports := m.collectDetectedPortsForWindow(recentWindow, workspaceScopeID)
		log.Debug().Int("count", len(ports)).Str("workspaceScopeID", workspaceScopeID).Msg("[ports] scan complete")
		if m.shouldPublishPortsUpdate(ports) {
			log.Debug().Int("count", len(ports)).Msg("[ports] publishing ports changed")
			m.publishPortsChanged(ports)
		}
		return true
	}

	for {
		select {
		case <-idleCheck.C:
			if !m.hasActiveSessions() {
				if m.shouldPublishPortsUpdate(nil) {
					m.publishPortsChanged(nil)
				}
				return
			}

		case <-m.portScanHintCh:
			if debouncing {
				if !debounce.Stop() {
					select {
					case <-debounce.C:
					default:
					}
				}
			}
			debounce.Reset(portScanHintDebounce)
			debouncing = true

		case <-debounce.C:
			if !scan() {
				return
			}
		}
	}
}

func (m *Manager) requestPortScanHint() {
	select {
	case m.portScanHintCh <- struct{}{}:
	default:
	}
}

func (m *Manager) SetActiveWorkspace(req SetActiveWorkspaceRequest) (SetActiveWorkspaceResponse, error) {
	m.portSnapshotMu.Lock()
	m.portScopeWorkspaceID = strings.TrimSpace(req.WorkspaceID)
	m.lastPortSnapshotKey = ""
	m.portSnapshotMu.Unlock()
	return SetActiveWorkspaceResponse{Updated: true}, nil
}

func (m *Manager) currentPortScopeWorkspaceID() string {
	m.portSnapshotMu.Lock()
	defer m.portSnapshotMu.Unlock()
	return m.portScopeWorkspaceID
}

func (m *Manager) hasRecentlyActiveSessions(window time.Duration) bool {
	threshold := time.Now().UTC().Add(-window).UnixNano()
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, currentSession := range m.sessions {
		if !currentSession.running.Load() || currentSession.cmd.Process == nil {
			continue
		}
		if currentSession.lastActivityUnixNano.Load() >= threshold {
			return true
		}
	}
	return false
}

func (m *Manager) hasActiveSessions() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, session := range m.sessions {
		if session.running.Load() && session.cmd.Process != nil {
			return true
		}
	}
	return false
}

func (m *Manager) shouldPublishPortsUpdate(ports []DetectedPort) bool {
	key := buildPortSnapshotKey(ports)

	m.portSnapshotMu.Lock()
	defer m.portSnapshotMu.Unlock()
	if key == m.lastPortSnapshotKey {
		return false
	}
	m.lastPortSnapshotKey = key
	return true
}

func buildPortSnapshotKey(ports []DetectedPort) string {
	if len(ports) == 0 {
		return ""
	}

	var builder strings.Builder
	for _, port := range ports {
		builder.WriteString(port.SessionID)
		builder.WriteByte('|')
		builder.WriteString(port.WorkspaceID)
		builder.WriteByte('|')
		builder.WriteString(strconv.Itoa(port.PID))
		builder.WriteByte('|')
		builder.WriteString(strconv.Itoa(port.Port))
		builder.WriteByte('|')
		builder.WriteString(port.Address)
		builder.WriteByte('|')
		builder.WriteString(port.ProcessName)
		builder.WriteByte('\n')
	}

	return builder.String()
}

func (m *Manager) KillProcess(req KillProcessRequest) (KillProcessResponse, error) {
	if req.PID <= 0 {
		return KillProcessResponse{}, rpcerror.New(rpcCodeInvalidParams, "pid is required")
	}

	if err := stopProcessByPID(req.PID); err != nil {
		return KillProcessResponse{}, err
	}
	m.requestPortScanHint()

	return KillProcessResponse{Killed: true}, nil
}

func stopListeningProcessesForSession(s *session) error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}

	processes, err := listProcesses()
	if err != nil {
		return err
	}

	pidToRoot := buildPIDToRootMap([]int{s.cmd.Process.Pid}, processes)
	trackedPIDs := make([]int, 0, len(pidToRoot))
	for pid := range pidToRoot {
		trackedPIDs = append(trackedPIDs, pid)
	}

	listeningPorts, err := listListeningTCPPorts(trackedPIDs)
	if err != nil {
		return err
	}

	listeningPIDs := make(map[int]struct{})
	for _, port := range listeningPorts {
		rootPID, ok := pidToRoot[port.PID]
		if !ok || rootPID != s.cmd.Process.Pid {
			continue
		}
		if port.PID > 0 {
			listeningPIDs[port.PID] = struct{}{}
		}
	}

	for pid := range listeningPIDs {
		if err := stopProcessByPID(pid); err != nil {
			return fmt.Errorf("kill pid %d: %w", pid, err)
		}
	}

	return nil
}

func buildPIDToRootMap(rootPIDs []int, processes []processInfo) map[int]int {
	childrenByPPID := make(map[int][]int)
	for _, process := range processes {
		if process.PID <= 0 || process.PPID <= 0 {
			continue
		}
		childrenByPPID[process.PPID] = append(childrenByPPID[process.PPID], process.PID)
	}

	pidToRoot := make(map[int]int)
	for _, rootPID := range rootPIDs {
		if rootPID <= 0 {
			continue
		}
		stack := []int{rootPID}
		for len(stack) > 0 {
			pid := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if _, seen := pidToRoot[pid]; seen {
				continue
			}
			pidToRoot[pid] = rootPID
			stack = append(stack, childrenByPPID[pid]...)
		}
	}

	return pidToRoot
}
