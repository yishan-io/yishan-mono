package terminal

type processInfo struct {
	PID  int
	PPID int
}

type listeningPort struct {
	PID         int
	Address     string
	Port        int
	ProcessName string
}
