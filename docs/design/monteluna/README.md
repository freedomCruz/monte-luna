# Monteluna Storefront Design

Export of the approved storefront visual direction, taken from the Claude Design canvas on 2026-10-09.

- Canvas: a private Claude Design canvas, page "Monteluna: dirección fresca". Not linked because it is private to the merchant's account.
- Exported canvas version: `1791578671-1837`.

## Contents

| Path | What it is |
| --- | --- |
| [design-system.md](design-system.md) | Tokens, typography, components, screens, and rules. Start here |
| `canvas/` | Canvas sources: `canvas.json` (index) and one `.dc.html` file per artboard |
| `assets/` | Images referenced by the artboards |

## About the canvas sources

- The `.dc.html` files are Claude Design artboards. They load `./support.js` and `/_blob/<id>` image URLs that exist only inside the canvas, so they do not render when opened directly in a browser. Read them as markup and inline styles, or republish them to the canvas.
- Files are byte-identical to the published version. Do not reformat them.
- `canvas.json` indexes the whole canvas, including two earlier pages ("Exploración" and "Editorial") whose artboards are not exported here.
- Each screen has a desktop file (1440 px) and a mobile file (`-390`).

## Image map

| Canvas URL | File | Source |
| --- | --- | --- |
| `/_blob/4599aac869a16a1f06d18202d2ecbc9b` | `assets/packaging-finca-el-mirador.webp` | Merchant packaging |
| `/_blob/0a97d52196c5379b4469272dee57b4de` | `assets/packaging-finca-la-maria.webp` | Merchant packaging |
| `/_blob/cee819ee8bff77267eb56c58e73e513f` | `assets/packaging-chocolate-65.webp` | Merchant packaging |
| `/_blob/174ceb42cc4886c4e3be39d2b3fdb412` | `assets/packaging-chocolate-75-100.webp` | Merchant packaging |
| `/_blob/0c384b7395214bd75e3bd3a4edd1f262` | `assets/photo-coffee-cherries.jpg` | Unsplash, placeholder |
| `/_blob/11ffca2b5aa6b76b9ad2bcdf2980d97d` | `assets/photo-roasted-beans-concrete.jpg` | Unsplash, placeholder |
| `/_blob/c22017dc735afb6bfcd5c7fe4c0463d3` | `assets/photo-roasted-beans-pile.jpg` | Unsplash, placeholder |
| `/_blob/39fdcb7b35dd76acf7e5664bb1e013ca` | `assets/photo-cacao-pods-trunk.jpg` | Unsplash, placeholder |
| `/_blob/cbca4d69a07d844717b1b8582c87d058` | `assets/photo-cacao-pods-colourful.jpg` | Unsplash, placeholder |

The Unsplash photo pages and authors were not recorded at download time. Treat these five photos as placeholders and replace them with the merchant's own photography before production.

## Keeping this export current

The canvas keeps changing while screens are designed. This folder is a snapshot: after new canvas work, export again and update the version above.
