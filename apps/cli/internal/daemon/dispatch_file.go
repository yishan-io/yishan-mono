package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchFile(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodFileRead:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		content, err := h.manager.FileRead(req.WorkspaceID, req.Path)
		if err != nil {
			return nil, err
		}
		return map[string]string{"content": content}, nil
	case MethodFileList:
		var req fileListParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileList(req.WorkspaceID, req.Path, req.Recursive)
	case MethodFileSearch:
		var req fileSearchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileSearch(req.WorkspaceID, req.Query, req.Limit)
	case MethodFileStat:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileStat(req.WorkspaceID, req.Path)
	case MethodFileWrite:
		var req fileWriteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileWrite(req.WorkspaceID, req.Path, req.Content, req.Mode)
	case MethodFileDelete:
		var req fileDeleteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileDelete(req.WorkspaceID, req.Path, req.Recursive); err != nil {
			return nil, err
		}
		return map[string]bool{"deleted": true}, nil
	case MethodFileMove:
		var req fileMoveParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMove(req.WorkspaceID, req.FromPath, req.ToPath); err != nil {
			return nil, err
		}
		return map[string]bool{"moved": true}, nil
	case MethodFileMkdir:
		var req fileMkdirParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.FileMkdir(req.WorkspaceID, req.Path, req.Parents, req.Mode); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodFileDiff:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.FileReadDiff(ctx, req.WorkspaceID, req.Path)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown file method: "+method)
	}
}
