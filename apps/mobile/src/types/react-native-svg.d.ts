declare module "react-native-svg" {
  import type { ComponentType } from "react";

  const Svg: ComponentType<Record<string, unknown>>;
  const Path: ComponentType<Record<string, unknown>>;

  export { Path };
  export default Svg;
}
