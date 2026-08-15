package node

import (
	"context"

	"yishan/apps/cli/internal/rpc"
)

// FileService implementation: each method resolves the workspace handle and
// performs one file operation.

func (s *Services) FileRead(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	content, err := handle.FileRead(req.Path)
	if err != nil {
		return nil, err
	}
	return map[string]string{"content": content}, nil
}

func (s *Services) FileList(ctx context.Context, req rpc.FileListParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileList(req.Path, req.Recursive)
}

func (s *Services) FileSearch(ctx context.Context, req rpc.FileSearchParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileSearch(req.Query, req.Limit, req.IncludeDirectories)
}

func (s *Services) FileStat(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileStat(req.Path)
}

func (s *Services) FileWrite(ctx context.Context, req rpc.FileWriteParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileWrite(req.Path, req.Content, req.Mode)
}

func (s *Services) FileDelete(ctx context.Context, req rpc.FileDeleteParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileDelete(req.Path, req.Recursive); err != nil {
		return nil, err
	}
	return map[string]bool{"deleted": true}, nil
}

func (s *Services) FileMove(ctx context.Context, req rpc.FileMoveParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileMove(req.FromPath, req.ToPath); err != nil {
		return nil, err
	}
	return map[string]bool{"moved": true}, nil
}

func (s *Services) FileMkdir(ctx context.Context, req rpc.FileMkdirParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.FileMkdir(req.Path, req.Parents, req.Mode); err != nil {
		return nil, err
	}
	return map[string]bool{"created": true}, nil
}

func (s *Services) FileDiff(ctx context.Context, req rpc.FileReadParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileReadDiff(ctx, req.Path)
}
