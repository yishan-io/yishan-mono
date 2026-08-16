package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/workspace"
)

func fakeCallHandler(tag string) Handler {
	return HandlerFunc(func(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
		return tag, nil
	})
}

func TestRouter_DottedMethodRoutesToNamespace(t *testing.T) {
	router := NewRouter()
	router.Register("git", fakeCallHandler("git"))
	router.Register("system", fakeCallHandler("system"))

	got, err := router.Call(context.Background(), &Connection{}, "git.status", nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if got != "git" {
		t.Fatalf("routed to %v, want git handler", got)
	}
}

func TestRouter_BareMethodRoutesToExactRegistration(t *testing.T) {
	router := NewRouter()
	router.Register("list", fakeCallHandler("list"))
	router.Register("system", fakeCallHandler("system"))

	got, err := router.Call(context.Background(), &Connection{}, "list", nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if got != "list" {
		t.Fatalf("routed to %v, want list handler", got)
	}
}

func TestRouter_UnknownNamespaceFallsBackToSystem(t *testing.T) {
	router := NewRouter()
	router.Register("workspace", fakeCallHandler("workspace"))
	router.Register("system", fakeCallHandler("system"))

	got, err := router.Call(context.Background(), &Connection{}, "daemon.ping", nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if got != "system" {
		t.Fatalf("routed to %v, want system handler", got)
	}
}

func TestRouter_NoSystemHandlerReturnsMethodNotFound(t *testing.T) {
	router := NewRouter()

	_, err := router.Call(context.Background(), &Connection{}, "unknown.method", nil)
	var rpcErr *Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != CodeMethodNotFound {
		t.Fatalf("expected method-not-found RPC error, got %v", err)
	}
}

func TestHandleMessage_ParseError(t *testing.T) {
	server := NewServer(fakeCallHandler("ok"))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte("{not json"))
	if resp == nil || resp.Error == nil || resp.Error.Code != CodeParseError {
		t.Fatalf("expected parse error response, got %#v", resp)
	}
}

func TestHandleMessage_InvalidRequestVersion(t *testing.T) {
	server := NewServer(fakeCallHandler("ok"))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte(`{"jsonrpc":"1.0","id":1,"method":"list"}`))
	if resp == nil || resp.Error == nil || resp.Error.Code != CodeInvalidRequest {
		t.Fatalf("expected invalid request response, got %#v", resp)
	}
	if resp.ID != float64(1) {
		t.Fatalf("expected id echoed, got %#v", resp.ID)
	}
}

func TestHandleMessage_NotificationReturnsNil(t *testing.T) {
	server := NewServer(fakeCallHandler("ok"))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte(`{"jsonrpc":"2.0","method":"workspace.create"}`))
	if resp != nil {
		t.Fatalf("expected nil response for notification, got %#v", resp)
	}
}

func TestHandleMessage_Success(t *testing.T) {
	server := NewServer(fakeCallHandler("ok"))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte(`{"jsonrpc":"2.0","id":7,"method":"list"}`))
	if resp == nil || resp.Error != nil {
		t.Fatalf("unexpected error response: %#v", resp)
	}
	if resp.ID != float64(7) || resp.Result != "ok" {
		t.Fatalf("unexpected response: %#v", resp)
	}
}

func TestHandleMessage_StructuredRPCErrorPassthrough(t *testing.T) {
	server := NewServer(HandlerFunc(func(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
		return nil, NewRPCError(CodeNotFound, "workspace not found")
	}))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte(`{"jsonrpc":"2.0","id":1,"method":"workspace.health"}`))
	if resp == nil || resp.Error == nil || resp.Error.Code != CodeNotFound || resp.Error.Message != "workspace not found" {
		t.Fatalf("unexpected response: %#v", resp)
	}
}

