package app

import (
	"context"
	"errors"

	"yishan/apps/cli/internal/agent/dsh"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
)

func executeDSHTaskTemplateRead(ctx context.Context, tasks *nodelocaltask.Service, request dsh.CapabilityRequest) (any, error) {
	if _, err := decodeDSHCapabilityInput[struct{}](request, dshTaskTemplateReadOperation); err != nil {
		return nil, errors.New("task template input is invalid")
	}
	return tasks.GetTaskTemplates(ctx, struct{}{})
}
