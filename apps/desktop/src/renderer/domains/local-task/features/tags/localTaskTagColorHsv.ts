export type HsvColor = {
  hue: number;
  saturation: number;
  value: number;
};

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const MAX_RGB_CHANNEL = 255;
const MAX_PERCENT = 100;
const HUE_SEGMENT_SIZE = 60;

/** Returns whether a value is a complete six-digit CSS hex color. */
export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_PATTERN.test(color);
}

/** Converts a six-digit CSS hex color to rounded HSV channels. */
export function getHsvFromHex(color: string): HsvColor | null {
  if (!isValidHexColor(color)) return null;

  const red = Number.parseInt(color.slice(1, 3), 16) / MAX_RGB_CHANNEL;
  const green = Number.parseInt(color.slice(3, 5), 16) / MAX_RGB_CHANNEL;
  const blue = Number.parseInt(color.slice(5, 7), 16) / MAX_RGB_CHANNEL;
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const channelDelta = maxChannel - minChannel;
  const hue = getHue(red, green, blue, maxChannel, channelDelta);
  const saturation = maxChannel === 0 ? 0 : channelDelta / maxChannel;

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation * MAX_PERCENT),
    value: Math.round(maxChannel * MAX_PERCENT),
  };
}

/** Converts HSV channels to a normalized uppercase six-digit CSS hex color. */
export function getHexFromHsv(color: HsvColor): `#${string}` {
  const hue = normalizeHue(color.hue);
  const saturation = normalizePercent(color.saturation) / MAX_PERCENT;
  const value = normalizePercent(color.value) / MAX_PERCENT;
  const chroma = value * saturation;
  const hueSegment = hue / HUE_SEGMENT_SIZE;
  const secondaryChannel = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] = getRgbChannels(hueSegment, chroma, secondaryChannel, match);

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function getHue(red: number, green: number, blue: number, maxChannel: number, channelDelta: number): number {
  if (channelDelta === 0) return 0;
  if (maxChannel === red) return normalizeHue(HUE_SEGMENT_SIZE * (((green - blue) / channelDelta) % 6));
  if (maxChannel === green) return HUE_SEGMENT_SIZE * ((blue - red) / channelDelta + 2);
  return HUE_SEGMENT_SIZE * ((red - green) / channelDelta + 4);
}

function getRgbChannels(
  hueSegment: number,
  chroma: number,
  secondaryChannel: number,
  match: number,
): [number, number, number] {
  if (hueSegment < 1) return [chroma + match, secondaryChannel + match, match];
  if (hueSegment < 2) return [secondaryChannel + match, chroma + match, match];
  if (hueSegment < 3) return [match, chroma + match, secondaryChannel + match];
  if (hueSegment < 4) return [match, secondaryChannel + match, chroma + match];
  if (hueSegment < 5) return [secondaryChannel + match, match, chroma + match];
  return [chroma + match, match, secondaryChannel + match];
}

function normalizeHue(hue: number): number {
  return ((Math.round(hue) % 360) + 360) % 360;
}

function normalizePercent(percent: number): number {
  return Math.min(MAX_PERCENT, Math.max(0, Math.round(percent)));
}

function toHexChannel(channel: number): string {
  return Math.round(channel * MAX_RGB_CHANNEL)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}
