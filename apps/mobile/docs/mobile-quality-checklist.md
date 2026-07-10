# Mobile Quality Checklist

Last updated: 2026-06-17

Related roadmap:

- [mobile-quality-todo.md](./mobile-quality-todo.md)

Role of this file:

- this is the progress board
- it tracks coverage and current status by functional area
- it should stay concise
- it should not become a second architecture plan

## Goal

按 `apps/mobile` 的真实功能面逐项检查：

- 功能职责边界是否清晰
- render / state / commands / api 是否混层
- 是否存在历史遗留、废弃分支、legacy 状态机、重复实现
- 是否存在可维护性、扩展性、性能上的明显隐患

## Status Legend

- `todo`：还未系统检查
- `doing`：正在检查 / 整理
- `done`：已检查并清理到可接受状态
- `follow-up`：已发现问题，需后续继续处理

## Functional Review Matrix

| Area | Scope | Quality focus | Legacy cleanup focus | Status |
| --- | --- | --- | --- | --- |
| App bootstrap and providers | `app/_layout`, `src/providers`, auth/theme/query wiring | provider 责任边界、初始化副作用、全局状态注入 | 历史 provider、重复初始化、路由层逻辑残留 | `done` |
| Public auth entry | `(public)`, `auth`, oauth callback | screen / model / auth api layering、sign-in flow orchestration | 旧 OAuth 分支、过时 env fallback 使用点 | `done` |
| Auth persistence and session restore | auth context, storage, me bootstrap | 恢复链路、token 持久化边界、错误恢复 | 本地遗留 auth state、重复 restore path | `done` |
| Shell route composition | `app/(app)/shell/*`, shell screen composition | route 是否足够薄、screen orchestration 是否越层 | 旧空态、旧 pane/preview 路由分支 | `done` |
| Shell drawer / workspace tree | org / node / project / workspace navigation | hierarchy projection、selection state、refresh / filter UX | 旧 workspace tree 结构、重复树构造逻辑 | `done` |
| Shell focus pane and tab management | pane tabs, terminal/file/diff/pr focus | pane state vs route sync、selector/modal 编排、tab 生命周期 | legacy pane tab 管理、临时复用逻辑、失效 close path | `done` |
| Shell terminal session flow | terminal creation, session sync, output surface | UI state vs runtime state、close/restore/reconnect、session ownership | 本地伪 runtime、旧 session cache、重复 terminal source | `done` |
| Shell quick actions and agent launch | new terminal, file/changes/prs, agent presets | commands 边界、preset/source-of-truth、node capability 依赖 | 旧 quick action 分支、硬编码 agent 能力 | `done` |
| Shell menus and sheets | project/workspace menus, quick actions, selector sheets | sheet model vs presentational component split、close timing | 遗留 modal/sheet 状态、重复 menu action 拼接 | `done` |
| Workspace browser / preview | files, changes, prs preview and browser state | browser state ownership、selection sync、preview fallback | 失效 preview path、旧 browser state/session path | `done` |
| Organizations | org selector, org list, org detail | org context ownership、detail page composition、query boundaries | 旧 org switch UI、历史 modal path | `done` |
| Profile control panel | profile root, org list entry, navigation hub | 子页面边界、入口聚合、控制面板信息密度 | 旧 “更多” 入口、旧 modal control panel | `done` |
| Settings | settings index, theme/language/notifications | 页面职责、setting item 组件复用、状态来源 | 重复账号卡片、冗余退出入口、历史设置项 | `done` |
| Nodes | node-related screens and filters | node query/state ownership、filter source-of-truth | 旧 node 选择逻辑、与 shell 双份状态 | `done` |
| Projects | project detail flow and creation metadata | DTO boundary、detail derive、form helpers | 旧 project metadata shape、重复 icon/form logic | `done` |
| Notifications | notification runtime, preferences, permissions | runtime side effects、permission flow、global provider coupling | 未使用 runtime、旧通知偏好实现 | `done` |
| Theme and design tokens | theme provider, shared tokens, dark/light parity | design token 使用一致性、raw color 清理 | mobile 自造 token、与 desktop 偏差 token | `done` |
| I18n and copy | copy ownership, translation usage, naming consistency | 文案来源统一、缺失 key、硬编码字符串 | 历史硬编码、重复 key / 失效 key | `done` |
| API layer and DTO mapping | `*.api.ts`, types, mapping into UI | DTO 是否泄漏进 UI、query key/response normalization | 未使用 api、重复 request helper | `done` |
| Shared UI primitives | `src/components/ui`, feature-local reusable pieces | primitive vs feature component 边界、样式复用 | 半通用组件、未使用 UI primitive | `done` |
| Storage and local persistence | shell-state, preferences, auth storage | durable state shape、partial persistence、migration risk | 历史 key、废弃 persisted fields、死缓存 | `done` |
| Performance hotspots | large lists, terminal surface, repeated render paths | render churn、memo boundary、sheet/list reuse | 旧无效 memo、重复 derive、大对象 inline | `todo` |
| Dead code and structure cleanup | cross-feature leftovers | orphan files、unused exports、wrong-folder ownership | legacy screen/hook/component/state leftovers | `follow-up` |

