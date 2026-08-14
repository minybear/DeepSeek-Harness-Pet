# Codex Pet Sprite Specification

This document defines the final sprite atlas contract used by `yuexinmiao-codex-pet`.

## Atlas

- File: `dist/yuexinmiao/spritesheet.webp`
- Format: WebP
- Mode: RGBA
- Atlas size: `1536 x 1872`
- Columns: `8`
- Rows: `9`
- Cell size: `192 x 208`

## Rows

| Row | State | Used columns | Frame count |
| --- | --- | --- | ---: |
| 0 | idle | 0-5 | 6 |
| 1 | running-right | 0-7 | 8 |
| 2 | running-left | 0-7 | 8 |
| 3 | waving | 0-3 | 4 |
| 4 | jumping | 0-4 | 5 |
| 5 | failed | 0-7 | 8 |
| 6 | waiting | 0-5 | 6 |
| 7 | running | 0-5 | 6 |
| 8 | review | 0-5 | 6 |

Unused cells after each row's final used frame are fully transparent.

## Manifest Contract

`dist/yuexinmiao/pet.json`:

```json
{
  "id": "yuexinmiao",
  "displayName": "月薪喵",
  "description": "瘦长轻巧的黄白小猫，蓝色短竖眼，深棕手绘贴纸线条。",
  "spritesheetPath": "spritesheet.webp"
}
```

## Transparency Requirements

- Used cells must contain exactly one pet sprite.
- Unused cells must be fully transparent.
- Transparent pixels must not retain RGB residue.
- The final atlas must preserve RGBA transparency after WebP export.

## QA Artifacts

The validation reports are stored in `qa/`:

- `qa/installed-validation.json`
- `qa/frame-review.json`
- `qa/run-summary.json`

