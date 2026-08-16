package rpc

import (
	"context"
	"encoding/json"
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
		return h.Services.Read(ctx, req)
	case MethodFileList:
		var req FileListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.List(ctx, req)
	case MethodFileSearch:
		var req FileSearchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Search(ctx, req)
	case MethodFileStat:
		var req FileReadParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Stat(ctx, req)
	case MethodFileWrite:
		var req FileWriteParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Write(ctx, req)
	case MethodFileDelete:
		var req FileDeleteParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Delete(ctx, req)
	case MethodFileMove:
		var req FileMoveParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Move(ctx, req)
	case MethodFileMkdir:
		var req FileMkdirParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Mkdir(ctx, req)
	case MethodFileDiff:
		var req FileReadParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Diff(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown file method: "+method)
	}
}
