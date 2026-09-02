package application

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/workspace"
)

func (s *Service) reserveAvailableCreate(ctx context.Context, plan CreatePlan) (CreatePlan, error) {
	if plan.LocalCreate == nil {
		return plan, nil
	}
	s.createMu.Lock()
	defer s.createMu.Unlock()

	for suffix := 1; ; suffix++ {
		candidate := createCandidate(*plan.LocalCreate, suffix)
		if s.hasCreateReservation(candidate) {
			continue
		}
		if s.deps.IsCreateAvailable != nil {
			available, err := s.deps.IsCreateAvailable(ctx, candidate)
			if err != nil || !available {
				if err != nil {
					return CreatePlan{}, err
				}
				continue
			}
		}
		return s.reserveCreateCandidate(plan, candidate), nil
	}
}

func createCandidate(request workspace.CreateRequest, suffix int) workspace.CreateRequest {
	if suffix < 2 {
		return request
	}
	resolvedSuffix := fmt.Sprintf("-%d", suffix)
	request.WorkspaceName = strings.TrimSpace(request.WorkspaceName) + resolvedSuffix
	request.TargetBranch = strings.TrimSpace(request.TargetBranch) + resolvedSuffix
	return request
}

func (s *Service) hasCreateReservation(request workspace.CreateRequest) bool {
	_, hasName := s.reservedCreateNames[createNameReservationKey(request)]
	_, hasBranch := s.reservedCreateBranches[createBranchReservationKey(request)]
	return hasName || hasBranch
}

func (s *Service) reserveCreateCandidate(plan CreatePlan, request workspace.CreateRequest) CreatePlan {
	plan.LocalCreate = &request
	plan.StartedEvent.WorkspaceName = request.WorkspaceName
	plan.StartedEvent.Branch = request.TargetBranch
	if plan.Registration != nil {
		plan.Registration.Branch = request.TargetBranch
	}
	s.reservedCreateNames[createNameReservationKey(request)] = struct{}{}
	s.reservedCreateBranches[createBranchReservationKey(request)] = struct{}{}
	return plan
}

func (s *Service) releaseCreateReservation(plan CreatePlan) {
	if plan.LocalCreate == nil {
		return
	}
	s.createMu.Lock()
	defer s.createMu.Unlock()
	delete(s.reservedCreateNames, createNameReservationKey(*plan.LocalCreate))
	delete(s.reservedCreateBranches, createBranchReservationKey(*plan.LocalCreate))
}

func createNameReservationKey(request workspace.CreateRequest) string {
	return strings.TrimSpace(request.RepoKey) + "\x00" + strings.TrimSpace(request.WorkspaceName)
}

func createBranchReservationKey(request workspace.CreateRequest) string {
	return strings.TrimSpace(request.RepoKey) + "\x00" + strings.TrimSpace(request.TargetBranch)
}
