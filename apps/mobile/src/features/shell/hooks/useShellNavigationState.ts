import { useCallback, useEffect, useState } from "react";

export type ShellNavigationState = {
  foldedProjectIds: string[];
  isNavOpen: boolean;
  navigationOrganizationId: string | null;
  setFoldedProjectIds: React.Dispatch<React.SetStateAction<string[]>>;
  setNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNavigationOrganizationId: React.Dispatch<React.SetStateAction<string | null>>;
  toggleProjectFold: (projectId: string) => void;
};

export function useShellNavigationState(selectedOrganizationId: string | null): ShellNavigationState {
  const [isNavOpen, setNavOpen] = useState(false);
  const [navigationOrganizationId, setNavigationOrganizationId] = useState<string | null>(null);
  const [foldedProjectIds, setFoldedProjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (isNavOpen) {
      return;
    }

    if (selectedOrganizationId) {
      setNavigationOrganizationId((current) => (current === selectedOrganizationId ? current : selectedOrganizationId));
      return;
    }

    setNavigationOrganizationId((current) => (current === null ? current : null));
  }, [isNavOpen, selectedOrganizationId]);

  const toggleProjectFold = useCallback((projectId: string) => {
    setFoldedProjectIds((current) =>
      current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId],
    );
  }, []);

  return {
    foldedProjectIds,
    isNavOpen,
    navigationOrganizationId,
    setFoldedProjectIds,
    setNavOpen,
    setNavigationOrganizationId,
    toggleProjectFold,
  };
}
