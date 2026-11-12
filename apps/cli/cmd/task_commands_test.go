package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	daemonclient "yishan/apps/cli/internal/daemon/client"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

type recordedRPCCall struct {
	method string
	params any
}

type fakeTaskDaemonClient struct {
	calls  []recordedRPCCall
	handle func(method string, params any, out any) error
}

func (client *fakeTaskDaemonClient) Call(method string, params any, out any) error {
	client.calls = append(client.calls, recordedRPCCall{method: method, params: params})
	if client.handle == nil {
		return nil
	}
	return client.handle(method, params, out)
}

func (client *fakeTaskDaemonClient) CallContext(_ context.Context, method string, params any, out any) error {
	return client.Call(method, params, out)
}

func (client *fakeTaskDaemonClient) SetNotificationHandler(func(string, json.RawMessage)) {}

func (client *fakeTaskDaemonClient) Close() error { return nil }

func (client *fakeTaskDaemonClient) methods() []string {
	methods := make([]string, 0, len(client.calls))
	for _, call := range client.calls {
		methods = append(methods, call.method)
	}
	return methods
}

func useFakeTaskDaemon(t *testing.T, client *fakeTaskDaemonClient) {
	t.Helper()
	original := newTaskDaemonClient
	newTaskDaemonClient = func(context.Context) (persistentDaemonRPCClient, error) { return client, nil }
	t.Cleanup(func() { newTaskDaemonClient = original })
}

func newTestTaskCommand(name string, run func(*cobra.Command, []string) error, register func(*cobra.Command)) *cobra.Command {
	command := &cobra.Command{Use: name, RunE: run, Args: cobra.ArbitraryArgs}
	command.SetOut(io.Discard)
	command.SetErr(io.Discard)
	register(command)
	return command
}

func TestResolveTaskScope_PrefersExplicitFlagAndFallsBackToEnvironment(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "env-project")
	t.Setenv("YISHAN_ORG_ID", "env-org")

	scope, err := resolveTaskScope("flag-project", false, "")
	if err != nil || scope.projectID == nil || *scope.projectID != "flag-project" {
		t.Fatalf("explicit scope = %#v, %v", scope, err)
	}
	if scope.organizationID == nil || *scope.organizationID != "env-org" {
		t.Fatalf("organization = %#v", scope.organizationID)
	}

	scope, err = resolveTaskScope("", false, "flag-org")
	if err != nil || scope.projectID == nil || *scope.projectID != "env-project" {
		t.Fatalf("environment scope = %#v, %v", scope, err)
	}
	if scope.organizationID == nil || *scope.organizationID != "flag-org" {
		t.Fatalf("explicit organization = %#v", scope.organizationID)
	}
}

func TestResolveTaskScope_RequiresExplicitGlobalOrProject(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "")
	if _, err := resolveTaskScope("", false, ""); err == nil {
		t.Fatal("expected missing scope error")
	}
	if _, err := resolveTaskScope("project-1", true, ""); err == nil {
		t.Fatal("expected --global conflict error")
	}
	scope, err := resolveTaskScope("", true, "")
	if err != nil || scope.projectID != nil {
		t.Fatalf("global scope = %#v, %v", scope, err)
	}
	t.Setenv("YISHAN_PROJECT_ID", "env-project")
	scope, err = resolveTaskScope("", true, "")
	if err != nil || scope.projectID != nil {
		t.Fatalf("global scope with environment project = %#v, %v", scope, err)
	}
}

func TestBuildTaskDescription_SectionsAndExclusivity(t *testing.T) {
	command := newTestTaskCommand("start", runTaskStart, registerTaskStartFlags)
	if err := command.Flags().Set("description", "Plain description"); err != nil {
		t.Fatal(err)
	}
	description, err := buildTaskDescription(command)
	if err != nil || description != "Plain description" {
		t.Fatalf("description = %q, %v", description, err)
	}

	if err := command.Flags().Set("goal", "Repair login"); err != nil {
		t.Fatal(err)
	}
	if _, err := buildTaskDescription(command); err == nil {
		t.Fatal("expected description/sections conflict error")
	}

	command = newTestTaskCommand("start", runTaskStart, registerTaskStartFlags)
	command.Flags().Set("goal", "Repair login")
	command.Flags().Set("context", "Login fails after upgrade.")
	command.Flags().Set("acceptance-criterion", "Login works")
	description, err = buildTaskDescription(command)
	if err != nil {
		t.Fatalf("buildTaskDescription: %v", err)
	}
	want := "## Goal\n\nRepair login\n\n## Context\n\nLogin fails after upgrade.\n\n## Acceptance Criteria\n\n- Login works"
	if description != want {
		t.Fatalf("description = %q, want %q", description, want)
	}
}

