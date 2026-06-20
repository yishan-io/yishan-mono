package computer

import "context"

type approvalContextKey struct{}

func WithApproval(ctx context.Context, approved bool) context.Context {
	return context.WithValue(ctx, approvalContextKey{}, approved)
}

func ApprovalFromContext(ctx context.Context) bool {
	approved, _ := ctx.Value(approvalContextKey{}).(bool)
	return approved
}
