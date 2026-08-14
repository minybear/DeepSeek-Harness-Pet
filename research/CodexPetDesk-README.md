# Codex Pet Desk

[English](README.md) | [中文](README.zh-CN.md)

A small cross-platform desktop pet shell for Codex-compatible pet packages.

Codex pet packages use this layout:

```text
pet-name/
├── pet.json
└── spritesheet.webp
```

The spritesheet follows the Codex atlas contract: `1536x1872`, 8 columns, 9 rows, `192x208` cells, with transparent unused cells.

## Features

- Transparent, always-on-top desktop window.
- Loads Codex `pet.json` manifests and PNG/WebP spritesheets.
- Auto-detects pets installed under `${CODEX_HOME:-$HOME/.codex}/pets/` when running as a Tauri app.
- Supports the standard Codex animation rows: idle, directional running, waving, jumping, failed, waiting, running, and review.
- Works without an image processing dependency because the WebView renders the spritesheet directly.
- Designed for Tauri, so the same app can be built for Windows, macOS, and Linux.

## Run

Install dependencies:

```bash
npm install
```

Start the desktop app:

```bash
npm run tauri:dev
```

Build release bundles:

```bash
npm run tauri:build
```

Build the embeddable web widget:

```bash
npm run build:widget
```

The widget build writes `dist-widget/codex-pet-widget.js` for classic script tags and
`dist-widget/codex-pet-widget.es.js` for ESM imports. Widget release archives
only contain these JavaScript bundles; pet files are hosted separately.

## Load A Pet

Use `Open pet` and select both `pet.json` and its referenced spritesheet, or use `Open folder` and choose the whole pet package folder. Dragging both files onto the window also works.

The expected manifest shape is:

```json
{
  "id": "pet-name",
  "displayName": "Pet Name",
  "description": "One short sentence.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Web Widget

Codex Pet Desk can also render a Codex pet as a website overlay. Build the widget,
copy the generated file to your site, and mount it from any page:

For the full browser API, see [docs/widget-api.md](docs/widget-api.md).

```html
<script src="/codex-pet-widget.js"></script>
<script>
  const pet = CodexPet.mount({
    pet: "/pets/hachiroku/pet.json",
    position: "bottom-right",
    scale: 0.85
  });

  pet.say("任务已经完成。", { title: "Codex", state: "waving" });
  pet.setState("running");
</script>
```

The widget also registers a Web Component:

```html
<codex-pet src="/pets/hachiroku/pet.json" position="bottom-right" scale="1"></codex-pet>
<script type="module" src="/codex-pet-widget.es.js"></script>
```

Supported overlay behavior includes Codex pet manifest loading, sprite animation
states, hover jumping, drag movement, Ctrl+wheel scaling, touch pinch scaling,
mobile auto-scaling, and speech bubbles. Set `autoScale: false` in
`CodexPet.mount(...)` or `auto-scale="false"` on `<codex-pet>` to keep the
rendered size fixed across viewport widths.

### Cloudflare R2 Hosting

Upload the generated widget bundle and pet files to R2. The widget release
archive contains only the JavaScript files, so copy pet assets from your pet
source directory separately:

```text
codex-pet/
├── codex-pet-widget.js
└── pets/
    └── hachiroku/
        ├── pet.json
        └── spritesheet.webp
```

Use the classic bundle from `dist-widget/codex-pet-widget.js` with a normal
script tag:

```html
<script src="https://pet.api.fangbm.com/codex-pet/codex-pet-widget.js"></script>
<script>
  CodexPet.mount({
    pet: "https://pet.api.fangbm.com/codex-pet/pets/hachiroku/pet.json"
  });
</script>
```

If you upload the ESM bundle or source file instead, load it as a module:

```html
<script type="module">
  import { mount } from "https://pet.api.fangbm.com/codex-pet/codex-pet-widget.js";

  mount({
    pet: "https://pet.api.fangbm.com/codex-pet/pets/hachiroku/pet.json"
  });
</script>
```

When the page is not hosted on the same `pet.api.fangbm.com` origin, configure
R2 CORS for the bucket:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

### Automatic R2 Upload

The `Full Build` workflow can upload the latest widget files to R2 after
`npm run build:widget`. Add these GitHub repository secrets:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The workflow defaults to bucket `codex-pet-desk` and prefix `codex-pet`.
Optionally add repository variables named `R2_BUCKET` or `R2_PREFIX` to
override them. With the defaults, it uploads:

```text
codex-pet/codex-pet-widget.js
codex-pet/codex-pet-widget.es.js
codex-pet/pets/<pet-name>/...
```

The upload overwrites matching files but does not delete extra files already in
R2. If any required R2 secret is missing, the release build continues and prints
a notice instead of failing.

## License

Code is licensed under the MIT License. Bundled pet artwork and sprites are
covered separately by [ASSET_LICENSE.md](ASSET_LICENSE.md).
