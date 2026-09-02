# KUNEY FLOWERS

A virtual 3D flower shop and garden. Visitors walk through a still, sunlit
room, gather stems from the displays, choose a colour and an occasion,
and print an invoice for a seasonal florist's-choice bouquet. A door on the
left leads through a white threshold space into a walled garden they can plant
and tend, day by day.

Everything in the room is generated in code — the tumbled travertine, the
plaster, the banded onyx of the long table, every petal. The only images are
the shop's own photographs in `images/`: the surfaces are all procedural, the
typefaces are self-hosted, and three.js is vendored.

---

## Running it

The app uses ES modules, so it has to be served over `http://` — opening
`index.html` from the filesystem will not work.

```bash
npm start                 # → http://localhost:8080
```

That is a zero-dependency Node server (`serve.mjs`); `npm install` is not
needed. Any static server will do just as well:

```bash
python3 -m http.server 8080
npx serve .
```

Then:

| Page | What it is |
| --- | --- |
| `/` | The landing page, the shop and the garden |
| `/admin.html` | Owner panel — calendar stock, prices, copy, colours |
| `/?admin=1` | The shop with in-place calendar editing turned on |

Deploying is a file copy: Netlify, Vercel, GitHub Pages, Cloudflare Pages or
any web host. There is no build step and no server-side code.

```bash
npm test                  # 118 assertions + a DOM audit, no browser needed
```

---

## What a visitor does

1. Lands on a full-screen still captured from the live 3D room.
2. Presses **Enter KUNEY FLOWERS SHOP** and arrives at the entrance.
3. Walks the room with the arrow keys, or by clicking the floor — and can
   follow the guided tour of its twenty-nine stops with Next/Previous, the
   floor plan, or by clicking a display directly. Either way, at any time.
4. Clicks a flower once to move to it, again to gather a stem. The stem leaves
   the display and drops into the peach opaline vase on the long table — the
   one vase in the room that is not clear glass, so it is always obvious which
   is yours. This is play — it changes nothing about the order.
5. Opens the order panel: colour, occasion, size, delivery date.
6. Reads the wall calendar to find a day with bouquets left.
7. Confirms, and the bouquet is made: the gathered stems lift out of the water,
   draw together, take two sheets of paper and a ribbon, and are laid on the
   marble. Then the printer feeds the invoice out and the black-and-white
   docket opens, with buttons to buy online, save the image, or send it to
   WhatsApp.
8. Walks through the plaster door into the garden, sows a seed, and comes back
   tomorrow to water it.

### The stock

Twenty-one vases, eleven varieties, thirty-seven colour groups, five to ten
stems in every one of them — around 245 stems standing in the room.

| | Colours |
| --- | --- |
| Garden rose | red, orange, yellow · pink, white, purple |
| Peony | blush, white |
| Dahlia | red, pink, orange |
| Hydrangea | purple, light blue · green, pink |
| Anthurium | red, pink · green, white |
| Lisianthus | purple, pink, white |
| Delphinium | light blue, dark blue, purple |
| Gerbera | red, pink · peach, yellow |
| Tulip | red, orange · pink, purple |
| Orchid | white, pink |
| Calla lily | white, yellow |
| Iris | purple, yellow |
| Ranunculus · sweet pea · craspedia | peach · pastel · yellow |

A vase holds several colours of one variety, never several varieties, and each
colour takes a contiguous wedge of the vase rather than being shuffled through
it — that is how stock is actually bucketed, and it is what lets a visitor see
the shape of a colour instead of a speckle of everything. Each stem carries its
own colour, so gathering the yellow rose out of the warm bench puts a yellow
rose in your vase.

Where the stems are cut to depends on where they stand: short for the wall
shelves, whose boards are 0.72 m apart, long for the tall glass on the floor.
The blooms stay full size either way — it is the stems that change, as they
would on the bench.

