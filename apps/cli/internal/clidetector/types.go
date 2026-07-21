package clidetector

type Status struct {
	ToolID         string `json:"toolId"`
	Category       string `json:"category"`
	Label          string `json:"label"`
	Installed      bool   `json:"installed"`
	Version        string `json:"version,omitempty"`
	Authenticated  *bool  `json:"authenticated,omitempty"`
	Account        string `json:"account,omitempty"`
	StatusDetail   string `json:"statusDetail"`
	SupportsToggle bool   `json:"supportsToggle,omitempty"`
}

type Detector interface {
	Detect(forceRefresh bool) []Status
}
