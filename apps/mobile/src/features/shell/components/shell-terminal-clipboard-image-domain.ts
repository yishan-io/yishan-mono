/**
 * Extracts raw base64 payload from one clipboard image data URL.
 */
export function extractClipboardImageBase64Data(dataUrl: string): string {
  const trimmedDataUrl = dataUrl.trim();
  if (!trimmedDataUrl) {
    return "";
  }

  const [, encodedData = ""] = trimmedDataUrl.split(",", 2);
  return encodedData || trimmedDataUrl;
}
