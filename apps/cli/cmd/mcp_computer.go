package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	daemonclient "yishan/apps/cli/internal/daemon/client"
)

func registerComputerTools(server *mcp.Server, daemonClient *daemonclient.PersistentClient) {
	addComputerTool(server, daemonClient, "computer_permissions", "Read macOS Computer Use permission status.", "computer.permissions")
	addComputerTool(server, daemonClient, "computer_list_displays", "List available displays for Computer Use.", "computer.listDisplays")
	addComputerTool(server, daemonClient, "computer_list_applications", "List running applications for Computer Use.", "computer.listApplications")

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_list_windows", Description: "List windows with optional filters for pid, bundleId, title, visibility, and frontmost state."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			return callComputerTool(ctx, daemonClient, "computer.listWindows", map[string]any{"filter": args})
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_capture", Description: "Capture a display or window screenshot. Provide either displayId or windowId plus optional format/maxWidth/maxHeight/region."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			if displayID, _ := args["displayId"].(string); strings.TrimSpace(displayID) != "" {
				return callComputerTool(ctx, daemonClient, "computer.captureDisplay", map[string]any{"displayId": displayID, "options": args})
			}
			windowID, _ := args["windowId"].(string)
			if strings.TrimSpace(windowID) == "" {
				return textErrorResult("displayId or windowId is required"), nil, nil
			}
			return callComputerTool(ctx, daemonClient, "computer.captureWindow", map[string]any{"windowId": windowID, "options": args})
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_get_ui_tree", Description: "Inspect the Accessibility tree for an application, window, or pid target."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			target := map[string]any{}
			for _, key := range []string{"applicationId", "windowId", "elementId", "pid"} {
				if value, ok := args[key]; ok {
					target[key] = value
				}
			}
			options := map[string]any{}
			for _, key := range []string{"maxDepth", "maxNodes", "redactSensitive"} {
				if value, ok := args[key]; ok {
					options[key] = value
				}
			}
			return callComputerTool(ctx, daemonClient, "computer.getUITree", map[string]any{"target": target, "options": options})
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_find_element", Description: "Find the first Accessibility node in a tree by role, title, or value."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			treeResult, _, err := callComputerTool(ctx, daemonClient, "computer.getUITree", map[string]any{
				"target": map[string]any{
					"applicationId": args["applicationId"],
					"windowId":      args["windowId"],
					"pid":           args["pid"],
				},
				"options": map[string]any{"redactSensitive": true},
			})
			if err != nil || treeResult.IsError {
				return treeResult, nil, err
			}
			node, findErr := findMatchingNodeFromResult(treeResult, args)
			if findErr != nil {
				return textErrorResult(findErr.Error()), nil, nil
			}
			encoded, encodeErr := json.MarshalIndent(node, "", "  ")
			if encodeErr != nil {
				return textErrorResult(fmt.Sprintf("failed to encode node: %v", encodeErr)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_perform_action", Description: "Perform an Accessibility action on an element. Set approved=true for mutating operations after user approval."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			return callComputerTool(ctx, daemonClient, "computer.performAction", args)
		},
	)
	addComputerTool(server, daemonClient, "computer_focus_window", "Focus a window by id. Set approved=true after user approval.", "computer.focusWindow")
	addComputerTool(server, daemonClient, "computer_launch_application", "Launch an application by bundleId. Set approved=true after user approval.", "computer.launchApplication")
	addComputerTool(server, daemonClient, "computer_click", "Send a mouse click. Set approved=true after user approval.", "computer.click")
	addComputerTool(server, daemonClient, "computer_drag", "Send a mouse drag. Set approved=true after user approval.", "computer.drag")
	addComputerTool(server, daemonClient, "computer_scroll", "Send a scroll event. Set approved=true after user approval.", "computer.scroll")

	mcp.AddTool(server,
		&mcp.Tool{Name: "computer_type", Description: "Type text into the focused application. Set approved=true after user approval."},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			return callComputerTool(ctx, daemonClient, "computer.typeText", args)
		},
	)
	addComputerTool(server, daemonClient, "computer_key", "Send a keyboard key or shortcut. Set approved=true after user approval.", "computer.sendKey")
	addComputerTool(server, daemonClient, "computer_clipboard_read", "Read clipboard text. Set approved=true after user approval.", "computer.readClipboard")
	addComputerTool(server, daemonClient, "computer_clipboard_write", "Write clipboard text. Set approved=true after user approval.", "computer.writeClipboard")
}

func addComputerTool(server *mcp.Server, daemonClient *daemonclient.PersistentClient, name string, description string, method string) {
	mcp.AddTool(server,
		&mcp.Tool{Name: name, Description: description},
		func(ctx context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			return callComputerTool(ctx, daemonClient, method, args)
		},
	)
}

func callComputerTool(ctx context.Context, daemonClient *daemonclient.PersistentClient, method string, args any) (*mcp.CallToolResult, any, error) {
	var result any
	if err := daemonClient.CallContext(ctx, method, args, &result); err != nil {
		return textErrorResult(fmt.Sprintf("%s failed: %v", method, err)), nil, nil
	}
	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return textErrorResult(fmt.Sprintf("failed to encode %s result: %v", method, err)), nil, nil
	}
	return textResult(string(encoded)), nil, nil
}

func findMatchingNodeFromResult(result *mcp.CallToolResult, args map[string]any) (map[string]any, error) {
	if len(result.Content) == 0 {
		return nil, fmt.Errorf("empty ui tree result")
	}
	textContent, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		return nil, fmt.Errorf("unexpected ui tree content type")
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(textContent.Text), &root); err != nil {
		return nil, fmt.Errorf("failed to decode ui tree: %w", err)
	}
	role, _ := args["role"].(string)
	title, _ := args["title"].(string)
	value, _ := args["value"].(string)
	node := findMatchingNode(root, role, title, value)
	if node == nil {
		return nil, fmt.Errorf("no matching element found")
	}
	return node, nil
}

func findMatchingNode(node map[string]any, role string, title string, value string) map[string]any {
	if matchesNode(node, role, title, value) {
		return node
	}
	children, _ := node["children"].([]any)
	for _, child := range children {
		childNode, ok := child.(map[string]any)
		if !ok {
			continue
		}
		if result := findMatchingNode(childNode, role, title, value); result != nil {
			return result
		}
	}
	return nil
}

func matchesNode(node map[string]any, role string, title string, value string) bool {
	if role != "" && !strings.EqualFold(stringValue(node["role"]), role) {
		return false
	}
	if title != "" && !strings.Contains(strings.ToLower(stringValue(node["title"])), strings.ToLower(title)) {
		return false
	}
	if value != "" && !strings.Contains(strings.ToLower(stringValue(node["value"])), strings.ToLower(value)) {
		return false
	}
	return role != "" || title != "" || value != ""
}

func stringValue(value any) string {
	stringValue, _ := value.(string)
	return stringValue
}
