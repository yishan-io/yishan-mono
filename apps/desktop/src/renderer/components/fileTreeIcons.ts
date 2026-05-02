import {
  MATERIAL_DEFAULT_FILE_ICON,
  MATERIAL_DEFAULT_FOLDER_EXPANDED_ICON,
  MATERIAL_DEFAULT_FOLDER_ICON,
  MATERIAL_FILE_EXTENSIONS,
  MATERIAL_FILE_NAMES,
  MATERIAL_FOLDER_NAMES,
  MATERIAL_FOLDER_NAMES_EXPANDED,
  MATERIAL_ICON_FILES,
} from "../generated/materialIconThemeMap";

const MATERIAL_ICON_BASE_PATH = `${import.meta.env.BASE_URL}material-icons`;

/**
 * App-specific folder icon overrides for folder names not covered by the
 * upstream Material icon theme. These take priority over the generated maps.
 */
const APP_FOLDER_OVERRIDES: Record<string, string> = {
  ".my-context": "folder-context",
};

const APP_FOLDER_OVERRIDES_EXPANDED: Record<string, string> = {
  ".my-context": "folder-context-open",
};

function resolveIconUrl(iconId: string): string | undefined {
  const iconFileName = MATERIAL_ICON_FILES[iconId];
  if (!iconFileName) {
    return undefined;
  }

  return `${MATERIAL_ICON_BASE_PATH}/${iconFileName}`;
}

function lookupIconId(map: Record<string, string>, key: string): string | undefined {
  return map[key] ?? map[key.toLowerCase()];
}

function resolveFileIconId(fileName: string): string {
  const byName = lookupIconId(MATERIAL_FILE_NAMES, fileName);
  if (byName) {
    return byName;
  }

  const parts = fileName.split(".");
  if (parts.length > 1) {
    for (let index = 1; index < parts.length; index += 1) {
      const extension = parts.slice(index).join(".");
      const byExtension = lookupIconId(MATERIAL_FILE_EXTENSIONS, extension);

      if (byExtension) {
        return byExtension;
      }
    }
  }

  return MATERIAL_DEFAULT_FILE_ICON;
}

function resolveFolderIconId(folderName: string, isExpanded: boolean): string {
  if (isExpanded) {
    const appOverride =
      lookupIconId(APP_FOLDER_OVERRIDES_EXPANDED, folderName) ?? lookupIconId(APP_FOLDER_OVERRIDES, folderName);
    if (appOverride) {
      return appOverride;
    }

    const expanded =
      lookupIconId(MATERIAL_FOLDER_NAMES_EXPANDED, folderName) ?? lookupIconId(MATERIAL_FOLDER_NAMES, folderName);

    if (expanded) {
      return expanded;
    }

    return MATERIAL_DEFAULT_FOLDER_EXPANDED_ICON;
  }

  const appOverride = lookupIconId(APP_FOLDER_OVERRIDES, folderName);
  if (appOverride) {
    return appOverride;
  }

  return lookupIconId(MATERIAL_FOLDER_NAMES, folderName) ?? MATERIAL_DEFAULT_FOLDER_ICON;
}

/** Resolves the icon URL for one file-tree or quick-open path. */
export function getFileTreeIcon(path: string, isFolder: boolean, isExpanded = false): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;

  const iconId = isFolder ? resolveFolderIconId(fileName, isExpanded) : resolveFileIconId(fileName);

  return (
    resolveIconUrl(iconId) ?? resolveIconUrl(isFolder ? MATERIAL_DEFAULT_FOLDER_ICON : MATERIAL_DEFAULT_FILE_ICON) ?? ""
  );
}