Colours live in `stockColors` in `js/content.js`, kept deliberately apart from
`palette`. `palette` is what a customer may *ask* for and drives the order
chips and the invoice; `stockColors` is what happens to be standing in the
buckets. Merging them would put twenty chips in the order panel and promise
things the shop does not promise.

### The honest bit

The stems a visitor gathers are a keepsake of the visit and set nothing. The
shop commits to **one colour** and **one occasion**, both optional, plus a size
and a date.

That separation is enforced rather than described. `summary()` in `js/order.js`
is the only thing the invoice may read, and it carries no trace of the gathered
stems — not the varieties, not their colours, not even the count. Tests
serialise it and assert that no gathered variety or colour appears anywhere in
it, and that none reaches the printed invoice or the WhatsApp message. What does
survive is the note explaining it, which is checked too.

Gathering deliberately does *not* set the chosen colour. It used to, which was
harmless when several colours could be picked at once; with a single choice it
would silently overwrite a deliberate one, and would contradict the promise.

---

## Navigation

| | Desktop | Phone / tablet |
| --- | --- | --- |
| Look around | drag | swipe |
| Walk | arrow keys or WASD, any time; Shift to hurry | tap the floor |
| Walk to a spot | click the floor | tap the floor |
| Guided tour | Next/Previous, floor plan, `,` and `.` | large Next/Previous buttons |
| Select | click a display | tap a display |
| Gather | click again | tap again |
| Close anything | Esc | the close button |

The two ways of moving are not modes to switch between. Touching a movement
key, or clicking the floor, hands the camera over to free walking on the spot;
the stop list is still there, and Next picks the tour back up from wherever the
visitor has wandered to. **Explore Freely** in the top bar is now only a way of
saying so explicitly — and of being told the keys.

Because the arrow keys walk, stepping the tour from the keyboard is `,` and `.`
(also `[`/`]` and PageUp/PageDown). Esc returns to the current stop.

Pointer lock is never used. The camera never rolls. In guided mode a drag pans
within a limited cone and then relaxes back to the stop's framing, so it is not
possible to get lost looking at a wall.

---

## The calendar

A plaster board on the back wall, drawn to a canvas from live data, showing
bouquets remaining per day. Navigating to it zooms in and opens an accessible
HTML version with real buttons.

### Current rules

- **3 bouquets a day**
- **Open every day**, Sunday included
- **3 days' notice** — today and the next two cannot be chosen; the third day
  from now is the earliest
- A day shows **sold out only when you set it to 0 or close it**

Availability resolves in this order — the precedence is deliberate and tested:

1. A day on the **closed** list is shut, whatever number is against it.
2. Otherwise a **per-day number** wins, including on a weekly rest day, so you
   could open one Sunday without opening them all.
3. Then the **weekly rest day**, if one is set (none is, by default).
4. Then the standing **daily limit**.

A day at zero shows `SOLD OUT`, struck through, and cannot be selected.

**Visitors never change these numbers.** Real orders reach you through the shop
link or WhatsApp; you then lower the day yourself. An earlier version
decremented the count when a visitor followed the purchase link, which was
theatre — it only ever counted that one browser's clicks, so two customers would
have seen different numbers for the same day.

### Editing it

Open `/admin.html` → **Availability calendar**. Type a number into any day, or
use **Apply to month** for a whole month. **Closed** shuts a day outright;
**Default** removes the override.

You can also edit from inside the shop: open `/?admin=1`, navigate to the
calendar, and the owner controls appear under it.

---

## Publishing your changes

Admin edits are saved in **your browser only**. To make them live for
everybody:

1. `/admin.html` → **Publish & backup** → **Download content.json**
2. Replace `data/content.json` with that file
3. Re-upload the site

`data/content.json` is merged over the defaults in `js/content.js`, so it only
needs to contain what you changed. It ships as `{ "version": 4 }` — an empty
override.

