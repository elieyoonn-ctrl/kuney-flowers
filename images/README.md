# Photographs

Drop your KUNEY FLOWERS photographs into **this folder**, then point a frame or
a display at one from the owner panel.

## Hanging a photograph on the wall

1. Save the file here, e.g. `images/wrapped-01.jpg`.
2. Open `/admin.html` → **Wall photographs**.
3. Under the frame you want, use **“choose a file from images/”** — the list is
   read from this folder, so there is no path to type.
4. A preview appears immediately and says whether the file was found.
5. Reload the shop tab. The photograph is on the wall.

Three frames hang on the back wall of the shop. A frame with no photograph shows
a soft plaster card with its title on it, so the wall never looks unfinished.

## Featured cards

The same works for **Displays** → *Photograph*. Leaving it empty is fine: the
landing page then uses an automatic still rendered from the 3D arrangement
itself, which updates if you re-tint the room.

## Sizes

| Where | Shape | Suggested | Keep under |
| --- | --- | --- | --- |
| Wall frames | portrait | 1200 × 1600 px | 400 KB |
| Featured cards | square-ish | 1000 × 1000 px | 300 KB |
| Landing hero | landscape | 2400 × 1400 px | 600 KB |

`.jpg`, `.png`, `.webp` and `.avif` all work. JPEG at around 80% quality is the
right choice for photographs.

A larger file is not wasted, but it is not used either: anything over 2048 px
on its long edge is resampled down to that in the browser before it goes on the
wall. Straight off a phone, a photograph is around 4000 px, which as a texture
is 48 MB of graphics memory before mipmaps — three of those would be most of
the budget on a phone, for detail no one can see in a 1.5 m frame. Resizing the
files yourself still saves your visitors the download.

Photographs of any shape are **fitted inside** the frame, never stretched — a
landscape photo in a portrait frame keeps its proportions and simply sits
smaller. Portrait suits these frames best.

## Publishing them

The photographs are files, so they travel with the site automatically. The
*paths* are content, so after setting them go to **Publish & backup** →
**Download content.json**, replace `data/content.json` with it, and upload both
that file and this folder.
