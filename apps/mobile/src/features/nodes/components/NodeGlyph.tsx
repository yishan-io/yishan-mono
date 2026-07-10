import { Cloud, Laptop, Server } from "@tamagui/lucide-icons";
import type { ComponentProps } from "react";

import type { NodeKind, NodeScope } from "../nodes.types";

type NodeGlyphProps = {
  color: ComponentProps<typeof Laptop>["color"];
  kind?: NodeKind;
  scope?: NodeScope;
  size?: number;
};

export function NodeGlyph({ color, kind, scope, size = 16 }: NodeGlyphProps) {
  if (kind === "managed") {
    return <Laptop color={color} size={size} />;
  }

  if (scope === "shared") {
    return <Cloud color={color} size={size} />;
  }

  return <Server color={color} size={size} />;
}
