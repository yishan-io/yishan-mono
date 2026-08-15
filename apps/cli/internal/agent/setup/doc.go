// Package setup owns agent installation, extension setup, and skill
// discovery for the Yishan-managed pi environment. It is the single owner of
// these policies: no other package discovers skills or extensions, and no
// RPC or daemon code lives here (param decoding stays in the node RPC
// services; the archtest forbids agent → rpc/daemon/node imports).
//
// Three concepts partition the package (Phase 15):
//
//   - Catalog — describes what is available: ListPiExtensions,
//     ListPiAgents, ListSkills/GetSkillInfo/GetSkillDetail, and the skill
//     discovery entry EnumeratePiSkills (provider files + installed state).
//     Provider declarations (defaultPiExtensionNames, piExtensionInstallSource)
//     live in provider.go, separate from installation execution.
//
//   - Installation — executes an explicit plan: InstallPiExtension /
//     RemovePiExtension / UpdatePiExtension, CreatePiAgent / UpdatePiAgent /
//     RemovePiAgent / RestorePiAgent, AddSkill / RemoveSkill / UpdateSkill,
//     and the managed-runtime sync (EnsureDefaultPiExtensions,
//     EnsureManagedAgentRuntime). Each mutation takes an explicit target
//     (source spec or name); no mutation re-discovers the catalog.
//
//   - Reconciliation — compares desired state with installed state:
//     GetInstalledState (state.go) checks the default extension set and the
//     managed agent files against what pi actually loads, plus the hook,
//     shell, MCP, and asset states.
//
// Single-owner discovery rules: extension discovery has exactly one entry
// (ListPiExtensions); skill discovery has exactly one entry
// (EnumeratePiSkills); agent discovery has exactly one entry (ListPiAgents).
// The reconcile state reuses those declarations instead of owning a second
// discovery rule.
package setup
