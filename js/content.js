/* ==========================================================================
   Default content for KUNEY FLOWERS.

   Everything a shop owner should be able to change lives here: brand copy,
   colours, flower names, prices, delivery zones, terms, calendar stock.
   The admin panel (/admin.html) edits a copy of this object and stores it in
   the browser; `Export JSON` writes it back out so it can be committed to
   data/content.json and shipped to every visitor.

   Adding a key here makes it available everywhere via store.getContent().
   ========================================================================== */

export const CONTENT_VERSION = 3;

export const DEFAULT_CONTENT = {
  version: CONTENT_VERSION,

  brand: {
    name: 'KUNEY FLOWERS',
    logoText: 'KUNEY',
    logoMark: 'FLOWERS',
    tagline: 'Seasonal florist-choice bouquets, Hong Kong',
    introTitle: 'A quiet room for flowers',
    intro:
      'Step inside a still, sunlit space where the season’s finest stems are gathered and arranged by hand. Wander the shop, choose a palette and an occasion, then let our florist compose something singular for you.',
    seasonLabel: 'Current Season',
    seasonName: 'Late Summer Selection',
    enterLabel: 'Enter KUNEY FLOWERS SHOP',
    collectionLabel: 'View Collection',
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
    floor: '#e3dbcd',
    wall: '#f2eee7',
    plaster: '#f6f3ed',
    concrete: '#cfc9be',
    island: '#4f6b5a',
    islandVein: '#9fb9a4',
    terracotta: '#b5866b',
    wrapPaper: '#efe7d8',
    ribbon: '#8c9a82',
    daylight: '#fff6e8',
    daylightIntensity: 3.1,
    accent: '#8c9a82',
  },

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
      'The stems you gathered in the virtual shop are a keepsake of your visit. They guide the mood of your bouquet but do not set the variety or the count of the flowers delivered.',
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
     `kind`  vase-table | shelf | floor | frame
     `slot`  index into the layout positions defined per kind in scene-shop.js
     `photo` optional path, e.g. 'images/peony-01.jpg' (frames + collection)
     `bloom` procedural flower recipe id from js/flowers.js
     ---------------------------------------------------------------------- */

  displays: [
    {
      id: 'garden-rose',
      title: 'Garden Rose, Ivory',
      varieties: ['Rosa “Patience”', 'Astrantia major', 'Silver eucalyptus'],
      note:
        'Cupped ivory heads opening slowly over a week, cut with astrantia for a soft, unstudied edge.',
      kind: 'vase-table',
      slot: 0,
      bloom: 'rose',
      colorId: 'white',
      photo: '',
      pickable: true,
    },
    {
      id: 'peony-blush',
      title: 'Peony, Blush',
      varieties: ['Paeonia lactiflora “Sarah Bernhardt”', 'Nigella pods'],
      note:
        'The shortest season we keep. Heavy, layered heads in the palest blush, cut just as the bud gives.',
      kind: 'vase-table',
      slot: 1,
      bloom: 'peony',
      colorId: 'blush-pink',
      photo: '',
      pickable: true,
    },
    {
      id: 'ranunculus-peach',
      title: 'Ranunculus, Peach',
      varieties: ['Ranunculus “Clooney Hanoi”', 'Scabiosa stellata'],
      note: 'Tissue-thin petals in warm apricot, wound tight around a dark eye.',
      kind: 'vase-table',
      slot: 2,
      bloom: 'ranunculus',
      colorId: 'peach',
      photo: '',
      pickable: true,
    },
    {
      id: 'sweet-pea',
      title: 'Sweet Pea, Dreamy Pastel',
      varieties: ['Lathyrus odoratus', 'Ammi majus'],
      note: 'Scented, fluttering, faintly translucent. Best appreciated up close.',
      kind: 'shelf',
      slot: 0,
      bloom: 'sweetpea',
      colorId: 'dreamy-pastel',
      photo: '',
      pickable: true,
    },
    {
      id: 'delphinium-blue',
      title: 'Delphinium, Blue',
      varieties: ['Delphinium elatum', 'Eryngium planum'],
      note: 'A vertical, almost architectural blue — the only true blue we carry.',
      kind: 'shelf',
      slot: 1,
      bloom: 'delphinium',
      colorId: 'blue',
      photo: '',
      pickable: true,
    },
    {
      id: 'lisianthus-purple',
      title: 'Lisianthus, Purple',
      varieties: ['Eustoma “Rosita Lavender”', 'Clematis vine'],
      note: 'Rose-like without the weight, holding a fortnight in a cool room.',
      kind: 'shelf',
      slot: 2,
      bloom: 'lisianthus',
      colorId: 'purple',
      photo: '',
      pickable: true,
    },
    {
      id: 'dahlia-red',
      title: 'Dahlia, Deep Red',
      varieties: ['Dahlia “Karma Choc”', 'Cotinus foliage'],
      note: 'Near-black at the centre, opening to oxblood. Cut for drama.',
      kind: 'shelf',
      slot: 3,
      bloom: 'dahlia',
      colorId: 'red',
      photo: '',
      pickable: true,
    },
    {
      id: 'craspedia-yellow',
      title: 'Craspedia, Yellow',
      varieties: ['Craspedia globosa', 'Panicum “Fountain”'],
      note: 'Small suns on bare stems. Dries perfectly and keeps for a year.',
      kind: 'shelf',
      slot: 4,
      bloom: 'craspedia',
      colorId: 'yellow',
      photo: '',
      pickable: true,
    },
    {
      id: 'anthurium-tropical',
      title: 'Anthurium, Tropical',
      varieties: ['Anthurium andraeanum', 'Monstera leaf', 'Heliconia'],
      note: 'Lacquered, sculptural, unapologetic. Our warmest palette.',
      kind: 'floor',
      slot: 0,
      bloom: 'tropical',
      colorId: 'tropical',
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
      colorId: 'white',
      photo: '',
      pickable: false,
    },
  ],

  /* Photographic pieces hung on the plaster wall. Photo optional. */
  frames: [
    {
      id: 'frame-01',
      title: 'Wrapped, No. 1',
      caption: 'Studio, August',
      photo: '',
    },
    {
      id: 'frame-02',
      title: 'Table Arrangement, No. 4',
      caption: 'Private commission',
      photo: '',
    },
    {
      id: 'frame-03',
      title: 'Bud Vases, Morning',
      caption: 'Shop counter',
      photo: '',
    },
  ],

  /* --- Availability calendar --------------------------------------------
     `dailyLimit`   default bouquets per day
     `overrides`    { 'YYYY-MM-DD': remaining }  — wins over dailyLimit
     `closed`       ['YYYY-MM-DD']               — hard sold out / rest day
     `leadTimeDays` earliest orderable day, counted from today
     ---------------------------------------------------------------------- */
  calendar: {
    dailyLimit: 8,
    leadTimeDays: 1,
    closedWeekdays: [0],
    overrides: {},
    closed: [],
    heading: 'Delivery Availability',
    subheading: 'Remaining bouquets per day',
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
