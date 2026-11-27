package project

import (
	"errors"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

func isNotFound(err error) bool {
	return errors.Is(err, sqlite.ErrProjectNotFound)
}

func invalidParams(message string) error {
	return rpc.NewRPCError(rpc.CodeInvalidParams, message)
}

func projectNotFound(projectID string) error {
	return rpc.NewRPCError(rpc.CodeNotFound, "project not found: "+projectID)
}

// toRPCError maps store errors onto the RPC error contract.
func toRPCError(err error, projectID string) error {
	switch {
	case err == nil:
		return nil
	case isNotFound(err):
		return projectNotFound(projectID)
	case errors.Is(err, sqlite.ErrProjectConflict):
		return invalidParams("a project with this task prefix or repository already exists in this organization")
	default:
		return err
	}
}