func TestBuildTaskUpdateRequest_RejectsDoneAndEmptyUpdates(t *testing.T) {
	command := newTestTaskCommand("update", runTaskUpdate, registerTaskUpdateFlags)
	if _, err := buildTaskUpdateRequest(command); err == nil {
		t.Fatal("expected empty update error")
	}
	command.Flags().Set("status", "done")
	if _, err := buildTaskUpdateRequest(command); err == nil || !strings.Contains(err.Error(), "task finish") {
		t.Fatalf("done status error = %v", err)
	}
	command.Flags().Set("status", "progressing")
	update, err := buildTaskUpdateRequest(command)
	if err != nil || update.Status == nil || *update.Status != localtask.StatusProgressing {
		t.Fatalf("update = %#v, %v", update, err)
	}
}

func TestBuildTaskListRequest_PassesScopeAndRejectsInvalidStatus(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "env-project")
	command := newTestTaskCommand("list", runTaskList, registerTaskListFlags)
	command.Flags().Set("status", "new")
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		t.Fatalf("readTaskScopeFlags: %v", err)
	}
	request, err := buildTaskListRequest(command, scope)
	if err != nil || request.ProjectID == nil || *request.ProjectID != "env-project" {
		t.Fatalf("list request = %#v, %v", request, err)
	}
	if len(request.Status) != 1 || request.Status[0] != "new" {
		t.Fatalf("status filter = %#v", request.Status)
	}
	command.Flags().Set("status", "unknown")
	if _, err := buildTaskListRequest(command, scope); err == nil {
		t.Fatal("expected invalid status error")
	}
}

func TestRunTaskList_FiltersTasksOutsideScope(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "")
	global := scopedTestTask()
	global.ProjectID = nil
	projectTask := scopedTestTask()
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		if method == rpc.MethodLocalTaskList {
			tasks := out.(*[]localtask.Task)
			*tasks = append(*tasks, global, projectTask)
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("list", runTaskList, registerTaskListFlags)
	command.Flags().Set("global", "true")
	printed := captureStdout(t, func() {
		if err := runTaskList(command, nil); err != nil {
			t.Fatalf("runTaskList: %v", err)
		}
	})
	if !strings.Contains(printed, "task-1") || strings.Contains(printed, "project-1") {
		t.Fatalf("global list output = %q", printed)
	}
	request := client.calls[0].params.(taskListRequest)
	if request.ProjectID != nil {
		t.Fatalf("global request project = %v", *request.ProjectID)
	}
}

func TestClassifyError_MapsUsageValidationAndServerCodes(t *testing.T) {
	if code := ClassifyError(newUsageError("--title is required")); code != "validation_error" {
		t.Fatalf("usage error code = %q", code)
	}
	if code := ClassifyError(&daemonclient.RPCError{Code: rpc.CodeServerError, Message: "boom"}); code != "server_error" {
		t.Fatalf("server error code = %q", code)
	}
	if code := ClassifyError(&daemonclient.RPCError{Code: rpc.CodePathRestricted, Message: "path"}); code != "permission_denied" {
		t.Fatalf("restricted path code = %q", code)
	}
}

