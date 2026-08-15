package daemon

import "yishan/apps/cli/internal/rpc"

// JSON-RPC method names, aliased from internal/rpc (the wire protocol owner).
const (
	MethodDaemonPing = rpc.MethodDaemonPing

	MethodList                        = rpc.MethodList
	MethodWorkspaceCreate             = rpc.MethodWorkspaceCreate
	MethodWorkspaceClose              = rpc.MethodWorkspaceClose
	MethodWorkspaceRefreshPullRequest = rpc.MethodWorkspaceRefreshPullRequest
	MethodWorkspaceSetActive          = rpc.MethodWorkspaceSetActive
	MethodWorkspaceSyncContextLink    = rpc.MethodWorkspaceSyncContextLink
	MethodWorkspaceHealth             = rpc.MethodWorkspaceHealth
	MethodWorkspaceOpenProject        = rpc.MethodWorkspaceOpenProject
	MethodWorkspaceCloseProject       = rpc.MethodWorkspaceCloseProject
	MethodWorkspaceCreateLocalFolder  = rpc.MethodWorkspaceCreateLocalFolder
	MethodWorkspaceListLocalFolders   = rpc.MethodWorkspaceListLocalFolders
	MethodWorkspaceDeleteLocalFolder  = rpc.MethodWorkspaceDeleteLocalFolder

	MethodContextGetState         = rpc.MethodContextGetState
	MethodContextSetCurrentOrg    = rpc.MethodContextSetCurrentOrg
	MethodContextSetActiveProject = rpc.MethodContextSetActiveProject
	MethodContextSetActiveFile    = rpc.MethodContextSetActiveFile

	MethodComputerHealth                 = rpc.MethodComputerHealth
	MethodComputerPermissions            = rpc.MethodComputerPermissions
	MethodComputerOpenPermissionSettings = rpc.MethodComputerOpenPermissionSettings
	MethodComputerListDisplays           = rpc.MethodComputerListDisplays
	MethodComputerListApplications       = rpc.MethodComputerListApplications
	MethodComputerListWindows            = rpc.MethodComputerListWindows
	MethodComputerCaptureDisplay         = rpc.MethodComputerCaptureDisplay
	MethodComputerCaptureWindow          = rpc.MethodComputerCaptureWindow
	MethodComputerGetUITree              = rpc.MethodComputerGetUITree
	MethodComputerPerformAction          = rpc.MethodComputerPerformAction
	MethodComputerFocusWindow            = rpc.MethodComputerFocusWindow
	MethodComputerLaunchApplication      = rpc.MethodComputerLaunchApplication
	MethodComputerMovePointer            = rpc.MethodComputerMovePointer
	MethodComputerClick                  = rpc.MethodComputerClick
	MethodComputerDrag                   = rpc.MethodComputerDrag
	MethodComputerScroll                 = rpc.MethodComputerScroll
	MethodComputerTypeText               = rpc.MethodComputerTypeText
	MethodComputerSendKey                = rpc.MethodComputerSendKey
	MethodComputerReadClipboard          = rpc.MethodComputerReadClipboard
	MethodComputerWriteClipboard         = rpc.MethodComputerWriteClipboard
	MethodComputerGetConfig              = rpc.MethodComputerGetConfig
	MethodComputerUpdateConfig           = rpc.MethodComputerUpdateConfig

	MethodProjectList               = rpc.MethodProjectList
	MethodProjectListWithWkspaces   = rpc.MethodProjectListWithWkspaces
	MethodProjectGetListPreferences = rpc.MethodProjectGetListPreferences
	MethodProjectSetListPreferences = rpc.MethodProjectSetListPreferences
	MethodNodeList                  = rpc.MethodNodeList

	MethodAgentListDetectionStatuses = rpc.MethodAgentListDetectionStatuses
	MethodAgentListModels            = rpc.MethodAgentListModels
	MethodPiStart                    = rpc.MethodPiStart
	MethodPiAttach                   = rpc.MethodPiAttach
	MethodPiStop                     = rpc.MethodPiStop
	MethodPiSend                     = rpc.MethodPiSend
	MethodPiListSessions             = rpc.MethodPiListSessions
	MethodPiListActiveSessions       = rpc.MethodPiListActiveSessions
	MethodPiGetSessionFile           = rpc.MethodPiGetSessionFile
	MethodPiRename                   = rpc.MethodPiRename
	MethodPiListProviders            = rpc.MethodPiListProviders
	MethodPiSaveProvider             = rpc.MethodPiSaveProvider
	MethodPiRemoveProvider           = rpc.MethodPiRemoveProvider
	MethodIntegrationGitHubStatus    = rpc.MethodIntegrationGitHubStatus
	MethodCLIToolListStatuses        = rpc.MethodCLIToolListStatuses
	MethodCLIToolInstall             = rpc.MethodCLIToolInstall
	MethodCLIToolUninstall           = rpc.MethodCLIToolUninstall

	MethodSkillList      = rpc.MethodSkillList
	MethodSkillInfo      = rpc.MethodSkillInfo
	MethodSkillDetail    = rpc.MethodSkillDetail
	MethodSkillAdd       = rpc.MethodSkillAdd
	MethodSkillRemove    = rpc.MethodSkillRemove
	MethodSkillUpdate    = rpc.MethodSkillUpdate
	MethodSkillUpdateAll = rpc.MethodSkillUpdateAll

	MethodCustomizeExtensionsList    = rpc.MethodCustomizeExtensionsList
	MethodCustomizeExtensionsInstall = rpc.MethodCustomizeExtensionsInstall
	MethodCustomizeExtensionsRemove  = rpc.MethodCustomizeExtensionsRemove
	MethodCustomizeExtensionsUpdate  = rpc.MethodCustomizeExtensionsUpdate

	MethodCustomizeAgentsList    = rpc.MethodCustomizeAgentsList
	MethodCustomizeAgentsDetail  = rpc.MethodCustomizeAgentsDetail
	MethodCustomizeAgentsCreate  = rpc.MethodCustomizeAgentsCreate
	MethodCustomizeAgentsUpdate  = rpc.MethodCustomizeAgentsUpdate
	MethodCustomizeAgentsRemove  = rpc.MethodCustomizeAgentsRemove
	MethodCustomizeAgentsRestore = rpc.MethodCustomizeAgentsRestore

	MethodFrontendEventsStream = rpc.MethodFrontendEventsStream
	MethodAppPersistAuthTokens = rpc.MethodAppPersistAuthTokens
	MethodAppGetAccessToken    = rpc.MethodAppGetAccessToken
	MethodAppCheckAuthStatus   = rpc.MethodAppCheckAuthStatus
	MethodAppLogout            = rpc.MethodAppLogout
	MethodAppReloadAuthConfig  = rpc.MethodAppReloadAuthConfig
	MethodTokenUsageDebugState = rpc.MethodTokenUsageDebugState

	MethodFileRead   = rpc.MethodFileRead
	MethodFileList   = rpc.MethodFileList
	MethodFileSearch = rpc.MethodFileSearch
	MethodFileStat   = rpc.MethodFileStat
	MethodFileWrite  = rpc.MethodFileWrite
	MethodFileDelete = rpc.MethodFileDelete
	MethodFileMove   = rpc.MethodFileMove
	MethodFileMkdir  = rpc.MethodFileMkdir
	MethodFileDiff   = rpc.MethodFileDiff

	MethodGitStatus            = rpc.MethodGitStatus
	MethodGitInspect           = rpc.MethodGitInspect
	MethodGitInspectPath       = rpc.MethodGitInspectPath
	MethodGitListChanges       = rpc.MethodGitListChanges
	MethodGitTrack             = rpc.MethodGitTrack
	MethodGitUnstage           = rpc.MethodGitUnstage
	MethodGitRevert            = rpc.MethodGitRevert
	MethodGitCommit            = rpc.MethodGitCommit
	MethodGitBranchStatus      = rpc.MethodGitBranchStatus
	MethodGitBranchPullRequest = rpc.MethodGitBranchPullRequest
	MethodGitCommitsToTarget   = rpc.MethodGitCommitsToTarget
	MethodGitBranchDiffSummary = rpc.MethodGitBranchDiffSummary
	MethodGitCommitDiff        = rpc.MethodGitCommitDiff
	MethodGitBranchDiff        = rpc.MethodGitBranchDiff
	MethodGitBranches          = rpc.MethodGitBranches
	MethodGitPush              = rpc.MethodGitPush
	MethodGitPublish           = rpc.MethodGitPublish
	MethodGitRenameBranch      = rpc.MethodGitRenameBranch
	MethodGitRemoveBranch      = rpc.MethodGitRemoveBranch
	MethodGitPrMerge           = rpc.MethodGitPrMerge
	MethodGitPrClose           = rpc.MethodGitPrClose

	MethodGitWorktreeCreate = rpc.MethodGitWorktreeCreate
	MethodGitWorktreeRemove = rpc.MethodGitWorktreeRemove
	MethodGitAuthorName     = rpc.MethodGitAuthorName

	MethodTerminalStart             = rpc.MethodTerminalStart
	MethodTerminalSend              = rpc.MethodTerminalSend
	MethodTerminalRead              = rpc.MethodTerminalRead
	MethodTerminalStop              = rpc.MethodTerminalStop
	MethodTerminalKillProcess       = rpc.MethodTerminalKillProcess
	MethodTerminalListSessions      = rpc.MethodTerminalListSessions
	MethodTerminalListPorts         = rpc.MethodTerminalListPorts
	MethodTerminalResize            = rpc.MethodTerminalResize
	MethodTerminalSubscribe         = rpc.MethodTerminalSubscribe
	MethodTerminalUnsubscribe       = rpc.MethodTerminalUnsubscribe
	MethodTerminalRemoteSubscribe   = rpc.MethodTerminalRemoteSubscribe
	MethodTerminalRemoteUnsubscribe = rpc.MethodTerminalRemoteUnsubscribe

	MethodMemorySearch       = rpc.MethodMemorySearch
	MethodMemoryReconcile    = rpc.MethodMemoryReconcile
	MethodMemoryStatus       = rpc.MethodMemoryStatus
	MethodMemoryUpdateConfig = rpc.MethodMemoryUpdateConfig
	MethodMemoryGetConfig    = rpc.MethodMemoryGetConfig
)