Resolution order, later winning: `js/content.js` → `data/content.json` →
this browser's localStorage.

---

## Adding photographs

The landing hero and the featured cards are rendered from the live 3D room at
load, so the site looks finished with no assets at all.

To hang real photographs: **drop the files into `images/`**, then open
`/admin.html` and pick them from the dropdown — the list is read from the folder,
so there is no path to type, and a preview tells you at once whether the file was
found.

- **Wall photographs** — the three frames on the back wall of the shop
- **Displays** → *Photograph* — replaces a featured card's automatic still

A frame with no photograph shows a soft plaster card with its title on it, so the
wall is never blank. Photographs of any shape are fitted inside the frame rather
than stretched, so a landscape image keeps its proportions.

See `images/README.md` for sizes and the publishing step.

---

## Layout of the room

```
                        back wall — frames + calendar
   ┌──────────────────────────────────────────────────────┐
   │  ▓ calendar        ░ ░ ░ frames                      │
   │                                                       │
   │   ╭─────╮                    🌳 olive tree            │
   │   │steps│   ▮ column                     ▌ branches   │
   │   ╰─────╯                                             │  shelves ▐
   │                                                       │     (right
   │              ══════════════════                       │      wall)
   │           long onyx table · vase · printer            │
   │  ← garden                                             │
   │    door                        ▭ low table + stools   │
   │                     ⚱ anthurium                       │
   └──────────────────────── entrance ────────────────────┘
```

16 × 22 m, 4.4 m to the ceiling, with a 3.7 m circular oculus and two tall
window bays with linen down the right-hand wall. The bright ellipse on the
floor is a real cast shadow: a shadow-casting directional light shines through
an actual hole in the ceiling geometry.

The floor is tumbled travertine in 0.9 m slabs — no grout, edges worn pale,
and a different figure in every slab, with the texture carrying three slabs to
a repeat so the pattern lands every 2.7 m rather than on every stone. The long
table is a raw-edged banded onyx monolith with a concealed strip washing light
up under its overhang.

The garden is 24 × 26 m — gravel paths, a stone path from the gate, six raised
beds, a long basin, clipped hedging, olive trees in terracotta, a bench, and a
plaster stele whose plaque links to the real shop.

---

## The garden game

Growth is measured in *growth hours* that accumulate in real time, so a bloom
genuinely takes about three days.

- **Sow** — costs a seed; you can grow any variety the shop stocks.
- **Water** — once per day per bed; adds 7 growth hours immediately.
- **Neglect** — a bed dry for more than a day slows to a quarter speed. Nothing
  ever dies.
- **Cut** — a bloom can be kept, frees the bed, and leaves two seeds behind.
- **Streak** — returning on consecutive days advances a seven-day reward cycle,
  claimable once a day.

Stages: Seed → Sprout → Bud → Opening → In Bloom, at 0/6/20/44/72 hours. All of
those numbers are editable in the owner panel.

---

## Accessibility

- Every interactive thing in the 3D space has an HTML equivalent — no
  information is only available by clicking a mesh.
- Long text never sits inside the canvas; it lives in overlays and side panels.
- Panels are labelled dialogs, focus-managed, closed with Esc. The invoice is a
  true modal with a focus trap.
- The calendar is a `role="grid"` of real buttons with arrow-key movement and a
  spoken label per day (`"Thursday 10 September 2026 — 4 bouquets remaining"`).
- Camera moves, gathered stems and mode changes are announced through a polite
  live region.
- `prefers-reduced-motion` shortens camera moves, stops the hero drift, removes
  the floating motes and skips the print animation.
- The landing page is plain HTML — the featured arrangements, prices, delivery
  zones and every way of contacting the shop are reachable without entering the
  3D space at all. It is also where a visitor is sent if WebGL is unavailable.

---

## Files

