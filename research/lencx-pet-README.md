# AI Pet

A small collection of ready-to-use AI coding companion pet assets.

This repository stores generated pet packages, not the generation workflow. Each pet folder contains the files needed by the target app.

## Repository Layout

```text
pet/
└── codex/
    ├── pets.json
    ├── airi/
    │   ├── pet.json
    │   └── spritesheet.webp
    └── kerno/
    └── ...
```

## Codex Pets

Codex custom pets are stored under `codex/<pet-id>/`.

Available pets:

- `airi` - A cute refined anime coding companion who keeps the workspace calm.
- `kerno` - A tiny terminal-kernel sentinel for Noi architecture and runtime work.

Each pet package should contain:

- `pet.json` - Pet metadata, including the display name and spritesheet path.
- `spritesheet.webp` - The animated pet spritesheet used by Codex.

Example:

```text
codex/kerno/
├── pet.json
└── spritesheet.webp
```

## Install a Codex Pet

You do not need to clone this repository or install Node.js. Install a specific Codex pet directly from `lencx.me`:

macOS / Linux:

```bash
curl -fsSL https://lencx.me/pet/install.sh | sh -s -- kerno
```

Windows PowerShell:

```powershell
irm https://lencx.me/pet/install.ps1 | iex; CodexPet kerno
```

Install all available Codex pets:

```bash
curl -fsSL https://lencx.me/pet/install.sh | sh -s -- --all
```

```powershell
irm https://lencx.me/pet/install.ps1 | iex; CodexPet --all
```

List available pets:

```bash
curl -fsSL https://lencx.me/pet/install.sh | sh -s -- --list
```

```powershell
irm https://lencx.me/pet/install.ps1 | iex; CodexPet --list
```

The remote list is read from the generated `codex/pets.json` index. The install script does not use the GitHub API.

Replace an existing installed pet:

```bash
curl -fsSL https://lencx.me/pet/install.sh | sh -s -- kerno --force
```

Use a custom Codex home:

```bash
curl -fsSL https://lencx.me/pet/install.sh | sh -s -- kerno --codex-home "/path/to/.codex"
```

If you already cloned the repository, you can run the local shell script:

```bash
sh scripts/install-codex-pet.sh kerno --base-url "file://$PWD"
```

After copying, restart Codex or refresh the pet list if the app does not show the new pet immediately.

You can also copy a pet folder manually into `${CODEX_HOME:-~/.codex}/pets/<pet-id>/`.

## Add a New Pet

1. Create a new folder under `codex/<pet-id>/`.
2. Add `pet.json` and `spritesheet.webp`.
3. Make sure `pet.json` points to the spritesheet file:

```json
{
  "id": "pet-id",
  "displayName": "Pet Name",
  "description": "A short description of the pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

4. Commit the new folder.

`codex/pets.json` is generated from the pet folders. The GitHub Action updates it on `main`; you can also update it locally:

macOS / Linux:

```bash
sh scripts/update-codex-index.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/update-codex-index.ps1
```

## Notes

- Keep generated assets in their own pet folder.
- Do not commit temporary generation outputs or QA files unless they are intentionally part of the release.
- Use lowercase kebab-case folder names for pet IDs.
