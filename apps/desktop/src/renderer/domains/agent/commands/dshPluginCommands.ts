import { getErrorMessage } from "@shared/errors/getErrorMessage";
import {
  installOfficialDSHPlugin,
  listDSHPlugins,
  listOfficialDSHPlugins,
  removeDSHPlugin,
  setDSHPluginEnabled,
  updateDSHPlugin,
} from "../daemon/daemonAgentProcedures";
import { parseDSHOfficialPluginBundles, parseDSHPluginBundles } from "../plugins/dshPlugin";
import { dshPluginStore } from "../state/dshPluginStore";

/** Loads the daemon-signed managed DSH bundle inventory into renderer state. */
export async function loadDSHPlugins(): Promise<void> {
  dshPluginStore.getState().setLoading(true);
  try {
    const [inventory, catalog] = await Promise.all([listDSHPlugins(), listOfficialDSHPlugins()]);
    dshPluginStore.getState().setBundles(parseDSHPluginBundles(inventory));
    dshPluginStore.getState().setOfficialBundles(parseDSHOfficialPluginBundles(catalog));
  } catch (error) {
    dshPluginStore.getState().setError(getErrorMessage(error));
  } finally {
    dshPluginStore.getState().setLoading(false);
  }
}

/** Installs one daemon-selected official DSH Loader bundle then refreshes state. */
export async function installDSHPlugin(name: string): Promise<void> {
  await runDSHPluginMutation(() => installOfficialDSHPlugin({ name }));
}

/** Sets a signed managed DSH bundle enablement flag then refreshes renderer state. */
export async function changeDSHPluginEnabled(name: string, enabled: boolean): Promise<void> {
  await runDSHPluginMutation(() => setDSHPluginEnabled({ name, enabled }));
}

/** Removes a managed DSH bundle then refreshes renderer state. */
export async function deleteDSHPlugin(name: string): Promise<void> {
  await runDSHPluginMutation(() => removeDSHPlugin({ name }));
}

/** Reinstalls a managed DSH bundle only through the daemon allowlist. */
export async function refreshDSHPlugin(name: string): Promise<void> {
  await runDSHPluginMutation(() => updateDSHPlugin({ name }));
}

async function runDSHPluginMutation(mutation: () => Promise<void>): Promise<void> {
  try {
    await mutation();
  } catch (error) {
    dshPluginStore.getState().setError(getErrorMessage(error));
    throw error;
  }
  await loadDSHPlugins();
}
