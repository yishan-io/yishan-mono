package localtask

// Template is one personal Markdown task description template.
type Template struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Content string `json:"content"`
}

// TemplatesData is the serialised profile/account preference file.
type TemplatesData struct {
	Version        int        `json:"version"`
	Templates      []Template `json:"templates"`
	AgentDefaultID string     `json:"agentDefaultId"`
}
