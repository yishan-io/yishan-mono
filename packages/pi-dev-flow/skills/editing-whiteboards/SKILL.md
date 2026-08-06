---
name: editing-whiteboards
description: Use when creating or modifying Excalidraw whiteboard files (.excalidraw) — drawing diagrams, or adding, moving, restyling, or removing shapes, arrows, and text by editing the scene JSON directly.
---

# Editing Whiteboards

Use this skill when a user asks you to draw on, add to, or change a Yishan whiteboard file (`.excalidraw`). The whiteboard tab renders an Excalidraw canvas from the file's JSON. You edit the JSON directly with your normal file tools; the canvas picks the change up from disk.

## The File Format

A `.excalidraw` file is one JSON object:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "yishan",
  "elements": [],
  "appState": {},
  "files": {}
}
```

- `elements` — the drawing objects (shapes, text, arrows). Array order is z-order: later elements render on top of earlier ones.
- `appState` — scene settings. The app persists only `viewBackgroundColor`, `gridSize`, `gridStep`, and `gridModeEnabled`. Transient fields (`scrollX`, `scrollY`, `zoom`, `selectedElementIds`, `selectionElement`, `editingGroupId`, `editingTextElement`, `editingLinearElement`) are stripped on save — never set them, never rely on them.
- `files` — embedded images, keyed by the image element's `id` (see Images).
- `source` — always keep `"yishan"`.

## Element Invariants (follow these, always)

1. **Ids are unique and stable.** Never reuse an id and never change an existing element's id — other elements reference ids (`boundElements`, `containerId`, image `files` keys).
2. **Edit surgically.** Read the file, change only the fields you intend, and preserve everything else. Never regenerate the whole file from a guess — unknown fields you drop can break references.
3. **Bump `versionNonce` and `updated`** on every element you change: `versionNonce` +1, `updated` = current epoch milliseconds. Leave `version` and `seed` as they are.
4. **`isDeleted: false`** for live elements. To remove an element, either delete it from the array (safe when nothing references it) or set `isDeleted: true`.
5. **Keep bindings consistent.**
   - An arrow with a `startBinding`/`endBinding` must have its bound shape's `boundElements` include the arrow id (and vice versa).
   - Text inside a container needs `containerId` set to the container id, and the container's `boundElements` must list the text id.
   - When a binding is not needed, use `null` (arrow) / `[]` (shape) / `null` (text `containerId`).
6. **`frameId: null`** unless the element is inside an existing frame.

## Element Templates

All coordinates are relative to the canvas: `x`/`y` = top-left corner, `width`/`height` ≥ 0, `angle` in radians. These templates are valid as-is — change only what you need.

### Rectangle

```json
{
  "id": "rect-001",
  "type": "rectangle",
  "x": 100,
  "y": 100,
  "width": 200,
  "height": 120,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": { "type": 3 },
  "boundElements": [],
  "updated": 1754500000000,
  "link": null,
  "locked": false,
  "seed": 42,
  "version": 1,
  "versionNonce": 1,
  "index": null,
  "isDeleted": false
}
```

### Text

```json
{
  "id": "text-001",
  "type": "text",
  "x": 120,
  "y": 120,
  "width": 160,
  "height": 25,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "boundElements": [],
  "updated": 1754500000000,
  "link": null,
  "locked": false,
  "seed": 7,
  "version": 1,
  "versionNonce": 1,
  "index": null,
  "isDeleted": false,
  "fontSize": 20,
  "fontFamily": 1,
  "text": "Hello",
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": null,
  "originalText": "Hello",
  "autoResize": true,
  "lineHeight": 1.25
}
```

- `fontFamily`: 1 = Virgil (default handwriting), 2 = Helvetica, 3 = Cascadia.
- Keep `originalText` identical to `text` (it stores the un-transformed text).
- `width`/`height` should roughly fit the rendered text; the canvas re-measures on load.

### Arrow

```json
{
  "id": "arrow-001",
  "type": "arrow",
  "x": 300,
  "y": 160,
  "width": 200,
  "height": 0,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": { "type": 2 },
  "boundElements": [],
  "updated": 1754500000000,
  "link": null,
  "locked": false,
  "seed": 99,
  "version": 1,
  "versionNonce": 1,
  "index": null,
  "isDeleted": false,
  "points": [
    [0, 0],
    [200, 0]
  ],
  "lastCommittedPoint": null,
  "startBinding": null,
  "endBinding": null
}
```

- `points` are relative to the element's `x`/`y`: an arrow from `(x, y)` to `(x + dx, y + dy)` has points `[[0, 0], [dx, dy]]`.
- For a vertical arrow, set `points` to `[[0, 0], [0, height]]` and keep `x`/`y`/`width`/`height` consistent with the first/last point.

### Other shapes

`ellipse`, `diamond`, `triangle`, `line`, `freedraw` use the same base fields as the rectangle; `line` is a linear element like the arrow (with `startBinding`/`endBinding`/`lastCommittedPoint` and `points`). When unsure of a shape's extra fields, copy an existing element of that type from the file you are editing.

## Images

An embedded image is an element with `type: "image"` plus an entry in `files`. The image element's `fileId`, the `files` key, and the file entry's `id` must all be equal:

```json
{
  "id": "img-001",
  "type": "image",
  "x": 100,
  "y": 100,
  "width": 320,
  "height": 200,
  "angle": 0,
  "strokeColor": "transparent",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "boundElements": [],
  "updated": 1754500000000,
  "link": null,
  "locked": false,
  "seed": 11,
  "version": 1,
  "versionNonce": 1,
  "index": null,
  "isDeleted": false,
  "fileId": "img-001",
  "status": "saved",
  "scale": [1, 1],
  "crop": null
}
```

```json
{
  "files": {
    "img-001": {
      "id": "img-001",
      "mimeType": "image/png",
      "dataURL": "data:image/png;base64,....",
      "created": 1754500000000
    }
  }
}
```

Set the element's `width`/`height` to the intended display size. Never store images outside `files`; never attach the same file entry to two element ids.

## Workflow

1. **Read** the file first. Understand existing elements, ids, and bindings before changing anything.
2. **Plan** the edit: which elements to add, which to modify, which to remove.
3. **Edit** surgically (see Invariants). Add new elements with fresh unique ids; bump `versionNonce`/`updated` on changed elements.
4. **Verify**:
   - The file is valid JSON.
   - `elements` is an array; all element ids are unique.
   - No dangling references (`boundElements`, `containerId`, image `files` keys).
   - `source` is `"yishan"`; `files` is present (even if empty).
   - Re-read the file and confirm your changes landed.

## What Not To Do

- Do not rewrite the whole file when a surgical change works — you risk dropping fields other elements depend on.
- Do not set transient `appState` fields (`scrollX`, `zoom`, selections) — they are stripped on save and can confuse later diffs.
- Do not leave two elements with the same id.
- Do not add elements with negative `width`/`height`; use `angle: Math.PI` instead of negative dimensions for flipped content.
- Do not assume the canvas repairs invalid elements — it tolerates some damage, but a valid file is the goal.
