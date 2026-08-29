package agent

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/agent/dsh/plugins"
	setup "yishan/apps/cli/internal/agent/setup"
	"yishan/apps/cli/internal/rpc"
)

// NewDSHPluginManager returns the account-scoped manager backed by setup's allowlisted installer.
// NewDSHLocalPluginStore returns the separate unsigned developer-only local store.
func NewDSHLocalPluginStore(dshDataDir string, isDeveloperMode bool) (DSHLocalPluginStore, error) {
	return plugins.NewLocalStore(dshDataDir, isDeveloperMode)
}

func NewDSHPluginManager(dshDataDir string) DSHPluginManager {
	return dshPluginManager{dataDir: dshDataDir}
}

type dshPluginManager struct{ dataDir string }

func (m dshPluginManager) List(ctx context.Context) (plugins.Inventory, error) {
	return setup.ListDSHPluginBundles(ctx, m.dataDir)
}
func (m dshPluginManager) ListOfficial() []plugins.ApprovedBundle {
	return setup.ListOfficialDSHPluginBundles()
}
func (m dshPluginManager) Install(ctx context.Context, name string) (plugins.Inventory, error) {
	return setup.InstallDSHPluginBundle(ctx, m.dataDir, name)
}
func (m dshPluginManager) SetEnabled(ctx context.Context, name string, enabled bool) (plugins.Inventory, error) {
	return setup.SetDSHPluginBundleEnabled(ctx, m.dataDir, name, enabled)
}
func (m dshPluginManager) Remove(ctx context.Context, name string) (plugins.Inventory, error) {
	return setup.RemoveDSHPluginBundle(ctx, m.dataDir, name)
}
func (m dshPluginManager) Update(ctx context.Context, name string) (plugins.Inventory, error) {
	return setup.UpdateDSHPluginBundle(ctx, m.dataDir, name)
}
func (m dshPluginManager) CaptureSnapshot(ctx context.Context) (plugins.Snapshot, error) {
	return setup.CaptureDSHPluginSnapshot(ctx, m.dataDir)
}
func (m dshPluginManager) RestoreSnapshot(ctx context.Context, snapshot plugins.Snapshot) error {
	return setup.RestoreDSHPluginSnapshot(ctx, m.dataDir, snapshot)
}

// DSHListPlugins returns only metadata from the signature-verified lock.
func (s *Service) DSHListPlugins(ctx context.Context) (any, error) {
	if s.deps.DSHPlugins == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh plugin manager unavailable")
	}
	inventory, err := s.deps.DSHPlugins.List(ctx)
	if err != nil {
		return nil, dshPluginError("list dsh plugins", err)
	}
	return mapDSHPluginInventory(inventory), nil
}

// DSHListOfficialPlugins lists daemon-owned official bundle install candidates.
func (s *Service) DSHListOfficialPlugins(context.Context) (any, error) {
	if s.deps.DSHPlugins == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh plugin manager unavailable")
	}
	return mapDSHPluginCatalog(s.deps.DSHPlugins.ListOfficial()), nil
}

// DSHInstallPlugin installs one daemon-selected official bundle then reloads DSH.
func (s *Service) DSHInstallPlugin(ctx context.Context, req rpc.DSHPluginNameParams) (any, error) {
	return s.mutateDSHPlugin(ctx, req.Name, func(manager DSHPluginManager) (plugins.Inventory, error) {
		return manager.Install(ctx, req.Name)
	})
}

// DSHSetPluginEnabled updates a signed bundle flag then reloads the managed runtime.
func (s *Service) DSHSetPluginEnabled(ctx context.Context, req rpc.DSHSetPluginEnabledParams) (any, error) {
	return s.mutateDSHPlugin(ctx, req.Name, func(manager DSHPluginManager) (plugins.Inventory, error) {
		return manager.SetEnabled(ctx, req.Name, req.Enabled)
	})
}

// DSHRemovePlugin removes one signed bundle then reloads the managed runtime.
func (s *Service) DSHRemovePlugin(ctx context.Context, req rpc.DSHPluginNameParams) (any, error) {
	return s.mutateDSHPlugin(ctx, req.Name, func(manager DSHPluginManager) (plugins.Inventory, error) {
		return manager.Remove(ctx, req.Name)
	})
}

// DSHUpdatePlugin reinstalls one installed bundle from the daemon allowlist then reloads DSH.
func (s *Service) DSHUpdatePlugin(ctx context.Context, req rpc.DSHPluginNameParams) (any, error) {
	return s.mutateDSHPlugin(ctx, req.Name, func(manager DSHPluginManager) (plugins.Inventory, error) {
		return manager.Update(ctx, req.Name)
	})
}

func (s *Service) mutateDSHPlugin(ctx context.Context, name string, mutation func(DSHPluginManager) (plugins.Inventory, error)) (any, error) {
	if len(name) > 214 || strings.TrimSpace(name) != name || name == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "invalid dsh plugin name")
	}
	if s.deps.DSHPlugins == nil || s.deps.DSHPluginRuntime == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh plugin management unavailable")
	}
	if err := s.acquireDSHPluginMutation(ctx); err != nil {
		return nil, dshPluginError("queue dsh plugin mutation", err)
	}
	defer s.releaseDSHPluginMutation()
	previous, err := s.deps.DSHPlugins.CaptureSnapshot(ctx)
	if err != nil {
		return nil, dshPluginError("capture dsh plugin snapshot", err)
	}
	inventory, err := mutation(s.deps.DSHPlugins)
	if err != nil {
		return nil, dshPluginError("mutate dsh plugin", err)
	}
	if err := s.deps.DSHPluginRuntime.Restart(ctx); err != nil {
		return nil, s.restoreDSHPluginSnapshot(ctx, err, func() error {
			return s.deps.DSHPlugins.RestoreSnapshot(context.WithoutCancel(ctx), previous)
		}, "dsh plugin snapshot")
	}
	return mapDSHPluginInventory(inventory), nil
}

