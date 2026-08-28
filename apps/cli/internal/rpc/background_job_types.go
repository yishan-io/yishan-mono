package rpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"yishan/apps/cli/internal/backgroundjob"
)

// BackgroundJobCreateParams is the complete caller-controlled create contract.
type BackgroundJobCreateParams struct {
	WorkspaceID string `json:"workspaceId"`
	Prompt      string `json:"prompt"`
	Model       string `json:"model"`
}

// BackgroundJobGetParams identifies a job within an authoritative workspace.
type BackgroundJobGetParams struct {
	WorkspaceID string `json:"workspaceId"`
	JobID       string `json:"jobId"`
}

// BackgroundJobListParams identifies the authoritative workspace to list.
type BackgroundJobListParams struct {
	WorkspaceID string `json:"workspaceId"`
}

// BackgroundJobCancelParams identifies a job within an authoritative workspace.
type BackgroundJobCancelParams struct {
	WorkspaceID string `json:"workspaceId"`
	JobID       string `json:"jobId"`
}

// BackgroundJobResult is the RPC-safe durable job projection.
type BackgroundJobResult = backgroundjob.PublicJob

// BackgroundJobListResult is the bounded job list response.
type BackgroundJobListResult struct {
	Jobs []BackgroundJobResult `json:"jobs"`
}

func (p *BackgroundJobCreateParams) UnmarshalJSON(raw []byte) error {
	type wire BackgroundJobCreateParams
	return decodeStrictObject(raw, (*wire)(p))
}
func (p *BackgroundJobGetParams) UnmarshalJSON(raw []byte) error {
	type wire BackgroundJobGetParams
	return decodeStrictObject(raw, (*wire)(p))
}
func (p *BackgroundJobListParams) UnmarshalJSON(raw []byte) error {
	type wire BackgroundJobListParams
	return decodeStrictObject(raw, (*wire)(p))
}
func (p *BackgroundJobCancelParams) UnmarshalJSON(raw []byte) error {
	type wire BackgroundJobCancelParams
	return decodeStrictObject(raw, (*wire)(p))
}

func decodeStrictObject(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("unexpected trailing JSON value")
		}
		return err
	}
	return nil
}
