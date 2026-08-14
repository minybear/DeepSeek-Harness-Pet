# Hutchling Codex Pet

Hutchling is an unofficial Codex pet inspired by the Fred Hutchinson Cancer Center. It is packaged as a standard Codex custom pet directory with a `pet.json` manifest and a `spritesheet.webp` atlas.

![Hutchling contact sheet](hutchling/spritesheet.webp)

## Install

Clone this repository, then copy the `hutchling` pet directory into your Codex pets folder:

```bash
git clone https://github.com/fredhutch/hutchling.git
cd hutchling

CODEX_PETS_DIR="${CODEX_HOME:-$HOME/.codex}/pets"
mkdir -p "$CODEX_PETS_DIR"
cp -R hutchling "$CODEX_PETS_DIR/"
```

If Codex is already running, restart it or open a new Codex window so it can load the new custom pet. Hutchling should appear by its display name, `Hutchling`, from the installed manifest.

## Select And Toggle Hutchling

Open Codex Settings from the app menu, or press `Cmd`+`,` on macOS. Go to the `Appearance` tab, open `Pets`, and select `Hutchling`. If it does not appear immediately, use the custom-pets refresh control in `Appearance` > `Pets`, then select it.

To show or hide the floating pet overlay, type `/pet` in the prompt composer. You can also use `Wake Pet` or `Tuck Away Pet` from `Settings` > `Appearance`, or open the command menu with `Cmd`+`K` on macOS or `Ctrl`+`K` on Windows/Linux and run the same commands.

## Verify

After installation, these files should exist:

```text
${CODEX_HOME:-$HOME/.codex}/pets/hutchling/
  pet.json
  spritesheet.webp
```

You can inspect the manifest with:

```bash
cat "${CODEX_HOME:-$HOME/.codex}/pets/hutchling/pet.json"
```

Expected manifest:

```json
{
  "id": "hutchling",
  "displayName": "Hutchling",
  "description": "A cute Fred Hutch Cancer Research Center inspired research pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Repository Layout

```text
hutchling/
  pet.json
  spritesheet.webp
preview/
  contact-sheet.png
  previews/
    failed.gif
    idle.gif
    jumping.gif
    review.gif
    running.gif
    running-left.gif
    running-right.gif
    waiting.gif
    waving.gif
```

The `hutchling/` directory is the installable pet source. The `preview/` directory is only for GitHub documentation and is not required for installation.

## Pet Format

Hutchling uses the Codex hatch-pet atlas format:

| Property | Value |
| --- | --- |
| Atlas file | `hutchling/spritesheet.webp` |
| Atlas size | `1536x1872` |
| Cell size | `192x208` |
| Grid | 8 columns by 9 rows |

The rows are:

| Row | State | Frames |
| --- | --- | --- |
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

## Notes

This is an unofficial Codex pet package. It is not officially endorsed by Fred Hutch.