## Current Pass Notes

### Pass 1: Shell boundary cleanup

- shell route files (`/(app)/shell`, `/(app)/shell/files`, `/(app)/index`) 当前已经比较薄，未见明显 legacy 分支留在 route 层。
- `app/(app)/shell/index.tsx` 与 `app/(app)/shell/files.tsx` 复查后继续保持纯 route adapter：前者只 mount `ShellScreen`，后者只 mount `WorkspaceBrowserScreen`；browser route param 解析与 persisted browser state 恢复都仍留在 `useWorkspaceBrowserRouteState.ts` / `useWorkspaceBrowserScreenModel.tsx`，没有回流到 route 文件。
- `ShellScreen.tsx` 中 terminal runtime bridge 输入拼装已抽到 `useShellTerminalMessagesModel.ts`，screen 自身回到 screen-level orchestration。
- `ShellDrawer.tsx` 中 workspace tree filter / hierarchy / search / display-project state 已抽到 `useWorkspaceTreeFilterModel.ts`。
- `WorkspaceListHierarchyMode` 已从 `RepositoriesTab.tsx` 组件内移到 `shell-workspace-tree.ts`，去掉了组件反向充当领域类型源的问题。
- `useShellScreenModel.tsx` 已从恢复副作用与 quick-action imperative 行为中瘦身。
- `useShellPaneState.ts` 已回收为 pane store hydration / persistence 主体，不再直接写 router。
- `PaneTabSelectorSheet.tsx` 已拆为 model / list / dialogs。
- `RepositoriesTab.tsx` 已抽离 workspace tree projection 和 refresh notice 时序。
- `ShellFocusPane.tsx` 里的 preview surface 已提取为 `ShellPreviewSurface.tsx`，去掉一个文件内同时承载 focus pane 与 preview header surface 的情况。
- `WorkspacePullRequestsTab.tsx` 已拆回 pane / tab / card / row / section header 多文件，PR 浏览器区域不再把整套渲染细节挤在一个 400+ 行组件里。
- `useTerminalSessionRuntime.ts` 已拆出 session lifecycle commands、interaction handlers、selected-terminal lifecycle effect，主 hook 回到 orchestration 角色。
- `useWorkspaceBrowserRouteState.ts` 已把 route parsing 与 persisted tab/focus 恢复拆开；`workspace-browser-state.ts` 里错误承载的 shell route param helper 也已移除。
- `NotificationRuntimeProvider.tsx` 已缩回 provider 角色；notification stream/runtime 与 banner/native-present 已拆到 hooks。
- `useShellStoredState.ts` 已把 terminal runtime merge/upsert/update 逻辑抽到 `shell-stored-state-helpers.ts`，恢复/保存 hook 自身回到存储编排职责。
- `useTerminalTransportController.ts` 已把 output buffer / flush 逻辑抽到 `useTerminalTransportOutputBuffer.ts`，controller 主体只保留 runtime snapshot、size、transport attach。
- `shell-state-helpers.ts` 已把 route param parsing/building 迁移到 `shell-route-state.ts`，开始收紧“状态领域 helper”与“路由编解码 helper”的边界。
- `useShellState.ts` 已拆出 `useShellRouteSelectionState.ts` 与 `useShellStateMaintenance.ts`，shell 顶层状态入口回到编排层角色。
- `app/_layout.tsx` 已把 `MeLanguagePreferenceSync` 从 route 根移出，root route 现在只保留 splash/auth gating、`StatusBar` 和 `Slot` 结构。
- `src/providers/AppProviders.tsx` 现在是唯一的 provider composition root，并明确承接 `MeLanguagePreferenceSync` 这种 app-wide feature side effect；`src/providers/AppThemeProvider.tsx` 与 `src/providers/AppLanguageProvider.tsx` 这两个空 wrapper 已删除，theme/language provider owner 只剩 feature 实现入口。
- `app/auth/callback.tsx` 现在是显式 legacy redirect，canonical callback owner 只剩 `app/oauth/google/callback.tsx -> OAuthCallbackScreen`；`app/(app)/_layout.tsx` 和 `app/(public)/_layout.tsx` 也继续保持 guard/layout 角色，没有再带入 shell/auth orchestration。
- `useAuthSessionRuntime.ts` 已把 session normalize/refresh-clear 判定下沉到 `auth-session-runtime-domain.ts`，bootstrap/load/refresh 回收到 `auth-session-bootstrap.ts`；session-storage 继续只做 IO，runtime 不再自己重复决定存储格式和 refresh failure policy。
- `auth.api.ts` / `auth.types.ts` 现已明确 token record 边界：API 只返回 `AuthTokenRecord`，`auth-token-domain.ts` 统一承担 `AuthTokenRecord -> StoredSession` 映射，OAuth callback 与 session refresh 不再各自内联这一层转换。
- `useAuthSignInFlows.ts` 已拆成 `useGoogleOAuthStartCommand.ts` 与 `useGoogleOAuthCallbackFlow.ts` 两条 Google OAuth 命令路径；callback 校验规则下沉到 `auth-sign-in-domain.ts`，sign-in flow 主 hook 回到状态组合层。
- `SignInScreen.tsx` 已把 post-auth redirect 等行为提到 `useSignInScreenModel.ts`，screen 本身回到 hero/actions/version 的组合层。
- auth 这条线新增 3 组直接单测，覆盖 session runtime domain、session bootstrap、OAuth callback resolution，共 `12` 个 auth 分支；`google-oauth.ts` 中旧 `auth/callback` matcher 目前保留为显式兼容 fallback，不再是隐式重复 callback route owner。
- `AppProviders.tsx`、`AuthProvider.tsx`、`NotificationRuntimeProvider.tsx`、`AppThemeProvider.tsx`、`AppLanguageProvider.tsx`、`useShellStoredState.ts` 已补一行职责说明；当前 cold-start restore owner 已明确分散但不重叠：auth session 由 `auth-session-bootstrap.ts`，theme 由 `AppThemeProvider.tsx`，language 由 `AppLanguageProvider.tsx`，shell persisted state 由 `useShellStoredState.ts`。
- `NotificationRuntimeProvider.tsx` 复查后继续保持纯 composition：provider 只 mount runtime context 和 in-app banner，不再自己承载 permission/event/controller 逻辑。
- `shell-state-storage.ts` 已拆成 `shell-state-storage-domain.ts`、`shell-state-storage-parse.ts` 和薄 IO wrapper；temporary preview tab strip、legacy `session -> terminal` selection migration、legacy `backendSessionId` runtime 恢复与 ghost terminal dedupe 都有直接单测，shell persistence 不再把格式、迁移和读写耦在一个 482 行文件里。
- `useProfileControlsScreenModel.ts` 已删掉不必要的 organizations query、current organization derive 和未使用 subtitle；`ProfileControlsScreen.tsx` 现在只依赖 `meQuery` 和纯导航动作，控制页回到 navigation hub 角色。
- `ProfileOrganizationsScreen.tsx` / `useProfileOrganizationsScreenModel.ts` 复查后保持为标准子页面流：列表数据 owner 只在 organizations query，页面只负责 list + push detail，已不再带 selector/modal 残留语义。
- `organizations.api.ts` / `organizations.types.ts` 已新增 feature-side normalization：`OrganizationRecord` 保留后端 `members[]` 原始形状，UI/query 公开的 `Organization` 只暴露 `memberCount`，组织 UI 不再依赖原始 backend member array。
- `useOrganizationDetailModel.ts` 已把 organization lookup 与 metrics derive 下沉到 `organization-detail-domain.ts`；`OrganizationDetailScreen.tsx` 也把节点 section 抽到 `OrganizationNodesSection.tsx`，screen 回到 composition 角色。
- `useSettingsScreenModel.ts` 已把 language/notification preference mutation 拆到 `useSettingsPreferenceMutations.ts`，settings 顶层 model 不再同时承载 navigation、query、mutation lifecycle 细节。
- `SettingsNotificationsSection.tsx` 已把 option/source-of-truth 判定下沉到 `settings-notifications-domain.ts` 并补单测；section 组件现在只负责 selection UI 与 action dispatch，`SettingsSelectorSheet.tsx` 继续只拥有 modal/open-close 状态。
- `nodes.api.ts` / `useNodesQuery.ts` / `nodes.types.ts` 复查后保持单一路径：query 只负责 auth + fetch gate，Node shape 只由 `nodes.types.ts` 定义；`NodeGlyph.tsx` 和 `NodesListCard.tsx` 继续保持纯显示组件，没有吸收 selection/filter 规则。
- `useSettingsNodesScreenModel.ts` / `SettingsNodesScreen.tsx` 复查后保持自包含：settings 子页只拥有 route param -> nodes query -> list render 这条链，没有把行为散回 profile/shell 其它 screen。
- `projects.api.ts` / `projects.types.ts` / `useProjectsQuery.ts` 复查后保持单一数据入口；project feature 的类型 owner 只在 `projects.types.ts`，query/api 没再向 UI 泄漏额外 backend wrapper shape。
- `projects/forms/project-form.ts` 现有验证和 payload mapper 已补直接单测，继续保持纯 helper；`project-icons.tsx` 仍是单一 icon 映射表，没有吸收业务状态。
- `me.api.ts` / `me.types.ts` / `useMeQuery.ts` 现已明确 current-user owner：`me-domain.ts` 承担 `/me` DTO -> feature model 归一化，`useMeQuery.ts` 继续作为 shell/profile/settings/notifications 共用的单一 authenticated current-user query，settings 侧的语言偏好类型也已回收到 `me` feature owner。
- `useNotificationRuntimeModel.ts` 已把 workspace meta derive、stream 连接资格、seen-id dedupe、lifecycle state reduce、unread tone update、banner payload 构建下沉到 `notification-runtime-domain.ts`，并补了直接单测；runtime hook 现在主要保留 query/runtime wiring，banner 生命周期继续留在 `useNotificationBannerController.ts`。
- `useNotificationBannerController.ts` 已不再自起一份 permission hook；permission status owner 回收到 `useNotificationRuntimeModel.ts`，settings 页面继续单独持有 permission request / open-settings 交互 owner。
- `useNotificationEventStream.ts`、`useNotificationNativeBridge.ts`、`useNotificationRouteContext.ts` 已补一行职责说明，分别明确 websocket lifecycle、native response bridge、shell route/persisted context resolution 的唯一角色。
- `NotificationInAppBanner.tsx` 复查后仍然是纯 render 组件，且 reviewed 面上的 raw color 已切到 theme token，不再在 banner 上混入通知业务逻辑。
- `lib/api/client.ts` 继续保持 mobile transport 单一入口：所有 feature `*.api.ts` 都只通过 `apiRequest()` 发请求，没有私自重做 header/base-url/response parsing/error mapping；`ApiError` 也继续由 `lib/api/errors.ts` 统一暴露。
- `lib/query/query-client.ts` / `lib/query/query-keys.ts` 复查后保持 app-wide singletons；feature queries 都只消费这一套 query client 和 query key policy，没有 feature 自己 new `QueryClient` 或自造 query-key namespace。
- `lib/navigation/go-back-or-replace.ts` 和 `lib/navigation/read-route-param.ts` 继续被 profile/settings/organization/shell 等多个 feature 复用，当前没有再发现重复 back-fallback 或 route-param normalize 逻辑。
- `lib/theme/index.ts`、`lib/theme/tamaguiThemes.ts`、`components/ui/ui-tokens.ts` 现已写明 owner：shared design-token semantics 通过 `tamaguiThemes.ts` 映射到 mobile Tamagui slots，暂时无法落进 theme slot 的 mobile-local 常量则留在 `ui-tokens.ts`，避免 raw token 来源继续模糊。
- `features/i18n/copy.ts` 现已明确记录 ownership 决定：mobile copy 暂时集中维护，因为大量词汇通过 `desktopValue(...)` 与 desktop 文案对齐；只有当按 namespace 拆分能提升 feature ownership 时才分裂，不做机械拆文件。
- `ScreenScaffold.tsx`、`AppModalSheet.tsx`、`EmptyState.tsx`、`ErrorState.tsx`、`LoadingView.tsx`、`PaneBody.tsx`、`SectionCard.tsx`、`SheetListRow.tsx`、`StatusDot.tsx` 已补职责说明；usage 复查显示这些 primitives 目前都被多个 feature 真实复用，没有发现继续留在 `src/components/ui` 的 fake reuse。
- 这轮 mobile cleanup 继续保持 mobile-owned scope：仅在 theme/copy/icon 语义对齐时参考 desktop，不对 desktop 代码做联动重构；当前没有新增 “为了 mobile cleanup 反向改 desktop” 的依赖。
- `useShellPaneState.ts` 已进一步拆为 `useWorkspacePaneStoreRuntime.ts`、`useWorkspacePaneStoreCacheEffects.ts`、`useWorkspacePaneStoreHydration.ts`、`useWorkspacePaneStorePersistence.ts`，把 accessors、cache merge、hydration、explicit-route/persist effect 分离。
- `shell-state-helpers.ts` 已把 pane store equality 逻辑迁到 `shell-pane-store-equality.ts`，文件重新压回 500 行以内。
- `shell-state-helpers.ts` 已继续拆成 `shell-pane-layout-helpers.ts`、`shell-pane-tab-helpers.ts`、`shell-pane-store-equality.ts` 三组职责，旧文件仅保留 selection equality、empty pane state、explicit route key。
- `useShellSelectionActions.ts` 已拆成 `useShellNavigationSelectionCommands.ts`、`useShellTerminalSelectionCommands.ts` 与 `useShellWorkspaceSelectionCommands.ts`，把导航选择、terminal selection、workspace selection 从一个 command 入口中分离。
- `shell-pane-state-machine.ts` 已进一步回收成薄导出层；显式 route apply、workspace tab sanitize、terminal/preview upsert 已分别拆到 `shell-pane-route-apply.ts`、`shell-pane-store-sanitize.ts`、`shell-pane-store-upsert.ts`。
- shell pane state 现在已有 4 个直接回归测试，覆盖 explicit terminal route、explicit preview route、preview temporary reuse disabled、terminal tab sanitize。
- shell pane tab helper 里的未使用 `workspaceTabFromPaneTab` 已删除，避免保留伪公共 API。
- `useTerminalRuntimeSessionCommands.ts` 已收回为 runtime session orchestration；start/restore/close 拆到 `useTerminalStartSessionCommand.ts`、`useTerminalRestoreSessionCommand.ts`、`useTerminalCloseSessionCommand.ts`，启动 payload / optimistic session summary / runtime snapshot reset 下沉到 `terminal-runtime-session-helpers.ts`。
- `buildTerminalLaunchInput` 继续留在 `terminal-runtime-session-helpers.ts`；agent launch 发送在 attach/create flow 内直接走 live transport，避免再包一层只有单处调用的 hook。
- `useShellRecoveryCommands.ts` 已瘦身成恢复流编排入口；selection repair、home fallback、missing terminal recovery、drawer auto-dismiss 已拆到独立 hooks，纯判断下沉到 `shell-recovery-helpers.ts`。
- `useShellStateMaintenance.ts` 已把 workspace/project drop 的纯状态裁剪和 recent terminal derive 下沉到 `shell-state-maintenance-domain.ts`，state maintenance 主体只保留存储/导航编排。
- `useShellStateMaintenance.ts` 现在又把 workspace/project drop 后共用的 shell/browser 持久化清理收进 `shell-state-maintenance-persistence.ts`，纯 snapshot/state-id 规则下沉到 `shell-state-maintenance-persistence-domain.ts`；`useShellState.ts` 里遗留的 storage/browser import 也已清掉。
- `useTerminalRuntimeLifecycle.ts` 已把“选中 terminal 该 ensure/connect/start 什么”和 runtime cleanup 分类规则下沉到 `terminal-runtime-lifecycle-domain.ts` 并补单测；`useTerminalRuntimeInteractionHandlers.ts` 也已改成统一走 `getErrorMessage()`，不再内联错误消息提取。
- `useTerminalTransportController.ts` 已把 runtime snapshot owner、transport attach 资格判定、transport reuse 判定下沉到 `terminal-transport-controller-domain.ts`；controller 主体现在只保留 ref owner、transport attach wiring 和 output buffer 接线。
- `useTerminalTransportOutputBuffer.ts` 已把输出拼接、退出态 patch、pending output merge、terminal cache reconcile 下沉到 `terminal-transport-output-domain.ts` 并补单测；output buffer 主体现在只保留 refs、flush 时序和 patch 应用。
- shell 新增 3 组直接回归测试，覆盖 terminal runtime session helper、shell recovery helper、shell state maintenance domain；加上已有 pane state 回归测试，当前这轮共验证 15 个 shell 状态/命令分支。
- `useWorkspaceTerminalSessionSync.ts` 已把 daemon/relay session refresh 的纯 reconcile 逻辑下沉到 `workspace-terminal-session-sync-domain.ts`，remote sync 与 optimistic local terminal state update 不再混在 hook 主体里。
- shell 又补了 2 组直接回归测试，覆盖 workspace terminal session sync domain，以及“backend terminal sync 不得误改当前非 terminal tab 选中态”的 pane state 分支；当前 shell 状态/命令回归测试已扩到 21 个分支。
- terminal session sync 的目标行为现已明确收口为 “desktop parity except transport boundary”：mobile 继续走 `api-service -> relay -> daemon`，但 terminal tab 的 create/destroy/resolve 语义应与 desktop 保持一致，`list + reconcile` 只保留给 cold-start / reconnect / recovery。
- `ShellChatSurface.tsx` 已把 active terminal render 分支提取到 `ShellTerminalActivePane.tsx`，screen-level chat surface 现在主要保留 empty-state / header / composer 编排，emulator 和 fallback output 渲染细节不再混在一个文件里。
- `useShellTerminalSurfaceModel.ts` 已把 stream key、output append/reset 判定、terminal palette、DOM props 这些纯决策下沉到 `shell-terminal-surface-domain.ts`，并补了直接单测；surface hook 主体现在只保留 ref/token/effect 编排。
- `ShellTerminalDomEmulator.tsx` 已把 xterm options、root style、viewport css 提取到 `shell-terminal-dom-emulator-domain.ts`，组件主体继续向 mount/runtime effect 收敛；terminal surface 相关纯 helper 回归测试当前已扩到 31 个 shell 分支。
- `SessionComposer.tsx` 已把 draft 行数、文本高度、单行/多行判定下沉到 `session-composer-domain.ts`，composer 主体不再自己承载布局推导；当前 shell 相关回归测试已扩到 34 个分支。
- `ShellQuickActionsSheet.tsx` 已把 “close sheet 后再执行 action” 的包装逻辑下沉到 `shell-quick-actions-domain.ts` 并补单测，sheet 自身回到 modal composition 角色。
- `ShellMessageTimeline.tsx` 已把 message item / part 渲染子树提取到 `ShellMessageTimelineItem.tsx`，timeline 顶层只保留消息遍历编排；当前 shell 相关回归测试已扩到 37 个分支。
- `ShellTerminalDomEmulator.tsx` 已继续拆出 `useShellTerminalDomImperativeHandle.ts`、`useShellTerminalDomLifecycle.ts`、`shell-terminal-dom-emulator-runtime.ts` 与独立 handle type，组件从 251 行压到 99 行；再加上 terminal launch helper 覆盖后，当前 shell 相关回归测试已扩到 44 个分支。
- `ShellPreviewSurface.tsx` 复查后保持为纯 preview header/pane shell，workspace file/diff/PR 预览的数据 ownership 仍然留在 preview view-model / browser hooks；同时 `WorkspaceDiffPreview.tsx` 已把横向宽度布局和 diff line row 渲染拆到独立模块，避免 preview surface 自己重新膨胀。
- `WorkspaceBrowserScreen.tsx` 复查后继续保持 orchestration screen：route param parsing 和 persisted browser state 恢复留在 `useWorkspaceBrowserRouteState.ts`，浏览器行为留在 `useWorkspaceBrowserCommands.ts`，screen 自身只负责 header + content composition。
- `workspaceCreateForm.ts` 复查后继续保持纯 form/domain adapter：只负责 node option resolve 和 branch suggestion，没有吸收 networking、mutation 或 navigation。
- `workspaces.api.ts` 已把 endpoint transport wiring 与 response unwrap / websocket URL helper 下沉到 `workspaces-api-domain.ts`，并补了直接单测；workspace feature 现在不再把 response envelope 拆解和 websocket URL 规范散在 API 文件各处。
- `src/features/workspaces/queries/**` 现已通过 `workspace-query-runtime.ts` 统一 auth/context enabled gate 和缺 token 错误语义；`useWorkspaceDirectoryQueries.ts` 也复用了同一套 query runtime 规则，workspace browser 相关 queries 的 loading / enabled policy 不再各自复制。
- `useShellQuickActionCommands.ts` 与 `useShellMenuActions.ts` 已把 workspace browser request、agent quick actions、project/workspace menu action list 的纯拼装下沉到 `shell-action-builders.ts`，quick/menu hook 回到 UI wiring 角色；对应单测已补，当前 shell 相关回归测试已扩到 46 个分支。
- `useShellCreateTerminalAction.ts` 已把 `workspace -> shell.createTerminal payload` 的 transport/state 写路径收成单一 owner；`useShellMenuActions.ts` 与 `useShellQuickActionCommands.ts` 不再各自重复拼 terminal create side effect。
- `useShellQuickActionCommands.ts` 已继续拆成 `useShellAgentQuickActions.ts` 与 `useShellWorkspaceBrowserQuickActions.ts`，agent preset/create-terminal 路径和 workspace browser open 路径分开，quick-action 主 hook 回到薄组合层。
- `useShellPaneCommands.ts` 已把 select / close-active / close-by-id 的纯 store mutation 决策下沉到 `shell-pane-command-domain.ts`；`useShellPaneTabUiCommands.ts` 也把 terminal close / rename target 解析下沉到 `shell-pane-tab-ui-domain.ts`，两个 hook 现在主要只保留 orchestration 与 side effect；对应单测已补，当前 shell 相关回归测试已扩到 55 个分支。
- `useProjectCreateSheetModel.ts` 与 `useWorkspaceCreateSheetModel.ts` 已拆成 `draft hook + submit hook + pure domain` 三层：project create 现在由 `useProjectCreateSheetDraft.ts` / `useProjectCreateSheetSubmit.ts` / `project-create-sheet-domain.ts` 组成，workspace create 则拆成 `useWorkspaceCreateSheetDraft.ts` / `useWorkspaceCreateSheetSubmit.ts` / `workspace-create-sheet-domain.ts`；create-sheet model 回到组合层，新增 2 个 domain 测试文件、13 个测试覆盖 draft/submit 相关纯规则。
- `useShellWorkspaceTerminalSelectionCommands.ts` 已拆成 `useShellTerminalSelectionCommands.ts` 与 `useShellWorkspaceSelectionCommands.ts`，同时把 terminal label / terminal list 更新规则下沉到 `shell-terminal-selection-domain.ts`；selection command 层不再把 terminal registry、workspace sanitize、terminal upsert 都挤在一个 227 行 hook 里。
- `ShellScreen.tsx` 复查后继续保持 screen-level orchestration：runtime、drawer、sheet 三类能力都来自各自 hooks/model，screen 本身只负责 loading/error gate、focus-state wiring 与 content/sheet composition。
- `useShellViewModel.ts` 复查后继续保持窄边界，当前只组合 `useShellOrganizationContext` 与 `useShellSelectedContext` 两块 screen-ready data，没有重新吸收 command/runtime 写路径。
- `OrganizationSelectorSheet.tsx` 继续保持 UI-only selector；组织切换 owner 仍在 `useShellScreenModel.tsx -> shell.selectOrganization(...)`，sheet 自身不承载任何 context-switch side effect。
- `ActionMenuSheet.tsx` 继续保持纯展示层；workspace/project menu 的 option 构造与 terminal-create/open-browser 行为仍留在 `useShellMenuActions.ts`、`useShellCreateTerminalAction.ts` 与 `shell-action-builders.ts`。
- `shell-workspace-tree.ts` 现已通过单测锁定为唯一的 workspace tree projection owner，`RepositoriesTab.tsx` 只保留 fold state、refresh wiring 和渲染，不再反向充当层级计算源。
- `useWorkspaceTreeFilterModel.ts`、`WorkspaceTreeFilterSheet.tsx`、`useRepositoriesRefreshNotice.ts` 当前职责已分开：filter model 管 hierarchy/search/display-project state，sheet 只做呈现，refresh notice 只负责“刷新完成”提示时序。
- reviewed feature root entry points 现已显式建立：`auth`、`shell`、`workspaces`、`settings`、`organizations`、`profile` 都有 `index.ts` 作为公共 surface，route mounts 与跨 feature imports 已切回这些 public entry point；扫描后只剩 auth feature 内部自用的 `auth-context` 深 import，两处都不再属于 cross-feature 泄漏。
- `workspaces` feature 现在也通过 root entry point 显式公开允许跨 feature 复用的 create-form helper（`WorkspaceCreateNodeOption`、`resolveWorkspaceCreateNodeOptions`、`suggestWorkspaceCreateBranchName`），shell 不再直接 deep import `forms/workspaceCreateForm.ts`。
- `mobileDebug.ts`、`lib/config/env.ts`、`lib/config/app.ts` 已补 infrastructure ownership 注释；复查后 reviewed feature 内没有再出现新的 `__DEV__` / `process.env` 直读，环境读取仅剩 auth OAuth adapter 这类 feature-local platform bridge。
- shell persisted-state legacy cleanup 已完成：`session` selection、`backendSessionId`、`sessionsByWorkspaceId` 与缺失 `paneLayoutByWorkspaceId` 的 restore 兼容层都已删除；当前只保留 temporary preview tab 持久化剥离，作为现行 persisted-state contract 的一部分，而不是旧 schema bridge。
- `profile` / `settings` / `organizations` 复查后未再发现 modal-era 控制流残留：profile root 已固定为 page-based control panel，organizations list/detail 都是子页面 push 流，settings 只保留当前 selector sheet 作为页内 setting control，不存在旧 “更多/弹层控制面板/组织切换器” 双轨路径。
- auth persistence 的旧 `auth/callback` route/path 兼容层已删除，callback owner 现已收敛到 canonical `/oauth/google/callback`。
- shell persistence 当前不再保留旧 persisted schema defer；保留项只剩当前 contract 需要的 temporary preview-tab stripping。
- pane-store runtime/hydration/persistence 这条链现在已补 owner note，并新增 `shell-pane-store-state.test.ts` 覆盖 inactive workspace restore / durable write 行为：当前 focused workspace 的 runtime、hydration、persistence 分工明确，inactive workspace pane cache 不再只靠人工推断。
- `shell-pane-store-equality.ts`、`shell-workspace-tabs.ts`、`shell-pane-tab-helpers.ts` 已补职责说明，并新增直接单测覆盖 equality、workspace-tab -> pane-tab 映射、active-tab -> route selection 映射；这组 helper 现在可以作为纯模块阅读和回归。
- `PaneTabSelectorSheet.tsx`、`usePaneTabSelectorModel.ts`、`usePaneTabSelectorState.ts` 已补 split contract note：sheet 只做展示，model 管 list-row projection 和 close/select timing，state hook 只持有 transient dialog state，pane tab selector 这一支当前没有再向旧 modal-era 单体回流。
- shell 里两处误导性命名已收口：`useSessionMessages.ts` 现已更名为 `useShellTerminalMessages.ts`，明确它是 shell terminal runtime/message orchestration；`RepositoriesTab.tsx` 的导出也已从 `ProjectsTab` 改成 `RepositoriesTab`，避免把 repo tree surface 误解成单纯 project list。
- `apps/mobile` 当前 `bun run typecheck` 与 `bun run lint` 都已恢复全绿；剩余 verification tree 主要只剩功能分组回归流的手工/集成验证。
- `apps/mobile` 当前完整 `bun run test:unit` 也已恢复全绿，`42` 个测试文件、`150` 个测试全部通过；现在剩余的 verification tree 已缩到运行态/手工回归 pack，而不是静态或单测层问题。
- shell runtime regression pack 已在本地 web runtime 上重跑一轮，环境对齐到 `api-service :8789`、`relay :8788` 和同节点 daemon；已再次验证 cold-start restore、inactive workspace tabs 保留、terminal/file preview 切换、mobile-created terminal close、refresh 后 active sessions 回灌 tabs。
- account runtime regression pack 已在同一套本地 runtime 上重跑：显式 sign-out 能回到 public root；重置本地 session 后又能恢复回 authenticated shell；control panel -> organizations -> detail -> back 与 control panel -> settings -> back 都通过。
- notification runtime regression pack 已在同一套本地 runtime 上重跑：`events/ws` 能收到 daemon hook ingress 发出的 `notificationEvent`，non-current terminal 事件会把 workspace unread tone 更新为 `success`，web settings 里的通知权限路径继续稳定落在 “当前平台暂不支持”。
- reviewed UI 里的直接颜色写法已继续收口：`ShellDrawer.tsx` 现在走 `MOBILE_UI_TOKENS.sheet.backdrop`，`OrganizationOverviewSection.tsx` 与 `ShellMessageTimelineItem.tsx` 改回 theme token；剩余 raw colors 只保留在 `ui-tokens.ts`、`tamaguiThemes.ts` 和 terminal palette/domain 这类显式 owner 里。
- reviewed UI 的硬编码文案已继续回收：`SettingsLanguageSection.tsx` 的语言标签与 `ShellNativeTerminalKeyBar.tsx` 的 key labels 现已接回 `copy.ts`；复查后剩余非测试字符串主要是 terminal fallback title 与 `R/A/D/M/?` 这类协议/状态码，不再属于 casual UI copy。
## Suggested Review Order

1. Shell route composition
2. Shell drawer / workspace tree
3. Shell focus pane and tab management
4. Shell terminal session flow
5. Workspace browser / preview
6. Profile control panel
7. Settings
8. Organizations
9. Auth persistence and session restore
10. Notifications / theme / i18n / shared UI / dead code sweep
