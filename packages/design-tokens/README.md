# @yishan-io/design-tokens

Shared, framework-agnostic design tokens for Yishan clients.

## Versioned exports

- `@yishan-io/design-tokens/v1`: token primitives + semantic values
- `@yishan-io/design-tokens/v1/mui`: MUI adapter payload factory
- `@yishan-io/design-tokens/v1/react-native`: React Native adapter payload factory

For convenience, latest aliases are also available at `@yishan-io/design-tokens`, `@yishan-io/design-tokens/mui`, and `@yishan-io/design-tokens/react-native`.

## Token structure

- `COLOR_PRIMITIVES`: raw palette values that do not depend on a UI framework
- `SEMANTIC_COLOR_TOKENS`: meaning-based tokens by mode (`light`/`dark`)
- `TYPOGRAPHY_TOKENS`, `SHAPE_TOKENS`, `ELEVATION_TOKENS`: non-color tokens reused by adapters
- `EDITOR_SURFACE_COLORS`: editor-specific semantic surface aliases

## Usage

### MUI / web / desktop

```ts
import { createTheme } from "@mui/material/styles";
import { createMuiThemeOptions } from "@yishan-io/design-tokens/v1/mui";

const theme = createTheme(createMuiThemeOptions("dark"));
```

### React Native

```ts
import { createReactNativeThemeTokens } from "@yishan-io/design-tokens/v1/react-native";

const nativeTheme = createReactNativeThemeTokens("light");
```

The React Native adapter intentionally returns plain objects so app layers can plug tokens into any RN theming system (`StyleSheet`, custom context, or third-party libraries).

### CSS custom properties

```ts
import { createCssThemeVariables } from "@yishan-io/design-tokens/v1/css";

const variables = createCssThemeVariables("dark");

for (const [property, value] of Object.entries(variables)) {
  document.documentElement.style.setProperty(property, value);
}
```

`createCssThemeVariables` is pure; applications own DOM updates. The latest alias is also available at `@yishan-io/design-tokens/css`.
