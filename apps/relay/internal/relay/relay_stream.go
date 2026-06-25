package relay

import "github.com/rs/zerolog/log"

// ---------------------------------------------------------------------------
// Stream subscription helpers
// ---------------------------------------------------------------------------

func (s *Server) addStreamSub(sessionID, nodeID string) {
	s.streamMu.Lock()
	defer s.streamMu.Unlock()
	if s.streamSubs[sessionID] == nil {
		s.streamSubs[sessionID] = make(map[string]struct{})
	}
	s.streamSubs[sessionID][nodeID] = struct{}{}
}

func (s *Server) setStreamOwner(sessionID, nodeID string) {
	s.streamMu.Lock()
	s.streamOwners[sessionID] = nodeID
	s.streamMu.Unlock()
}

func (s *Server) streamOwner(sessionID string) string {
	s.streamMu.RLock()
	defer s.streamMu.RUnlock()
	return s.streamOwners[sessionID]
}

func (s *Server) removeStreamSub(sessionID, nodeID string) {
	s.streamMu.Lock()
	defer s.streamMu.Unlock()
	if set := s.streamSubs[sessionID]; set != nil {
		delete(set, nodeID)
		if len(set) == 0 {
			delete(s.streamSubs, sessionID)
			delete(s.streamOwners, sessionID)
		}
	}
}

func (s *Server) streamSubsForSession(sessionID string) []string {
	s.streamMu.RLock()
	defer s.streamMu.RUnlock()
	set := s.streamSubs[sessionID]
	if len(set) == 0 {
		return nil
	}
	nodes := make([]string, 0, len(set))
	for nodeID := range set {
		nodes = append(nodes, nodeID)
	}
	return nodes
}

// cancelStreamSubsForNode removes all subscriptions where nodeID is a
// subscriber. Called on node disconnect.
func (s *Server) cancelStreamSubsForNode(nodeID string) {
	s.streamMu.Lock()
	var cancelled []string
	for sessionID, subs := range s.streamSubs {
		if _, ok := subs[nodeID]; ok {
			delete(subs, nodeID)
			if len(subs) == 0 {
				delete(s.streamSubs, sessionID)
				delete(s.streamOwners, sessionID)
			}
			cancelled = append(cancelled, sessionID)
		}
		if s.streamOwners[sessionID] == nodeID {
			delete(s.streamOwners, sessionID)
			delete(s.streamSubs, sessionID)
			cancelled = append(cancelled, sessionID)
		}
	}
	s.streamMu.Unlock()

	for _, sessionID := range cancelled {
		log.Debug().Str("nodeId", nodeID).Str("sessionId", sessionID).Msg("stream sub cancelled on disconnect")
	}
}

// routeBinaryToStreamSubs forwards a binary PTY frame from nodeID to all nodes
// that have subscribed to that frame's sessionId.
// Frame format: [opcode 1 byte][sessionId (null-terminated)][payload]
func (s *Server) routeBinaryToStreamSubs(nodeID string, msgType int, payload []byte) {
	if len(payload) < 3 {
		return
	}
	// Skip opcode byte, find null terminator for sessionId.
	rest := payload[1:]
	nullIdx := -1
	for i, b := range rest {
		if b == 0 {
			nullIdx = i
			break
		}
	}
	if nullIdx <= 0 {
		return
	}
	sessionID := string(rest[:nullIdx])
	if payload[0] == 0x01 {
		ownerNodeID := s.streamOwner(sessionID)
		if ownerNodeID == "" || ownerNodeID == nodeID {
			return
		}
		session := s.sessions.Get(ownerNodeID)
		if session == nil || !session.isConnected() {
			return
		}
		if err := session.SendMessage(msgType, payload); err != nil {
			log.Debug().Err(err).Str("nodeId", ownerNodeID).Str("sessionId", sessionID).Msg("stream owner send failed")
		}
		return
	}
	subs := s.streamSubsForSession(sessionID)
	for _, subNodeID := range subs {
		if subNodeID == nodeID {
			continue // don't echo back to sender
		}
		session := s.sessions.Get(subNodeID)
		if session == nil || !session.isConnected() {
			continue
		}
		if err := session.SendMessage(msgType, payload); err != nil {
			log.Debug().Err(err).Str("nodeId", subNodeID).Str("sessionId", sessionID).Msg("stream sub send failed")
		}
	}
}