func TestRunTaskStart_SendsCreateRequestAndLinksWorkspace(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		switch method {
		case rpc.MethodLocalTaskCreate:
			task := out.(*localtask.Task)
			task.ID = "task-1"
			task.ProjectID = stringPointer("project-1")
			task.Status = localtask.StatusNew
		case rpc.MethodLocalTaskLinkWorkspace:
			link := out.(*localtask.WorkspaceLink)
			link.ID = "link-1"
			link.LocalTaskID = "task-1"
			link.WorkspaceID = "workspace-1"
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("start", runTaskStart, registerTaskStartFlags)
	command.Flags().Set("title", "  Repair login  ")
	command.Flags().Set("goal", "Repair login")
	command.Flags().Set("priority", "high")
	command.Flags().Set("workspace-id", "workspace-1")

	if err := runTaskStart(command, nil); err != nil {
		t.Fatalf("runTaskStart: %v", err)
	}
	methods := client.methods()
	if len(methods) != 2 || methods[0] != rpc.MethodLocalTaskCreate || methods[1] != rpc.MethodLocalTaskLinkWorkspace {
		t.Fatalf("calls = %#v", methods)
	}
	create := client.calls[0].params.(rpc.LocalTaskCreateParams)
	if create.Title != "Repair login" || create.Description != "## Goal\n\nRepair login" ||
		create.ProjectID == nil || *create.ProjectID != "project-1" || create.Priority != localtask.PriorityHigh {
		t.Fatalf("create params = %#v", create)
	}
	link := client.calls[1].params.(rpc.LocalTaskLinkWorkspaceParams)
	if link.TaskID != "task-1" || link.WorkspaceID != "workspace-1" {
		t.Fatalf("link params = %#v", link)
	}
}

func TestRunTaskStart_ReportsLinkFailureAfterCreation(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		if method == rpc.MethodLocalTaskCreate {
			out.(*localtask.Task).ID = "task-1"
			return nil
		}
		return errors.New("workspace not found")
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("start", runTaskStart, registerTaskStartFlags)
	command.Flags().Set("title", "Repair login")
	command.Flags().Set("workspace-id", "workspace-9")
	err := runTaskStart(command, nil)
	if err == nil || !strings.Contains(err.Error(), "created but could not be linked") {
		t.Fatalf("link failure error = %v", err)
	}
}

func TestRunTaskRead_PrintsBriefAndDocuments(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		switch method {
		case rpc.MethodLocalTaskGet:
			task := out.(*localtask.Task)
			*task = scopedTestTask()
		case rpc.MethodLocalTaskReadDocument:
			request := out.(*rpc.LocalTaskDocumentResult)
			request.ID, request.Document, request.Content = "task-1", "plan", "# Plan\n"
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("read", runTaskRead, registerTaskReadFlags)
	brief := captureStdout(t, func() {
		if err := runTaskRead(command, []string{"task-1"}); err != nil {
			t.Fatalf("runTaskRead brief: %v", err)
		}
	})
	if !strings.Contains(brief, "# Repair login") || !strings.Contains(brief, "**Status:** progressing") {
		t.Fatalf("brief = %q", brief)
	}

	command.Flags().Set("document", "plan")
	plan := captureStdout(t, func() {
		if err := runTaskRead(command, []string{"task-1"}); err != nil {
			t.Fatalf("runTaskRead plan: %v", err)
		}
	})
	if !strings.Contains(plan, "# Plan") {
		t.Fatalf("plan output = %q", plan)
	}
	readParams := client.calls[len(client.calls)-1].params.(rpc.LocalTaskReadDocumentParams)
	if readParams.ID != "task-1" || readParams.Document != "plan" {
		t.Fatalf("read params = %#v", readParams)
	}
}

func TestRunTaskRead_RejectsCrossScopeTaskAndUnknownID(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		switch method {
		case rpc.MethodLocalTaskGet:
			task := out.(*localtask.Task)
			*task = scopedTestTask()
			task.ProjectID = stringPointer("project-2")
		case rpc.MethodLocalTaskSearch:
			return nil
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("read", runTaskRead, registerTaskReadFlags)
	if err := runTaskRead(command, []string{"task-1"}); err == nil || !strings.Contains(err.Error(), "does not belong") {
		t.Fatalf("cross scope error = %v", err)
	}

	client.handle = func(method string, _ any, _ any) error {
		if method == rpc.MethodLocalTaskGet || method == rpc.MethodLocalTaskSearch {
			return &daemonclient.RPCError{Code: rpc.CodeNotFound, Message: "local task not found"}
		}
		return nil
	}
	err := runTaskRead(command, []string{"missing"})
	if !isRPCCode(err, rpc.CodeNotFound) {
		t.Fatalf("unknown task error = %v", err)
	}
	if code := ClassifyError(err); code != "not_found" {
		t.Fatalf("classify = %q", code)
	}
}

func TestLoadScopedTask_FallsBackToStableKey(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		switch method {
		case rpc.MethodLocalTaskGet:
			return &daemonclient.RPCError{Code: rpc.CodeNotFound, Message: "local task not found"}
		case rpc.MethodLocalTaskSearch:
			keyed := scopedTestTask()
			keyed.TaskKey = stringPointer("YISHAN-12")
			results := out.(*[]localtask.SearchResult)
			*results = append(*results, localtask.SearchResult{Task: keyed})
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	scope, err := resolveTaskScope("", false, "")
	if err != nil {
		t.Fatal(err)
	}
	task, err := loadScopedTask(client, scope, "YISHAN-12")
	if err != nil || task.ID != "task-1" {
		t.Fatalf("loadScopedTask = %#v, %v", task, err)
	}
}

func TestRunTaskWrite_ResolvesContentSources(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		if method == rpc.MethodLocalTaskGet {
			*out.(*localtask.Task) = scopedTestTask()
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	contentFile := t.TempDir() + "/plan.md"
	if err := os.WriteFile(contentFile, []byte("# Plan from file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	command := newTestTaskCommand("write", runTaskWrite, registerTaskWriteFlags)
	command.Flags().Set("document", "plan")
	command.Flags().Set("file", contentFile)
	if err := runTaskWrite(command, []string{"task-1"}); err != nil {
		t.Fatalf("runTaskWrite file: %v", err)
	}
	writeParams := client.calls[len(client.calls)-1].params.(rpc.LocalTaskWriteDocumentParams)
	if writeParams.Document != "plan" || writeParams.Content != "# Plan from file\n" {
		t.Fatalf("write params = %#v", writeParams)
	}

	command = newTestTaskCommand("append-note", runTaskAppendNote, registerTaskAppendNoteFlags)
	command.Flags().Set("file", "-")
	command.SetIn(strings.NewReader("note from stdin\n"))
	if err := runTaskAppendNote(command, []string{"task-1"}); err != nil {
		t.Fatalf("runTaskAppendNote stdin: %v", err)
	}
	appendParams := client.calls[len(client.calls)-1].params.(rpc.LocalTaskAppendNoteParams)
	if appendParams.Content != "note from stdin\n" {
		t.Fatalf("append params = %#v", appendParams)
	}

	command = newTestTaskCommand("write", runTaskWrite, registerTaskWriteFlags)
	command.Flags().Set("document", "plan")
	command.Flags().Set("content", "inline")
	command.Flags().Set("file", "-")
	if err := runTaskWrite(command, []string{"task-1"}); err == nil {
		t.Fatal("expected content source conflict error")
	}
}

func TestRunTaskFinish_SendsOutcome(t *testing.T) {
	t.Setenv("YISHAN_PROJECT_ID", "project-1")
	client := &fakeTaskDaemonClient{handle: func(method string, _ any, out any) error {
		switch method {
		case rpc.MethodLocalTaskGet:
			*out.(*localtask.Task) = scopedTestTask()
		case rpc.MethodLocalTaskFinish:
			result := out.(*rpc.LocalTaskFinishResult)
			result.ID, result.Status = "task-1", localtask.StatusDone
		}
		return nil
	}}
	useFakeTaskDaemon(t, client)

	command := newTestTaskCommand("finish", runTaskFinish, registerTaskFinishFlags)
	command.Flags().Set("outcome", "Done; tests pass.")
	if err := runTaskFinish(command, []string{"task-1"}); err != nil {
		t.Fatalf("runTaskFinish: %v", err)
	}
	finishParams := client.calls[len(client.calls)-1].params.(rpc.LocalTaskFinishParams)
	if finishParams.Outcome != "Done; tests pass." {
		t.Fatalf("finish params = %#v", finishParams)
	}
}

func scopedTestTask() localtask.Task {
	return localtask.Task{
		ID: "task-1", ProjectID: stringPointer("project-1"), Title: "Repair login",
		Description: "## Goal\n\nRepair login", Status: localtask.StatusProgressing,
		Priority: localtask.PriorityMedium, CreatedAt: "2026-11-12", UpdatedAt: "2026-11-12",
		Tags: []string{"cli"},
	}
}

func stringPointer(value string) *string { return &value }

// captureStdout collects everything written to os.Stdout by run.
func captureStdout(t *testing.T, run func()) string {
	t.Helper()
	original := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = writer
	run()
	_ = writer.Close()
	os.Stdout = original
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read captured output: %v", err)
	}
	return string(output)
}
