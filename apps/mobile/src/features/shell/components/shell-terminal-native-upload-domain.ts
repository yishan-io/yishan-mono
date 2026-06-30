import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { extractClipboardImageBase64Data } from "./shell-terminal-clipboard-image-domain";

export type TerminalUploadImageSource = "camera" | "file" | "photo-library";

export type PickedTerminalUploadImage = {
  base64Data: string;
  fileName: string;
  mimeType: string;
};

const DEFAULT_UPLOAD_FILE_NAME = "image.png";
const DEFAULT_UPLOAD_MIME_TYPE = "image/png";
const CLIPBOARD_UPLOAD_FILE_NAME = "clipboard-image.png";

/**
 * Opens one native picker flow for terminal image upload and returns the selected image payload.
 */
export async function pickTerminalUploadImage(
  source: TerminalUploadImageSource,
): Promise<PickedTerminalUploadImage | null> {
  if (source === "photo-library") {
    return pickTerminalUploadImageFromLibrary();
  }

  if (source === "camera") {
    return pickTerminalUploadImageFromCamera();
  }

  return pickTerminalUploadImageFromFiles();
}

/**
 * Reads one image from the native clipboard and normalizes it into one upload payload.
 */
export async function readTerminalClipboardImage(): Promise<PickedTerminalUploadImage | null> {
  const hasImage = await Clipboard.hasImageAsync();
  if (!hasImage) {
    return null;
  }

  const clipboardImage = await Clipboard.getImageAsync({ format: "png" });
  const base64Data = extractClipboardImageBase64Data(clipboardImage?.data ?? "");
  if (!base64Data) {
    return null;
  }

  return {
    base64Data,
    fileName: CLIPBOARD_UPLOAD_FILE_NAME,
    mimeType: DEFAULT_UPLOAD_MIME_TYPE,
  };
}

async function pickTerminalUploadImageFromLibrary(): Promise<PickedTerminalUploadImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    base64: true,
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  return normalizePickedImage({
    base64Data: asset.base64,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    uri: asset.uri,
  });
}

async function pickTerminalUploadImageFromCamera(): Promise<PickedTerminalUploadImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    base64: true,
    cameraType: ImagePicker.CameraType.back,
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  return normalizePickedImage({
    base64Data: asset.base64,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    uri: asset.uri,
  });
}

async function pickTerminalUploadImageFromFiles(): Promise<PickedTerminalUploadImage | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: "image/*",
  });
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  return normalizePickedImage({
    fileName: asset.name,
    mimeType: asset.mimeType,
    uri: asset.uri,
  });
}

async function normalizePickedImage({
  base64Data,
  fileName,
  mimeType,
  uri,
}: {
  base64Data?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}): Promise<PickedTerminalUploadImage | null> {
  const resolvedBase64Data = base64Data || (await new File(uri).base64());
  if (!resolvedBase64Data) {
    return null;
  }

  return {
    base64Data: resolvedBase64Data,
    fileName: fileName?.trim() || DEFAULT_UPLOAD_FILE_NAME,
    mimeType: mimeType?.trim() || DEFAULT_UPLOAD_MIME_TYPE,
  };
}
