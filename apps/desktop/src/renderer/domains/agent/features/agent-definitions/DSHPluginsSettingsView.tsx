import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import { SettingsCard } from "../../../../ui/components/SettingsPrimitives";
import {
  changeDSHPluginEnabled,
  deleteDSHPlugin,
  installDSHPlugin,
  loadDSHPlugins,
  refreshDSHPlugin,
} from "../../commands/dshPluginCommands";
import { dshPluginStore } from "../../state/dshPluginStore";

const DSH_PLUGIN_TABLE_SX = { "& th": { fontWeight: 600 }, "& th, & td": { borderBottomColor: "divider" } };

type DSHPluginOperation = "install" | "enablement" | "update" | "remove";

/** Displays and manages only daemon-signed, account-scoped DSH bundles. */
export function DSHPluginsSettingsView() {
  const bundles = dshPluginStore((state) => state.bundles);
  const officialBundles = dshPluginStore((state) => state.officialBundles);
  const isLoading = dshPluginStore((state) => state.isLoading);
  const error = dshPluginStore((state) => state.error);
  const [operatingName, setOperatingName] = useState<string | null>(null);
  const [operation, setOperation] = useState<DSHPluginOperation | null>(null);

  useEffect(() => {
    void loadDSHPlugins();
  }, []);

  const runOperation = useCallback(
    async (name: string, nextOperation: DSHPluginOperation, action: () => Promise<void>) => {
      setOperatingName(name);
      setOperation(nextOperation);
      try {
        await action();
      } finally {
        setOperatingName(null);
        setOperation(null);
      }
    },
    [],
  );

  return (
    <Box data-testid="dsh-plugins-settings-panel" sx={{ mt: 3 }}>
      <SettingsCard>
        <Typography variant="h6">DSH bundles</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          Only bundles verified by the daemon are listed. Changes restart DSH.
        </Typography>
        {officialBundles.length === 0 ? (
          <Button size="small" disabled sx={{ mb: 2 }}>
            No official DSH Loader bundles available
          </Button>
        ) : (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
            {officialBundles.map((bundle) => {
              const isOperating = operatingName === bundle.name;
              return (
                <Button
                  key={bundle.name}
                  size="small"
                  disabled={isOperating}
                  onClick={() => void runOperation(bundle.name, "install", () => installDSHPlugin(bundle.name))}
                >
                  {operation === "install" && isOperating ? <CircularProgress size={14} /> : `Install ${bundle.name}`}
                </Button>
              );
            })}
          </Box>
        )}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <Table size="small" sx={DSH_PLUGIN_TABLE_SX}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bundles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      No signed DSH bundles installed.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
              {bundles.map((bundle) => {
                const isOperating = operatingName === bundle.name;
                const canUpdate = officialBundles.some((official) => official.name === bundle.name);
                return (
                  <TableRow key={bundle.name} data-testid={`dsh-plugin-row-${bundle.name}`}>
                    <TableCell>{bundle.name}</TableCell>
                    <TableCell>{bundle.version}</TableCell>
                    <TableCell>
                      <Switch
                        checked={bundle.enabled}
                        disabled={isOperating}
                        slotProps={{ input: { "aria-label": `Enable ${bundle.name}` } }}
                        onChange={(event) =>
                          void runOperation(bundle.name, "enablement", () =>
                            changeDSHPluginEnabled(bundle.name, event.target.checked),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      {canUpdate ? (
                        <Button
                          size="small"
                          disabled={isOperating}
                          onClick={() => void runOperation(bundle.name, "update", () => refreshDSHPlugin(bundle.name))}
                        >
                          {operation === "update" && isOperating ? <CircularProgress size={14} /> : "Update"}
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        color="error"
                        disabled={isOperating}
                        onClick={() => void runOperation(bundle.name, "remove", () => deleteDSHPlugin(bundle.name))}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SettingsCard>
    </Box>
  );
}
