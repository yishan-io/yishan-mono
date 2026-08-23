/** Resolves a CSS color through the browser so test assertions match computed styles. */
export function resolveCssColor(color: string): string {
  const colorSwatch = document.createElement("div");
  colorSwatch.style.color = color;
  document.body.append(colorSwatch);
  const resolvedColor = getComputedStyle(colorSwatch).color;
  colorSwatch.remove();
  return resolvedColor;
}
