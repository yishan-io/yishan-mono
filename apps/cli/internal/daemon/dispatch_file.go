package daemon

import (
	"context"
	"encoding/base64"
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
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		content, err := handle.FileRead(req.Path)
		if err != nil {
			return nil, err
		}
		return map[string]string{"content": content}, nil
	case MethodFileList:
		var req fileListParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.FileList(req.Path, req.Recursive)
	case MethodFileSearch:
		var req fileSearchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.FileSearch(req.Query, req.Limit)
	case MethodFileStat:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.FileStat(req.Path)
	case MethodFileWrite:
		var req fileWriteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		content := req.Content
		if req.Encoding == "base64" {
			decodedContent, err := base64.StdEncoding.DecodeString(req.Content)
			if err != nil {
				return nil, workspace.NewRPCError(rpcCodeInvalidParams, "invalid base64 file content")
			}
			content = string(decodedContent)
		}
		if req.Encoding != "" && req.Encoding != "plain" && req.Encoding != "base64" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "unsupported file encoding")
		}
		return handle.FileWrite(req.Path, content, req.Mode)
	case MethodFileDelete:
		var req fileDeleteParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.FileDelete(req.Path, req.Recursive); err != nil {
			return nil, err
		}
		return map[string]bool{"deleted": true}, nil
	case MethodFileMove:
		var req fileMoveParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.FileMove(req.FromPath, req.ToPath); err != nil {
			return nil, err
		}
		return map[string]bool{"moved": true}, nil
	case MethodFileMkdir:
		var req fileMkdirParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := handle.FileMkdir(req.Path, req.Parents, req.Mode); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodFileDiff:
		var req fileReadParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.FileReadDiff(ctx, req.Path)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown file method: "+method)
	}
}
