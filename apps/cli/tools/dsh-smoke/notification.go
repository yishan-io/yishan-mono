package main

import "encoding/json"

func parseAssistantTextUpdate(line []byte, sessionID string) string {
	var notification struct {
		Method string `json:"method"`
		Params struct {
			SessionID string `json:"sessionId"`
			Update    struct {
				Kind    string `json:"sessionUpdate"`
				Content struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
			} `json:"update"`
		} `json:"params"`
	}
	if err := json.Unmarshal(line, &notification); err != nil {
		return ""
	}
	if notification.Method != "session/update" || notification.Params.SessionID != sessionID {
		return ""
	}
	if notification.Params.Update.Kind != "agent_message_chunk" || notification.Params.Update.Content.Type != "text" {
		return ""
	}
	return notification.Params.Update.Content.Text
}
