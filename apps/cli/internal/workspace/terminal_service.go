package workspace

import "yishan/apps/cli/internal/workspace/terminal"

type TerminalStartRequest = terminal.StartRequest
type TerminalStartResponse = terminal.StartResponse
type TerminalSendRequest = terminal.SendRequest
type TerminalSendResponse = terminal.SendResponse
type TerminalReadRequest = terminal.ReadRequest
type TerminalReadResponse = terminal.ReadResponse
type TerminalStopRequest = terminal.StopRequest
type TerminalStopResponse = terminal.StopResponse
type TerminalListSessionsRequest = terminal.ListSessionsRequest
type TerminalSessionSummary = terminal.SessionSummary
type TerminalDetectedPort = terminal.DetectedPort
type TerminalResizeRequest = terminal.ResizeRequest
type TerminalResizeResponse = terminal.ResizeResponse
type TerminalSubscribeRequest = terminal.SubscribeRequest
type TerminalSubscribeResponse = terminal.SubscribeResponse
type TerminalUnsubscribeRequest = terminal.UnsubscribeRequest
type TerminalUnsubscribeResponse = terminal.UnsubscribeResponse
type TerminalEvent = terminal.Event
type TerminalSubscription = terminal.Subscription
