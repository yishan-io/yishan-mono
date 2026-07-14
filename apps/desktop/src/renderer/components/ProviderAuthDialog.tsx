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
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopRpcEventBridge, DesktopRpcEventEnvelope } from "../../main/ipc";
import type { PiAuthPromptRequestEvent, PiAuthPromptResponseInput } from "../../main/piRuntime/piRuntimeTypes";
import {
  type PiAuthPromptCommandResult,
  respondPiAuthPrompt as respondPiAuthPromptCommand,
} from "../commands/piRuntimeCommands";
import { useDialogRegistration } from "../hooks/useDialogRegistration";
import { getDesktopBridge } from "../rpc/rpcTransport";

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
  const [value, setValue] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  useDialogRegistration(Boolean(request));

  useEffect(() => {
    return events?.subscribe((event) => {
      const closedRequestId = parsePromptClosedEvent(event);
      if (closedRequestId) {
        setRequest((currentRequest) => (currentRequest?.requestId === closedRequestId ? undefined : currentRequest));
        return;
      }
      const nextRequest = parsePromptRequestEvent(event);
      if (!nextRequest) {
        return;
      }
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
    setIsResponding(true);
    setErrorMessage(undefined);
    try {
      const result = await respondPiAuthPrompt(response);
      if (result.ok) {
        setRequest(undefined);
        setValue("");
        return;
      }
      setErrorMessage(result.errorMessage);
    } finally {
      setIsResponding(false);
    }
  };
  const cancel = () => {
    void respond({ requestId: request.requestId, status: "cancelled" });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
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
  if (event.method !== "piRuntime.authPrompt" || typeof event.payload !== "object" || event.payload === null) {
    return undefined;
  }
  const requestId = Reflect.get(event.payload, "requestId");
  const prompt = Reflect.get(event.payload, "prompt");
  if (typeof requestId !== "string" || !isPromptRequest(prompt)) {
    return undefined;
  }
  return { requestId, prompt };
}

function parsePromptClosedEvent(event: DesktopRpcEventEnvelope): string | undefined {
  if (event.method !== "piRuntime.authPromptClosed" || typeof event.payload !== "object" || event.payload === null) {
    return undefined;
  }
  const requestId = Reflect.get(event.payload, "requestId");
  return typeof requestId === "string" ? requestId : undefined;
}

function isPromptRequest(value: unknown): value is PiAuthPromptRequestEvent["prompt"] {
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "message") !== "string") {
    return false;
  }
  const type = Reflect.get(value, "type");
  if (type === "text" || type === "secret") {
    return true;
  }
  if (type !== "select") {
    return false;
  }
  const options = Reflect.get(value, "options");
  return (
    Array.isArray(options) &&
    options.every(
      (option) =>
        typeof option === "object" &&
        option !== null &&
        typeof Reflect.get(option, "id") === "string" &&
        typeof Reflect.get(option, "label") === "string",
    )
  );
}
