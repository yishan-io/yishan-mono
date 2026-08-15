package daemon

import (
	"context"

	"yishan/apps/cli/internal/rpc"
)

// FileService implementation: each method resolves the workspace handle and
// performs one file operation.

func (h *JSONRPCHandler) FileRead(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	content, err := handle.FileRead(req.Path)
	if err != nil {
		return nil, err
	}
	return map[string]string{"content": content}, nil
}

func (h *JSONRPCHandler) FileList(ctx context.Context, req rpc.FileListParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileList(req.Path, req.Recursive)
}

func (h *JSONRPCHandler) FileSearch(ctx context.Context, req rpc.FileSearchParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileSearch(req.Query, req.Limit, req.IncludeDirectories)
}

func (h *JSONRPCHandler) FileStat(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileStat(req.Path)
}

func (h *JSONRPCHandler) FileWrite(ctx context.Context, req rpc.FileWriteParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileWrite(req.Path, req.Content, req.Mode)
}

func (h *JSONRPCHandler) FileDelete(ctx context.Context, req rpc.FileDeleteParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileDelete(req.Path, req.Recursive); err != nil {
		return nil, err
	}
	return map[string]bool{"deleted": true}, nil
}

func (h *JSONRPCHandler) FileMove(ctx context.Context, req rpc.FileMoveParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileMove(req.FromPath, req.ToPath); err != nil {
		return nil, err
	}
	return map[string]bool{"moved": true}, nil
}

func (h *JSONRPCHandler) FileMkdir(ctx context.Context, req rpc.FileMkdirParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileMkdir(req.Path, req.Parents, req.Mode); err != nil {
		return nil, err
	}
	return map[string]bool{"created": true}, nil
}

func (h *JSONRPCHandler) FileDiff(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileReadDiff(ctx, req.Path)
}
