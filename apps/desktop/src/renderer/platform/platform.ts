export function getRendererPlatform(): NodeJS.Platform {
  return window.desktop?.platform ?? "darwin";
}