```
index.html            landing + the 3D app
admin.html            owner panel
serve.mjs             zero-dependency static server
data/content.json     published content overrides

css/base.css          tokens, typography, buttons
css/fonts.css         @font-face for the two self-hosted typefaces
fonts/                Inter + Cormorant Garamond, latin subset, woff2
css/ui.css            landing, HUD, panels, invoice
css/admin.css         owner panel

js/content.js         DEFAULT_CONTENT — every editable value
js/store.js           persistence, content merge, availability rules
js/order.js           order state; the colour/occasion boundary
js/invoice.js         invoice as HTML, as a saveable PNG, as WhatsApp text
js/calendar.js        wall board canvas + accessible HTML panel
js/garden-game.js     growth, watering, streaks, rewards

js/textures.js        procedural travertine, plaster, marble, soil, lawn
js/geometry.js        rounded slabs, lathe forms, amphitheatre seating
js/flowers.js         petal geometry and sixteen flower recipes
js/scene-shop.js      the interior
js/scene-corridor.js  the threshold between spaces
js/scene-garden.js    the walled garden
js/camera-rig.js      guided stops + free exploration
js/app.js             renderer, routing, modes, all the wiring
js/admin.js           schema-driven owner panel

tests/run.mjs         geometry, flowers, availability, order, garden logic
tests/scene.mjs       builds all three spaces and checks the layout
tests/dom-stub.mjs    just enough canvas/DOM to run headless
```

`node_modules/` holds a small three.js shim so the tests can run in Node; the
browser loads three.js from a CDN via the import map in `index.html` and never
touches it.

---

## Notes on the build

**Why procedural?** A photographed gallery needs photographs. This shop needed
to exist before the photographs did, and to be re-tintable from an admin panel.
Every surface is a canvas texture built from value-noise fbm, with normal maps
derived from the height field — which is what makes travertine read as stone
under raking light.

**The wrapping beat.** The paper's sweep is `setDrawRange`, not geometry
rebuilt per frame: an open-ended `CylinderGeometry` emits its indices in order
around theta, so revealing them progressively *is* the paper coming around.
Where the finished bouquet comes to rest is measured at wrap time rather than
hard-coded — a bouquet laid on its side has to clear its own radius, and that
depends on the paper cone and on whatever the visitor gathered. A test lays
every gatherable flower at 1, 6, 12 and 18 stems and asserts none of them lands
on a display vase, the printer, or off the counter.

**Why merged flower heads?** A peony is around fifty petals, each a parametric
sheet. Merging every head into one buffer geometry keeps 245 stems in the room
at around 700 draw calls and a million triangles.

That number is why the two varieties made of *many tiny* florets — hydrangea,
at 312 petals a mophead, and delphinium, at 204 up a spike — build their
petals as 4 × 2 sheets instead of 9 × 5. At 14 mm across there is nothing to
see in the difference, and it took 40% of the room's triangles back. Stock
stems also have their matrices baked at build time (`matrixAutoUpdate = false`)
since a cut stem never moves; gathering one only hides it.

**Why self-hosted fonts?** They were loaded from Google Fonts until
`fonts.googleapis.com` became unreachable on a working machine and took the
whole site down with it. A `<link rel="stylesheet">` is render-blocking, so
Safari painted nothing at all: correct page title, no script error, blank white
page, every version. 144 KB of woff2 in `fonts/` removes the only third-party
dependency that could do that. The one that remains — three.js from a CDN —
fails visibly and falls back to the landing page.

**Why one Scene?** Spaces are `THREE.Group`s added and removed around a single
scene and camera rig, so the shop stays in memory while you are in the garden
and walking back is instant. The garden is built lazily on first visit, behind
the threshold fade.

**Testing without a browser.** three.js geometry, the growth model and the
availability rules are all pure JavaScript. `tests/dom-stub.mjs` supplies a
canvas real enough for the texture generators, which lets the whole room be
built and inspected in Node — including raycasting from each camera stop to
prove the doorways are genuinely cut through the walls.
