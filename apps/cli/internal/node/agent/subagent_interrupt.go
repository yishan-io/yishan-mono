package agent

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

// AgentCancelSubagent interrupts one authoritative direct DSH subagent.
func (s *Service) AgentCancelSubagent(ctx context.Context, req rpc.AgentCancelSubagentParams) (any, error) {
	admission, err := s.piSessions.Admit(req.WorkspaceID)
	if err != nil {
		return nil, workspaceClosingError(req.WorkspaceID)
	}
	defer s.piSessions.ReleaseAdmission(admission)
	if err := validateAgentCancelSubagentRequest(req); err != nil {
		return nil, err
	}
	workspaceInstance, err := s.resolveAgentWorkspace(req.Runtime, req.WorkspaceID, req.CWD)
	if err != nil {
		return nil, err
	}
	return s.cancelDSHSubagent(ctx, workspaceInstance.Path, req)
}

func (s *Service) cancelDSHSubagent(ctx context.Context, cwd string, req rpc.AgentCancelSubagentParams) (any, error) {
	lineage, err := s.listDSHSessionLineage(ctx, cwd, req.ParentSessionID, rpc.AgentSessionLineageChildren)
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	if !hasDirectDSHChild(lineage, req.ParentSessionID, req.ChildSessionID) {
		return nil, dshSubagentNotFound(req.ChildSessionID)
	}
	interrupter, ok := s.deps.DSH.(DSHSubagentInterrupt)
	if !ok {
		return nil, mapDSHExecutionError(dsh.ErrRuntimeUnavailable)
	}
	interrupted, err := interrupter.InterruptSubagent(ctx, dsh.SubagentInterruptRequest{
		CWD: cwd, ParentSessionID: req.ParentSessionID, ChildSessionID: req.ChildSessionID,
	})
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	return rpc.AgentCancelSubagentResult{Runtime: rpc.AgentRuntimeDSH, ParentSessionID: interrupted.ParentSessionID,
		ChildSessionID: interrupted.ChildSessionID, InterruptRequested: interrupted.InterruptRequested}, nil
}

func validateAgentCancelSubagentRequest(req rpc.AgentCancelSubagentParams) error {
	if req.Runtime != rpc.AgentRuntimeDSH {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "runtime must be dsh")
	}
	if strings.TrimSpace(req.ParentSessionID) == "" || strings.TrimSpace(req.ChildSessionID) == "" {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "parentSessionId and childSessionId are required")
	}
	return nil
}

func hasDirectDSHChild(lineage dsh.SessionLineageResult, parentSessionID string, childSessionID string) bool {
	for _, child := range lineage.Children {
		if child.SessionID == childSessionID && child.ParentSessionID == parentSessionID {
			return true
		}
	}
	return false
}

func dshSubagentNotFound(sessionID string) error {
	return rpc.NewRPCError(rpc.CodeNotFound, "dsh subagent not found: "+sessionID)
}
