package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/memory"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
)

func resolveDSHCapability(workspaces *nodeworkspace.Service, memories *memory.Service) dsh.CapabilityResolver {
	workspaceResolver := resolveDSHWorkspaceCapability(workspaces)
	return func(ctx context.Context, request dsh.CapabilityRequest) (any, error) {
		if strings.HasPrefix(request.Operation, "memory.") {
			return executeDSHMemoryCapability(ctx, workspaces, memories, request)
		}
		return workspaceResolver(ctx, request)
	}
}

func decodeDSHCapabilityInput[T any](request dsh.CapabilityRequest, operation string) (T, error) {
	var input T
	if request.Operation != operation {
		return input, errors.New("capability operation does not match input")
	}
	decoder := json.NewDecoder(bytes.NewReader(request.Input))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return input, errors.New("capability input contains trailing data")
	}
	return input, nil
}
