import { useCallback, useState } from "react";

type CreateEntryRequest = {
  kind: "file" | "folder";
  basePath?: string;
  requestId: number;
};

export function useFileTreeCreateEntryRequest() {
  const [, setCreateEntryRequestId] = useState(0);
  const [createEntryRequest, setCreateEntryRequest] = useState<CreateEntryRequest | null>(null);

  const requestCreateFile = useCallback((basePath?: string) => {
    setCreateEntryRequestId((current) => {
      const requestId = current + 1;
      setCreateEntryRequest({ kind: "file", basePath, requestId });
      return requestId;
    });
  }, []);

  const requestCreateFolder = useCallback((basePath?: string) => {
    setCreateEntryRequestId((current) => {
      const requestId = current + 1;
      setCreateEntryRequest({ kind: "folder", basePath, requestId });
      return requestId;
    });
  }, []);

  return {
    createEntryRequest,
    requestCreateFile,
    requestCreateFolder,
  };
}
