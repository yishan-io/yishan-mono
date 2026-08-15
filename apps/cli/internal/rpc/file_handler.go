package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpcerror"
)

// FileHandler owns the file.* RPC namespace decoding.
type FileHandler struct {
	Services FileService
}

// Call implements Handler.
func (h *FileHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodFileRead:
		var req FileReadParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileRead(ctx, req)
	case MethodFileList:
		var req FileListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileList(ctx, req)
	case MethodFileSearch:
		var req FileSearchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileSearch(ctx, req)
	case MethodFileStat:
		var req FileReadParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileStat(ctx, req)
	case MethodFileWrite:
		var req FileWriteParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileWrite(ctx, req)
	case MethodFileDelete:
		var req FileDeleteParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileDelete(ctx, req)
	case MethodFileMove:
		var req FileMoveParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileMove(ctx, req)
	case MethodFileMkdir:
		var req FileMkdirParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileMkdir(ctx, req)
	case MethodFileDiff:
		var req FileReadParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FileDiff(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown file method: "+method)
	}
}
