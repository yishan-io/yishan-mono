import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopRpcEventBridge, DesktopRpcEventEnvelope } from "../../main/ipc";
import {
  type PiAuthPromptRequestEvent,
  type PiAuthPromptResponseInput,
  parsePiAuthPromptClosedEventPayload,
  parsePiAuthPromptRequestEventPayload,
} from "../../shared/contracts/piRuntime";
import {
  type PiAuthPromptCommandResult,
  respondPiAuthPrompt as respondPiAuthPromptCommand,
} from "../commands/piRuntimeCommands";
import { useDialogRegistration } from "../hooks/useDialogRegistration";
import { getDesktopBridge } from "../rpc/rpcTransport";

/** Desktop event and command boundary used by the provider authentication dialog. */
export type ProviderAuthDialogBridge = {
  events: DesktopRpcEventBridge;
  respondPiAuthPrompt: (input: PiAuthPromptResponseInput) => Promise<PiAuthPromptCommandResult>;
};

type ProviderAuthDialogProps = {
  bridge?: ProviderAuthDialogBridge;
};

/** Renders Pi-owned authentication prompts with the active desktop MUI theme. */
export function ProviderAuthDialog({ bridge: providedBridge }: ProviderAuthDialogProps) {
  const { t } = useTranslation();
  const desktopBridge = providedBridge ? undefined : getDesktopBridge();
  const events = providedBridge?.events ?? desktopBridge?.events;
  const respondPiAuthPrompt = providedBridge?.respondPiAuthPrompt ?? respondPiAuthPromptCommand;
  const [request, setRequest] = useState<PiAuthPromptRequestEvent>();
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const [value, setValue] = useState("");
  const [respondingRequestId, setRespondingRequestId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const isResponding = respondingRequestId === request?.requestId;
  useDialogRegistration(Boolean(request));

  useEffect(() => {
    return events?.subscribe((event) => {
      const closedRequestId = parsePromptClosedEvent(event);
      if (closedRequestId) {
        if (activeRequestIdRef.current === closedRequestId) {
          activeRequestIdRef.current = undefined;
        }
        setRequest((currentRequest) => (currentRequest?.requestId === closedRequestId ? undefined : currentRequest));
        return;
      }
      const nextRequest = parsePromptRequestEvent(event);
      if (!nextRequest) {
        return;
      }
      activeRequestIdRef.current = nextRequest.requestId;
      setRequest(nextRequest);
      setErrorMessage(undefined);
      setValue(nextRequest.prompt.type === "select" ? (nextRequest.prompt.options[0]?.id ?? "") : "");
    });
  }, [events]);

  const canSubmit = useMemo(() => {
    if (!request) {
      return false;
    }
    return request.prompt.type === "select" || value.trim().length > 0;
  }, [request, value]);

  if (!events || !request) {
    return null;
  }

  const respond = async (response: PiAuthPromptResponseInput) => {
    setRespondingRequestId(response.requestId);
    setErrorMessage(undefined);
    try {
      const result = await respondPiAuthPrompt(response);
      if (activeRequestIdRef.current !== response.requestId) {
        return;
      }
      if (result.ok) {
        activeRequestIdRef.current = undefined;
        setRequest(undefined);
        setValue("");
        return;
      }
      setErrorMessage(result.errorMessage);
    } finally {
      setRespondingRequestId((currentRequestId) =>
        currentRequestId === response.requestId ? undefined : currentRequestId,
      );
    }
  };
  const cancel = () => {
    // fire-and-forget: dialog state remains responsive while the main process settles cancellation.
    void respond({ requestId: request.requestId, status: "cancelled" });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    // fire-and-forget: response errors are rendered by respond without blocking the input handler.
    void respond({ requestId: request.requestId, status: "submitted", value });
  };

  return (
    <Dialog
      open
      onClose={isResponding ? undefined : cancel}
      fullWidth
      maxWidth="xs"
      disableEscapeKeyDown={isResponding}
    >
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{request.prompt.message}</DialogTitle>
        <DialogContent>
          {errorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          ) : null}
          {request.prompt.type === "select" ? (
            <TextField
              select
              fullWidth
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              slotProps={{ select: { inputProps: { "aria-label": request.prompt.message } } }}
            >
              {request.prompt.options.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              fullWidth
              autoFocus
              type={request.prompt.type === "secret" ? "password" : "text"}
              value={value}
              placeholder={request.prompt.placeholder}
              onChange={(event) => setValue(event.target.value)}
              slotProps={{ htmlInput: { "aria-label": request.prompt.message } }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancel} disabled={isResponding}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={!canSubmit || isResponding}>
            {t("settings.agentProviders.prompt.submit")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function parsePromptRequestEvent(event: DesktopRpcEventEnvelope): PiAuthPromptRequestEvent | undefined {
  if (event.method !== "piRuntime.authPrompt") {
    return undefined;
  }
  return parsePiAuthPromptRequestEventPayload(event.payload);
}

function parsePromptClosedEvent(event: DesktopRpcEventEnvelope): string | undefined {
  if (event.method !== "piRuntime.authPromptClosed") {
    return undefined;
  }
  return parsePiAuthPromptClosedEventPayload(event.payload);
}