func TestMapRPCError_WorkspaceDomainErrorsMappedToWireCodes(t *testing.T) {
	cases := []struct {
		name string
		code workspace.ErrorCode
		want int
	}{
		{"invalid params", workspace.ErrCodeInvalidParams, CodeInvalidParams},
		{"not found", workspace.ErrCodeNotFound, CodeNotFound},
		{"path restricted", workspace.ErrCodePathRestricted, CodePathRestricted},
		{"tool unavailable", workspace.ErrCodeToolUnavailable, CodeToolUnavailable},
		{"session inactive", workspace.ErrCodeSessionInactive, CodeSessionInactive},
		{"unknown code falls back to server error", "unmapped", CodeServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := MapRPCError(workspace.NewError(tc.code, "boom"))
			if got == nil || got.Code != tc.want {
				t.Fatalf("MapRPCError(%q) = %#v, want code %d", tc.code, got, tc.want)
			}
		})
	}
}

func TestMapRPCError_WorkspaceDomainErrorSurvivesWrapping(t *testing.T) {
	err := fmt.Errorf("wrapped: %w", workspace.NewError(workspace.ErrCodeNotFound, "workspace not found"))
	got := MapRPCError(err)
	if got == nil || got.Code != CodeNotFound || got.Message != "workspace not found" {
		t.Fatalf("MapRPCError(wrapped) = %#v, want code %d", got, CodeNotFound)
	}
}

func TestHandleMessage_ComputerErrorKeepsStructuredData(t *testing.T) {
	server := NewServer(HandlerFunc(func(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
		return nil, computer.NewErrorWithDetails("computer.Error", "boom", map[string]any{"k": "v"}, true)
	}))

	resp := server.HandleMessage(context.Background(), &Connection{}, []byte(`{"jsonrpc":"2.0","id":1,"method":"computer.health"}`))
	if resp == nil || resp.Error == nil || resp.Error.Code != CodeServerError {
		t.Fatalf("unexpected response: %#v", resp)
	}
	data, ok := resp.Error.Data.(map[string]any)
	if !ok {
		t.Fatalf("computer error data lost: %#v", resp.Error)
	}
	code, _ := data["code"].(computer.ErrorCode)
	retryable, _ := data["retryable"].(bool)
	if code != "computer.Error" || !retryable {
		t.Fatalf("computer error data lost: %#v", resp.Error)
	}
}

func TestHandleBinaryFrame_IgnoresMalformedFrames(t *testing.T) {
	calls := 0
	server := NewServer(fakeCallHandler("ok"))
	server.BinaryFrameHandler = BinaryFrameHandlerFunc(func(connection *Connection, opcode byte, sessionID string, payload []byte) {
		calls++
	})

	server.HandleBinaryFrame(&Connection{}, []byte{0x01, 0x61})
	if calls != 0 {
		t.Fatalf("expected short frame ignored, got %d calls", calls)
	}
	server.HandleBinaryFrame(&Connection{}, []byte{0x01, 0x61, 0x00, 0x78, 0x79})
	if calls != 1 {
		t.Fatalf("expected valid frame dispatched, got %d calls", calls)
	}
}

// BinaryFrameHandlerFunc adapts a plain function to BinaryFrameHandler.
type BinaryFrameHandlerFunc func(connection *Connection, opcode byte, sessionID string, payload []byte)

// HandleBinaryFrame implements BinaryFrameHandler.
func (f BinaryFrameHandlerFunc) HandleBinaryFrame(connection *Connection, opcode byte, sessionID string, payload []byte) {
	f(connection, opcode, sessionID, payload)
}

// TestWireMethodNamesCarryNamespaces guards the wire method naming contract:
// each dotted method routes to its namespace and no git method name is
// ambiguous with another namespace.
func TestWireMethodNamesCarryNamespaces(t *testing.T) {
	t.Parallel()

	gitMethods := []string{MethodGitPrMerge, MethodGitPrClose, MethodGitInspectPath}
	for _, method := range gitMethods {
		ns, _, found := strings.Cut(method, ".")
		if !found || ns != "git" {
			t.Fatalf("expected %q to route to git namespace", method)
		}
	}

	nonGitMethods := []string{"list", MethodWorkspaceCreate, MethodTerminalStart}
	for _, method := range nonGitMethods {
		ns, _, found := strings.Cut(method, ".")
		if found && ns == "git" {
			t.Fatalf("expected %q NOT to route to git namespace", method)
		}
	}
}