func (s *Service) restoreDSHPluginSnapshot(ctx context.Context, restartErr error, restore func() error, snapshotName string) error {
	if rollbackErr := restore(); rollbackErr != nil {
		return rpc.NewRPCError(rpc.CodeServerError, "restart dsh runtime: "+restartErr.Error()+"; restore "+snapshotName+": "+rollbackErr.Error())
	}
	if recoveryErr := s.deps.DSHPluginRuntime.Recover(context.WithoutCancel(ctx)); recoveryErr != nil {
		return rpc.NewRPCError(rpc.CodeServerError, "restart dsh runtime: "+restartErr.Error()+"; recover dsh runtime after restoring snapshot: "+recoveryErr.Error())
	}
	return rpc.NewRPCError(rpc.CodeServerError, "restart dsh runtime: "+restartErr.Error())
}

func mapDSHPluginCatalog(catalog []plugins.ApprovedBundle) rpc.DSHPluginCatalogResult {
	bundles := make([]rpc.DSHPluginCatalogBundle, 0, len(catalog))
	for _, bundle := range catalog {
		bundles = append(bundles, rpc.DSHPluginCatalogBundle{Name: bundle.Name, Version: bundle.Version})
	}
	return rpc.DSHPluginCatalogResult{Bundles: bundles}
}

func mapDSHPluginInventory(inventory plugins.Inventory) rpc.DSHPluginListResult {
	bundles := make([]rpc.DSHPluginBundle, 0, len(inventory.Plugins))
	for _, plugin := range inventory.Plugins {
		bundles = append(bundles, rpc.DSHPluginBundle{Name: plugin.Name, Version: plugin.Version, Enabled: plugin.Enabled})
	}
	return rpc.DSHPluginListResult{Bundles: bundles}
}

func dshPluginError(operation string, err error) error {
	return rpc.NewRPCError(rpc.CodeServerError, fmt.Sprintf("%s: %v", operation, err))
}

func (s *Service) acquireDSHPluginMutation(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.dshPluginMutationQueue:
		return nil
	}
}

func (s *Service) releaseDSHPluginMutation() {
	s.dshPluginMutationQueue <- struct{}{}
}

// DSHListLocalPlugins lists explicitly registered bundles only in Developer Mode.
func (s *Service) DSHListLocalPlugins(context.Context) (any, error) {
	if s.deps.DSHLocalPlugins == nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "DSH Developer Mode is required for local bundles")
	}
	bundles, err := s.deps.DSHLocalPlugins.List()
	if err != nil {
		return nil, dshPluginError("list local dsh bundles", err)
	}
	return mapDSHLocalBundles(bundles), nil
}

// DSHRegisterLocalPlugin registers one explicit local path and restarts DSH.
func (s *Service) DSHRegisterLocalPlugin(ctx context.Context, req rpc.DSHLocalPluginRegisterParams) (any, error) {
	if s.deps.DSHLocalPlugins == nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "DSH Developer Mode is required for local bundles")
	}
	return s.mutateDSHLocalPlugin(ctx, func() ([]plugins.LocalBundle, error) { return s.deps.DSHLocalPlugins.Register(req.ID, req.Path) })
}

// DSHRemoveLocalPlugin removes one explicit local registration and restarts DSH.
func (s *Service) DSHRemoveLocalPlugin(ctx context.Context, req rpc.DSHLocalPluginNameParams) (any, error) {
	if s.deps.DSHLocalPlugins == nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "DSH Developer Mode is required for local bundles")
	}
	return s.mutateDSHLocalPlugin(ctx, func() ([]plugins.LocalBundle, error) { return s.deps.DSHLocalPlugins.Remove(req.ID) })
}

func (s *Service) mutateDSHLocalPlugin(ctx context.Context, mutation func() ([]plugins.LocalBundle, error)) (any, error) {
	if s.deps.DSHPluginRuntime == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh plugin management unavailable")
	}
	if err := s.acquireDSHPluginMutation(ctx); err != nil {
		return nil, dshPluginError("queue local dsh bundle mutation", err)
	}
	defer s.releaseDSHPluginMutation()
	previous, err := s.deps.DSHLocalPlugins.CaptureSnapshot()
	if err != nil {
		return nil, dshPluginError("capture local dsh bundle snapshot", err)
	}
	bundles, err := mutation()
	if err != nil {
		return nil, dshPluginError("mutate local dsh bundle", err)
	}
	if err := s.deps.DSHPluginRuntime.Restart(ctx); err != nil {
		return nil, s.restoreDSHPluginSnapshot(ctx, err, func() error {
			return s.deps.DSHLocalPlugins.RestoreSnapshot(previous)
		}, "local dsh bundle snapshot")
	}
	return mapDSHLocalBundles(bundles), nil
}

func mapDSHLocalBundles(bundles []plugins.LocalBundle) rpc.DSHLocalPluginListResult {
	result := make([]rpc.DSHLocalPluginBundle, 0, len(bundles))
	for _, bundle := range bundles {
		result = append(result, rpc.DSHLocalPluginBundle{ID: bundle.ID, Path: bundle.Root})
	}
	return rpc.DSHLocalPluginListResult{Bundles: result}
}
