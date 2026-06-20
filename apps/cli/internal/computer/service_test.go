package computer

import (
	"context"
	"testing"
)

type stubRuntime struct {
	NoopRuntime
	applications []Application
	sensitive    bool
	clipboard    ClipboardContent
}

func (r stubRuntime) ListApplications(context.Context) ([]Application, error) {
	return r.applications, nil
}

func (r stubRuntime) Click(context.Context, ClickRequest) error {
	return nil
}

func (r stubRuntime) TypeText(context.Context, string) error {
	return nil
}

func (r stubRuntime) WriteClipboard(context.Context, ClipboardContent) error {
	return nil
}

func (r stubRuntime) FocusedElementIsSensitive(context.Context) (bool, error) {
	return r.sensitive, nil
}

func TestServiceTypeTextRequiresApproval(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{applications: []Application{{BundleID: "com.apple.Terminal", Frontmost: true}}})
	err := svc.TypeText(context.Background(), "hello")
	if err == nil {
		t.Fatal("expected approval error")
	}
	computerErr := err.(*Error)
	if computerErr.Code != ErrorCodeApprovalRequired {
		t.Fatalf("expected approval_required, got %q", computerErr.Code)
	}
}

func TestServiceBlocksSensitiveTyping(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{applications: []Application{{BundleID: "com.apple.Terminal", Frontmost: true}}, sensitive: true})
	err := svc.TypeText(WithApproval(context.Background(), true), "secret")
	if err == nil {
		t.Fatal("expected sensitive target error")
	}
	computerErr := err.(*Error)
	if computerErr.Code != ErrorCodeSensitiveTarget {
		t.Fatalf("expected sensitive_target, got %q", computerErr.Code)
	}
}

func TestServiceBlocksPasswordManager(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{applications: []Application{{BundleID: "com.1password.1password", Frontmost: true}}})
	err := svc.Click(WithApproval(context.Background(), true), ClickRequest{})
	if err == nil {
		t.Fatal("expected blocked application error")
	}
	computerErr := err.(*Error)
	if computerErr.Code != ErrorCodeApplicationBlocked {
		t.Fatalf("expected application_blocked, got %q", computerErr.Code)
	}
}

func TestServiceWriteClipboardRequiresApproval(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{})
	err := svc.WriteClipboard(context.Background(), ClipboardContent{Text: "hello"})
	if err == nil {
		t.Fatal("expected approval error")
	}
	computerErr := err.(*Error)
	if computerErr.Code != ErrorCodeApprovalRequired {
		t.Fatalf("expected approval_required, got %q", computerErr.Code)
	}
}

func TestServiceWriteClipboardApprovedSucceeds(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{})
	err := svc.WriteClipboard(WithApproval(context.Background(), true), ClipboardContent{Text: "hello"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	events := svc.AuditEvents()
	if len(events) == 0 || events[len(events)-1].Operation != "clipboard.write" || events[len(events)-1].Result != "success" {
		t.Fatalf("expected clipboard.write success audit event, got %#v", events)
	}
}

func TestServiceFocusWindowMissingTargetReturnsTargetNotFound(t *testing.T) {
	t.Parallel()

	svc := NewService(stubRuntime{})
	err := svc.FocusWindow(WithApproval(context.Background(), true), "window_999")
	if err == nil {
		t.Fatal("expected target not found error")
	}
	computerErr := err.(*Error)
	if computerErr.Code != ErrorCodeTargetNotFound {
		t.Fatalf("expected target_not_found, got %q", computerErr.Code)
	}
}
