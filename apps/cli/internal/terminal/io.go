package terminal

import (
	"errors"
	"io"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/rpcerror"
)

func (m *Manager) Send(req SendRequest) (SendResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return SendResponse{}, err
	}

	if !s.running.Load() {
		return SendResponse{}, rpcerror.New(rpcCodeSessionInactive, "terminal session not running")
	}

	n, err := io.WriteString(s.pty, req.Input)
	if err != nil {
		return SendResponse{}, err
	}
	s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
	if strings.ContainsRune(req.Input, rune(0x03)) {
		m.requestPortScanHint()
	}
	return SendResponse{Written: n}, nil
}

// SendRaw writes raw bytes directly to a PTY session without any
// string conversion. Used by the binary WebSocket fast-path.
func (m *Manager) SendRaw(sessionID string, data []byte) {
	s, err := m.session(sessionID)
	if err != nil {
		return
	}
	if !s.running.Load() {
		return
	}
	s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
	for _, currentByte := range data {
		if currentByte == 0x03 {
			m.requestPortScanHint()
			break
		}
	}
	_, _ = s.pty.Write(data)
}

func (m *Manager) Read(req ReadRequest) (ReadResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return ReadResponse{}, err
	}

	s.outputMu.Lock()
	out := s.output.String()
	s.output.Reset()
	s.outputMu.Unlock()

	running := s.running.Load()
	if running {
		return ReadResponse{Output: out, Running: true}, nil
	}

	code := int(s.exitCode.Load())
	return ReadResponse{Output: out, ExitCode: &code, Running: false}, nil
}

func (s *session) capture() {
	buf := make([]byte, 4096)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
			raw := make([]byte, n)
			copy(raw, buf[:n])
			chunk := string(raw)
			s.outputMu.Lock()
			s.appendOutput(chunk)
			s.outputMu.Unlock()
			s.broadcast(Event{SessionID: s.id, Type: "output", Chunk: chunk, RawChunk: raw})
			window := string(s.portScanTail) + chunk
			if outputMentionsPorts(window) {
				log.Debug().Str("sessionId", s.id).Str("chunk", chunk).Msg("[ports] output matches port pattern, requesting scan hint")
				s.portHintFn()
			}
			combined := append(s.portScanTail, raw...)
			if len(combined) > portScanTailSize {
				combined = combined[len(combined)-portScanTailSize:]
			}
			s.portScanTail = combined
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			return
		}
	}
}

func (s *session) appendOutput(chunk string) {
	if len(chunk) >= maxSessionOutputBytes {
		s.output.Reset()
		_, _ = s.output.WriteString(chunk[len(chunk)-maxSessionOutputBytes:])
		return
	}

	if s.output.Len()+len(chunk) > maxSessionOutputBytes {
		current := s.output.String()
		retainedBytes := maxSessionOutputBytes/2 - len(chunk)
		if retainedBytes < 0 {
			retainedBytes = 0
		}
		if retainedBytes > len(current) {
			retainedBytes = len(current)
		}
		s.output.Reset()
		_, _ = s.output.WriteString(current[len(current)-retainedBytes:])
	}
	_, _ = s.output.WriteString(chunk)
}

func (s *session) broadcast(event Event) {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()

	for _, ch := range s.subs {
		select {
		case ch <- event:
		default:
		}
	}
}

func (s *session) closeSubscribers() {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()

	for id, ch := range s.subs {
		delete(s.subs, id)
		close(ch)
	}
}
