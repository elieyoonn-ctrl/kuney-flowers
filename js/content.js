/* ==========================================================================
   Default content for KUNEY FLOWERS.

   Everything a shop owner should be able to change lives here: brand copy,
   colours, flower names, prices, delivery zones, terms, calendar stock.
   The admin panel (/admin.html) edits a copy of this object and stores it in
   the browser; `Export JSON` writes it back out so it can be committed to
   data/content.json and shipped to every visitor.

   Adding a key here makes it available everywhere via store.getContent().
   ========================================================================== */

/* Bumped to 5 when the stock was cut to the pixel art a second time: the
   peony vase gained Pink, the hydrangea's blue moved from Dark Blue to Light
   Blue to match the painted mophead, and the Rose vase lost the last
   'garden-rose' in its id.
   A saved browser copy holds a whole content object, `displays` included, and
   arrays are replaced wholesale rather than merged — so a snapshot taken
   before the restock would have put the old ten displays back into the new
   slots and quietly undone the room. The version gate is how this codebase
   says "that snapshot is not about this shop any more"; the old key is left
   untouched in localStorage rather than overwritten. */
export const CONTENT_VERSION = 5;

export const DEFAULT_CONTENT = {
  version: CONTENT_VERSION,

  brand: {
    name: 'KUNEY FLOWERS',
    logoText: 'KUNEY',
    logoMark: 'FLOWERS',
    tagline: 'Seasonal florist-choice bouquets, Hong Kong',
    intro:
      'Step inside a still, sunlit space where the season’s finest stems are gathered and arranged by hand. Wander the shop, choose a colour and an occasion, then let our florist compose something singular for you.',
    seasonLabel: 'Current Season',
    seasonName: 'Late Summer Selection',
    enterLabel: 'Enter KUNEY FLOWER SHOP',
    footerNote:
      'Bouquets are composed from the finest stems available on the day of arrangement. No two are alike.',
  },

  contact: {
    whatsapp: '+852 9612 4061',
    whatsappDigits: '85296124061',
    email: 'hello@kuneyflowers.com',
    instagram: 'https://www.instagram.com/',
    threads: 'https://www.threads.com/',
    siteUrl: 'https://kuneyflowers.com/',
    productUrl:
      'https://kuneyflowers.com/products/let-us-create-something-unique-florist-choice',
  },

  /* Interior mood — surfaced in the admin so the space can be re-tinted. */
  theme: {
    floor: '#e6dece',
    wall: '#f3efe8',
    plaster: '#f6f3ed',
    concrete: '#cfc9be',
    // The long table: banded onyx, cream strata with sage beds running through.
    island: '#ded2ba',
    islandVein: '#94a291',
    tableGlow: '#ffe4bd',
    curtain: '#dbd0bd',
    terracotta: '#b5866b',
    wrapPaper: '#efe7d8',
    ribbon: '#8c9a82',
    daylight: '#fff6e8',
    daylightIntensity: 3.1,
    accent: '#8c9a82',
  },

  /* --- Flower stock colours ---------------------------------------------
     Kept apart from `palette` on purpose. `palette` is what a customer may
     *ask* for and drives the order chips and the invoice; this is what is
     standing in the buckets on any given day. Mixing the two would put
     twenty chips in the order panel and promise things we do not promise.

     Every entry here is a colour some species is actually painted in. A
     variety is only ever bucketed in the colours it has art for, so nothing
     in the room is standing in a colour the shop cannot show.
     ---------------------------------------------------------------------- */
  stockColors: [
    { id: 'stock-red', label: 'Red', hex: '#c62430' },
    { id: 'stock-pink', label: 'Pink', hex: '#e8699b' },
    { id: 'stock-light-pink', label: 'Light Pink', hex: '#f3b3c6' },
    { id: 'stock-peach', label: 'Peach', hex: '#f6a473' },
    { id: 'stock-orange', label: 'Orange', hex: '#ee7420' },
    { id: 'stock-yellow', label: 'Yellow', hex: '#f2c01e' },
    { id: 'stock-green', label: 'Green', hex: '#8dab5e' },
    { id: 'stock-light-blue', label: 'Light Blue', hex: '#8cc2e8' },
    { id: 'stock-dark-blue', label: 'Dark Blue', hex: '#2f4ea6' },
    { id: 'stock-purple', label: 'Purple', hex: '#8b5cb6' },
    { id: 'stock-white', label: 'White', hex: '#f8f5ef' },
  ],

  /* --- The two things we can actually cater for -------------------------- */

  palette: [
    { id: 'soft-pink', label: 'Soft Pink', hex: '#f7d9e0' },
    { id: 'blush-pink', label: 'Blush Pink', hex: '#eec3cb' },
    { id: 'peach', label: 'Peach', hex: '#f6c9a8' },
    { id: 'red', label: 'Red', hex: '#b83a3f' },
    { id: 'white', label: 'White', hex: '#f7f4ee' },
    { id: 'purple', label: 'Purple', hex: '#a58ac0' },
    { id: 'blue', label: 'Blue', hex: '#8fa9c9' },
    { id: 'yellow', label: 'Yellow', hex: '#f0d38a' },
    { id: 'tropical', label: 'Tropical', hex: '#e0703f' },
    { id: 'dreamy-pastel', label: 'Dreamy Pastel', hex: '#e7d8ea' },
  ],

  occasions: [
    { id: 'birthday', label: 'Birthday' },
    { id: 'anniversary', label: 'Anniversary' },
    { id: 'newborn', label: 'Newborn' },
    { id: 'graduation', label: 'Graduation' },
  ],

  sizes: [
    {
      id: 'standard',
      label: 'Standard',
      price: 1599,
      note: 'A generous hand-tied bouquet.',
    },
    {
      id: 'large',
      label: 'Large',
      price: 2399,
      note: 'Fuller, with more focal stems.',
    },
    {
      id: 'extravagant',
      label: 'Extravagant',
      price: 3299,
      note: 'Our most abundant composition.',
    },
  ],

  currency: 'HKD',

  /* --- Invoice ----------------------------------------------------------- */

  invoice: {
    heading: 'ORDER SUMMARY',
    subheading: 'Florist’s Choice — Seasonal Bouquet',
    note:
      'Our florist will select only the finest seasonal flowers and create a one-of-a-kind bouquet. Out of respect for creative space, we do not list the individual floral materials selected. We respond to delivery enquiries only.',
    gameNote:
      'The stems you gathered in the virtual shop are a keepsake of your visit only. They do not set the variety or the count of the flowers in the bouquet delivered.',
    payLabel: 'Purchase online',
    whatsappLabel: 'Send to WhatsApp',
    saveLabel: 'Save invoice image',
    bankNote:
      'Prefer bank transfer? Save or screenshot this invoice and send it to us on WhatsApp — we will reply with transfer details.',
  },

  delivery: [
    { zone: 'Kowloon & Hong Kong Island', fee: 0, label: 'Complimentary' },
    { zone: 'New Territories', fee: 150, label: 'HKD 150' },
    { zone: 'Outlying Islands', fee: null, label: 'HKD 500 – 800' },
  ],

  terms: [
    'Payment in advance.',
    'Cancellations of orders are not accepted. All orders placed are final.',
    'If you wish to change your order, 48 hours notice (prior to delivery date) is required.',
    'Payments are non-refundable.',
    'All payment shall be made in HK dollars only.',
  ],

  /* --- Displays in the 3D shop ------------------------------------------
     `kind`   vase-table | shelf | steps | floor
     `slot`   index into the layout positions defined per kind in scene-shop.js
     `photo`  optional path, e.g. 'images/peony-01.jpg' — overrides the auto still
     `bloom`  procedural flower recipe id from js/flowers.js
     `colors` the colour groups standing in this vase, as
              { id: <stockColors id>, count: <stems> }. A vase may hold several
              colours of one variety, never several varieties: that is how the
              stock is actually bucketed, and it is what lets a visitor see the
              shape of a colour rather than a speckle of everything.
     `colorId` the palette colour the display is filed under — the halo tint and
              what the admin panel edits. Where `colors` is present it is what
              actually gets built.
     ---------------------------------------------------------------------- */

  displays: [
    /* --- the long table: three deep, lush arrangements ------------------ */
    {
      id: 'rose-cool',
      title: 'Rose — Pink, White & Purple',
      varieties: ['Rosa “Keira”', 'Rosa “Patience”', 'Rosa “Blue Moon”'],
      note:
        'Cupped heads that open slowly over a week. Cut in three tones and bucketed together, because the pinks read pinker beside the white.',
      kind: 'vase-table',
      slot: 0,
      bloom: 'rose',
      colorId: 'soft-pink',
      colors: [
        { id: 'stock-pink', count: 6 },
        { id: 'stock-white', count: 6 },
        { id: 'stock-purple', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'rose-warm',
      title: 'Garden Rose — Red & Orange',
      varieties: ['Rosa “Hearts”', 'Rosa “Free Spirit”'],
      note:
        'The warm end of the rose bench, and the densest heads we cut. Many-petalled, in scarlet and terracotta.',
      kind: 'vase-table',
      slot: 1,
      bloom: 'rose',
      colorId: 'red',
      colors: [
        { id: 'stock-red', count: 9 },
        { id: 'stock-orange', count: 9 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'peony-pink',
      title: 'Peony — Pink, Light Pink & White',
      varieties: [
        'Paeonia “Jules Elie”',
        'Paeonia lactiflora “Sarah Bernhardt”',
        'Paeonia “Duchesse de Nemours”',
      ],
      note:
        'The shortest season we keep. Heavy, layered heads in deep pink, in the palest pink and in cream, cut just as the bud gives.',
      kind: 'vase-table',
      slot: 2,
      bloom: 'peony',
      colorId: 'soft-pink',
      colors: [
        { id: 'stock-pink', count: 6 },
        { id: 'stock-light-pink', count: 6 },
        { id: 'stock-white', count: 5 },
      ],
      photo: '',
      pickable: true,
    },

    /* --- the wall shelves: compact, one or two colours each -------------- */
    {
      id: 'gerbera-bright',
      title: 'Gerbera, Red & Pink',
      varieties: ['Gerbera jamesonii', 'Gerbera “Sundance”'],
      note: 'Flat, graphic faces on long bare stems, around a dark velvet disc.',
      kind: 'shelf',
      slot: 0,
      bloom: 'gerbera',
      colorId: 'red',
      colors: [
        { id: 'stock-red', count: 5 },
        { id: 'stock-pink', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'gerbera-warm',
      title: 'Gerbera, Peach & Yellow',
      varieties: ['Gerbera “Apricot Bliss”', 'Gerbera “Sunburst”'],
      note: 'The softer half of the gerbera shelf — apricot through to butter yellow.',
      kind: 'shelf',
      slot: 1,
      bloom: 'gerbera',
      colorId: 'peach',
      colors: [
        { id: 'stock-peach', count: 5 },
        { id: 'stock-yellow', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'tulip-warm',
      title: 'Tulip, Red & Orange',
      varieties: ['Tulipa “Ile de France”', 'Tulipa “Cairo”'],
      note: 'Six tepals held in a closed cup, on a thick stem that keeps moving in water.',
      kind: 'shelf',
      slot: 2,
      bloom: 'tulip',
      colorId: 'red',
      colors: [
        { id: 'stock-red', count: 5 },
        { id: 'stock-orange', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'tulip-cool',
      title: 'Tulip, Pink & Purple',
      varieties: ['Tulipa “Dynasty”', 'Tulipa “Purple Prince”'],
      note: 'Cut tight and left to open in the room — they will lean toward the window by morning.',
      kind: 'shelf',
      slot: 3,
      bloom: 'tulip',
      colorId: 'soft-pink',
      colors: [
        { id: 'stock-pink', count: 5 },
        { id: 'stock-purple', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'lisianthus-purple',
      title: 'Lisianthus, Purple & Pink',
      varieties: ['Eustoma “Rosita Lavender”', 'Eustoma “Alissa Pink”'],
      note: 'Rose-like without the weight, holding a fortnight in a cool room.',
      kind: 'shelf',
      slot: 4,
      bloom: 'lisianthus',
      colorId: 'purple',
      colors: [
        { id: 'stock-purple', count: 8 },
        { id: 'stock-pink', count: 7 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'iris-mixed',
      title: 'Iris, Purple & Yellow',
      varieties: ['Iris germanica', 'Iris “Golden Panther”'],
      note: 'Three falls hanging past the horizontal, three standards arching up, and a gold beard between them.',
      kind: 'shelf',
      slot: 5,
      bloom: 'iris',
      colorId: 'purple',
      colors: [
        { id: 'stock-purple', count: 5 },
        { id: 'stock-yellow', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'calla-mixed',
      title: 'Calla Lily, White & Yellow',
      varieties: ['Zantedeschia aethiopica', 'Zantedeschia “Florex Gold”'],
      note: 'One furled spathe on a thick, faintly translucent stem. Architectural, and it lasts.',
      kind: 'shelf',
      slot: 6,
      bloom: 'calla',
      colorId: 'white',
      colors: [
        { id: 'stock-white', count: 5 },
        { id: 'stock-yellow', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'orchid-mixed',
      title: 'Orchid, White & Pink',
      varieties: ['Phalaenopsis amabilis', 'Phalaenopsis “Pink Girl”'],
      note: 'Flowers spaced up an arching cane, each one flat and wide with a contrasting lip.',
      kind: 'shelf',
      slot: 7,
      bloom: 'orchid',
      colorId: 'white',
      colors: [
        { id: 'stock-white', count: 5 },
        { id: 'stock-pink', count: 5 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'ranunculus-peach',
      title: 'Ranunculus, Orange',
      varieties: ['Ranunculus “Clooney Hanoi”', 'Scabiosa stellata'],
      note: 'Tissue-thin petals in warm apricot-orange, wound tight around a dark eye.',
      kind: 'shelf',
      slot: 8,
      bloom: 'ranunculus',
      colorId: 'peach',
      colors: [{ id: 'stock-orange', count: 8 }],
      photo: '',
      pickable: true,
    },
    {
      id: 'sweet-pea',
      title: 'Sweet Pea, Light Pink',
      varieties: ['Lathyrus odoratus', 'Ammi majus'],
      note: 'Scented, fluttering, faintly translucent. Best appreciated up close.',
      kind: 'shelf',
      slot: 9,
      bloom: 'sweetpea',
      colorId: 'soft-pink',
      colors: [{ id: 'stock-light-pink', count: 8 }],
      photo: '',
      pickable: true,
    },
    {
      id: 'craspedia-yellow',
      title: 'Craspedia, Yellow',
      varieties: ['Craspedia globosa', 'Panicum “Fountain”'],
      note: 'Small suns on bare stems. Dries perfectly and keeps for a year.',
      kind: 'shelf',
      slot: 10,
      bloom: 'craspedia',
      colorId: 'yellow',
      colors: [{ id: 'stock-yellow', count: 8 }],
      photo: '',
      pickable: true,
    },

    /* --- the plaster steps: one vase to a tread -------------------------- */
    {
      id: 'rose-peach-steps',
      title: 'Rose & Garden Rose, Pink & Orange',
      varieties: ['Rosa “Shimmer” (rose)', 'Rosa “Quicksand” (garden rose)'],
      note:
        'The one vase on the tread that holds both forms: the broad, open rose in pink beside the dense many-petalled garden rose in apricot-orange. Cut together because the difference in the heads is the point.',
      kind: 'steps',
      slot: 0,
      bloom: 'rose',
      colorId: 'peach',
      colors: [
        { id: 'stock-pink', count: 6 },
        { id: 'stock-orange', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'dahlia-pale-steps',
      title: 'Dahlia, Pink',
      varieties: ['Dahlia “Café au Lait Rosé”'],
      note:
        'Dinner-plate heads, set at eye height on the middle tread where the light off the plaster is softest.',
      kind: 'steps',
      slot: 1,
      bloom: 'dahlia',
      colorId: 'soft-pink',
      colors: [{ id: 'stock-pink', count: 10 }],
      photo: '',
      pickable: true,
    },
    {
      id: 'ranunculus-pale-steps',
      title: 'Ranunculus, Orange — Bud Vase',
      varieties: ['Ranunculus “Cloni Success”'],
      note:
        'A bud vase on the top tread, above the height of the long table. Hundreds of tissue-thin petals to a head, and a stem that curves as it drinks.',
      kind: 'steps',
      slot: 2,
      bloom: 'ranunculus',
      colorId: 'peach',
      colors: [{ id: 'stock-orange', count: 10 }],
      photo: '',
      pickable: true,
    },

    /* --- the floor: tall glass, cut long, standing in water ------------- */
    {
      id: 'anthurium-tropical',
      title: 'Anthurium, Red & Pink',
      varieties: ['Anthurium andraeanum', 'Anthurium “Pink Champion”'],
      note: 'Lacquered, sculptural, unapologetic. Our warmest palette.',
      kind: 'floor',
      slot: 0,
      bloom: 'tropical',
      colorId: 'tropical',
      colors: [
        { id: 'stock-red', count: 6 },
        { id: 'stock-pink', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'branch-installation',
      title: 'Seasonal Branch Installation',
      varieties: ['Prunus branches', 'Salix contorta'],
      note:
        'A standing installation renewed each season. Available for events and windows by enquiry.',
      kind: 'floor',
      slot: 1,
      bloom: 'branches',
      colorId: 'purple',
      colors: [{ id: 'stock-purple', count: 5 }],
      photo: '',
      pickable: false,
    },
    {
      id: 'hydrangea-cool',
      title: 'Hydrangea, Purple & Light Blue',
      varieties: ['Hydrangea macrophylla “Verena”', 'Hydrangea “Blue Sky”'],
      note:
        'Whole mopheads, scores of florets to a stem. The blue is a soil colour, not a dye — it will not hold in every season.',
      kind: 'floor',
      slot: 2,
      bloom: 'hydrangea',
      colorId: 'purple',
      colors: [
        { id: 'stock-purple', count: 6 },
        { id: 'stock-light-blue', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'delphinium-blue',
      title: 'Delphinium, Light Blue, Dark Blue & Purple',
      varieties: ['Delphinium elatum', 'Delphinium “Volkerfrieden”', 'Eryngium planum'],
      note: 'A vertical, almost architectural blue — the only true blue we carry.',
      kind: 'floor',
      slot: 3,
      bloom: 'delphinium',
      colorId: 'blue',
      colors: [
        { id: 'stock-light-blue', count: 6 },
        { id: 'stock-dark-blue', count: 6 },
        { id: 'stock-purple', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'dahlia-red',
      title: 'Dahlia, Red, Pink & Orange',
      varieties: ['Dahlia “Karma Choc”', 'Dahlia “Cafe au Lait Rose”', 'Cotinus foliage'],
      note: 'Near-black at the centre, opening to oxblood. Cut for drama.',
      kind: 'floor',
      slot: 4,
      bloom: 'dahlia',
      colorId: 'red',
      colors: [
        { id: 'stock-red', count: 6 },
        { id: 'stock-pink', count: 6 },
        { id: 'stock-orange', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'hydrangea-warm',
      title: 'Hydrangea, Green & Pink',
      varieties: ['Hydrangea “Annabelle”', 'Hydrangea macrophylla “Rosita”'],
      note: 'The antique end of the hydrangea stock — limes going over to dusty rose.',
      kind: 'floor',
      slot: 5,
      bloom: 'hydrangea',
      colorId: 'soft-pink',
      colors: [
        { id: 'stock-green', count: 6 },
        { id: 'stock-pink', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
    {
      id: 'anthurium-pure',
      title: 'Anthurium, Green & White',
      varieties: ['Anthurium “Midori”', 'Anthurium “Sumi White”', 'Monstera leaf'],
      note: 'The same waxed spathe in green and in white. Reads as sculpture rather than as flowers.',
      kind: 'floor',
      slot: 6,
      bloom: 'tropical',
      colorId: 'white',
      colors: [
        { id: 'stock-green', count: 6 },
        { id: 'stock-white', count: 6 },
      ],
      photo: '',
      pickable: true,
    },
  ],

  /* Photographic pieces hung on the plaster wall. Photo optional. */
  frames: [
    {
      id: 'frame-01',
      title: 'Wrapped, No. 1',
      caption: 'Studio, August',
      photo: 'images/KUNEY peony bouquet.jpg',
    },
    {
      id: 'frame-02',
      title: 'Table Arrangement, No. 4',
      caption: 'Private commission',
      photo: 'images/KUNEY dahlia smoketreejpg.jpg',
    },
    {
      id: 'frame-03',
      title: 'Bud Vases, Morning',
      caption: 'Shop counter',
      photo: 'images/KUNEY pink rose bouquet.WEBP',
    },
  ],

  /* --- Availability calendar --------------------------------------------
     `dailyLimit`     bouquets per day, every day
     `overrides`      { 'YYYY-MM-DD': number } — set a single day; 0 = sold out
     `closed`         ['YYYY-MM-DD']           — shut, whatever number is set
     `closedWeekdays` [0..6] weekly rest days; empty means the shop is open
                      every day, including Sunday
     `leadTimeDays`   counted from today, so 3 blocks today, tomorrow and the
                      day after, making the third day from now the earliest a
                      visitor can choose

     A day only shows as sold out when the owner sets it to 0 or closes it.
     Visitors placing orders never change these numbers — see store.js.
     ---------------------------------------------------------------------- */
  calendar: {
    dailyLimit: 3,
    leadTimeDays: 3,
    closedWeekdays: [],
    overrides: {},
    closed: [],
    heading: 'Delivery Availability',
    subheading: 'Bouquets available per day',
  },

  /* --- Virtual garden ---------------------------------------------------- */
  garden: {
    title: 'The Garden',
    intro:
      'Sow a seed, return each day to water it, and watch it come into bloom. Tend the beds and we will keep something aside for you.',
    plotCount: 6,
    waterPerDay: 3,
    stageHours: [0, 6, 20, 44, 72],
    stageNames: ['Seed', 'Sprout', 'Bud', 'Opening', 'In Bloom'],
    rewards: [
      { day: 1, label: 'A packet of seeds', seeds: 2 },
      { day: 2, label: 'Two packets of seeds', seeds: 2 },
      { day: 3, label: 'Watering can, refilled', seeds: 3 },
      { day: 4, label: 'A rare seed', seeds: 3 },
      { day: 5, label: 'Three packets of seeds', seeds: 4 },
      { day: 6, label: 'Gardener’s trowel', seeds: 4 },
      { day: 7, label: 'Full bed of seeds', seeds: 6 },
    ],
    bloomReward: 'A bloom for the shop window',
    ctaLabel: 'Visit the real flower shop',
  },
};

/* Convenience: colour lookup used by the picker, invoice and flower factory. */
export function colorById(content, id) {
  return content.palette.find((c) => c.id === id) || content.palette[0];
}

/**
 * A flower's colour, looked up across both lists.
 *
 * Stock colours and the customer palette overlap in name but not in intent, and
 * a gathered stem may carry an id from either — a keepsake swatch has to resolve
 * whichever it was.
 */
export function stockColorById(content, id) {
  return (content.stockColors || []).find((c) => c.id === id)
    || (content.palette || []).find((c) => c.id === id)
    || null;
}

/**
 * The colour groups standing in a display, resolved to real colours.
 *
 * Falls back to the display's single palette colour, so a display added from the
 * admin panel — which does not know about `colors` — still builds.
 */
export function displayColorGroups(content, display) {
  const groups = (display.colors || [])
    .map((entry) => {
      const colour = stockColorById(content, entry.id);
      if (!colour) return null;
      return { ...colour, count: Math.max(1, Math.round(entry.count) || 1) };
    })
    .filter(Boolean);
  if (groups.length) return groups;
  const single = colorById(content, display.colorId);
  return [{ ...single, count: display.kind === 'floor' ? 7 : 9 }];
}
