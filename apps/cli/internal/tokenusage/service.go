package tokenusage

type Service interface {
	StartStartupScan()
	SyncNow(source string)
	Trigger(agentKind string, source string)
	RequestRecentRecoveryScan(source string)
	DebugState() CollectorDebugState
	Close()
}
