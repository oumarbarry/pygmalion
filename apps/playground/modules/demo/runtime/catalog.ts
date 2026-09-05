/**
 * The demo shop's catalogue, as data, in English and French.
 *
 * "Maison Pygmalion" is a small home-goods DTC store. Everything a real one
 * has: a subtitle and a description worth reading, two or three photos,
 * options that actually produce several variants, a price in each currency,
 * and stock. `catalogFor(locale)` flattens it to one language for the seed.
 *
 * Photos live in `apps/playground/public/demo/` (CC0, see CREDITS.md there).
 * Swap the paths and the copy and this is your shop.
 *
 * Money is integer minor units: 4900 = 49,00 €.
 */

export type DemoLocale = 'en' | 'fr'
export interface Copy {
  en: string
  fr: string
}

// --- Flat, single-language shapes: what `seed.ts` writes to the store -------

export interface SeedVariant {
  title: string
  sku: string
  /** One value per product option, in the order the options are declared. */
  optionValues?: string[]
  eur: number
  usd: number
  stock: number
}

export interface SeedProduct {
  handle: string
  title: string
  subtitle: string
  description: string
  material?: string
  /** `public/demo/*.jpg` file names, the first is the thumbnail. */
  images: string[]
  collection?: string
  category: string
  options?: { title: string; values: string[] }[]
  variants: SeedVariant[]
}

// --- Bilingual source shapes: handles, skus, prices, stock, images are shared -

interface Variant extends Omit<SeedVariant, 'title'> {
  title: Copy
  /** One value per product option, by its English text. */
  optionValues?: string[]
}

interface Product extends Omit<SeedProduct, 'title' | 'subtitle' | 'description' | 'material' | 'options' | 'variants'> {
  title: Copy
  subtitle: Copy
  description: Copy
  material?: Copy
  options?: { title: Copy; values: Copy[] }[]
  variants: Variant[]
}

// --- Store ------------------------------------------------------------------

const STORE_NAME = 'Maison Pygmalion'
const LOCATION_NAME: Copy = { en: 'Nantes warehouse', fr: 'Entrepôt Nantes' }
const FULFILLMENT_SET_NAME: Copy = { en: 'Maison Pygmalion shipping', fr: 'Expéditions Maison Pygmalion' }
const ZONE_NAME: Copy = { en: 'Europe & North America', fr: 'Europe & Amérique du Nord' }
const PROMO_CODE: Copy = { en: 'WELCOME10', fr: 'BIENVENUE10' }

// Order matters: `regions.list()` answers newest-first, and `useRegion` falls
// back to the first row, so the region created LAST is what a first-time
// visitor is priced in. Europe/EUR is this shop's home market. Region names
// are identifiers, not copy: the same in both languages.
const REGIONS = [
  { name: 'United States', currencyCode: 'usd', countries: ['US', 'CA'] },
  { name: 'Europe', currencyCode: 'eur', countries: ['FR', 'BE', 'DE', 'ES', 'IT', 'NL', 'PT'] },
] as const

/** Example rates; a real store configures its own per country/province. */
const TAX = [
  { countryCode: 'FR', code: 'TVA20', name: { en: 'VAT 20%', fr: 'TVA 20 %' }, rate: 20 },
  { countryCode: 'US', code: 'SALES', name: { en: 'Sales tax', fr: 'Sales tax' }, rate: 8.25 },
]

const SHIPPING = [
  { name: { en: 'Standard, 3 to 5 days', fr: 'Colissimo, 3 à 5 jours' }, eur: 590, usd: 690 },
  { name: { en: 'Express, 24 h', fr: 'Express, 24 h' }, eur: 1400, usd: 1600 },
]

// --- Taxonomy ---------------------------------------------------------------

export const COLLECTIONS = [
  { handle: 'essentials', title: { en: 'Essentials', fr: 'Les essentiels' } },
  { handle: 'limited-edition', title: { en: 'Limited edition', fr: 'Édition limitée' } },
] as const

/** Two roots, four leaves: enough depth to prove the mpath descendant filter. */
export const CATEGORIES = [
  {
    handle: 'home',
    name: { en: 'Home', fr: 'Maison' },
    parent: null,
    description: { en: 'Everything that sits, hangs or glows.', fr: 'Tout ce qui se pose, s\'accroche et s\'allume.' },
  },
  {
    handle: 'kitchen-table',
    name: { en: 'Kitchen & table', fr: 'Cuisine & table' },
    parent: 'home',
    description: { en: 'The dinner set, the teapot, the board.', fr: 'Le service, la théière, la planche.' },
  },
  {
    handle: 'light',
    name: { en: 'Light', fr: 'Lumière' },
    parent: 'home',
    description: { en: 'Lamps and candles, evening to morning.', fr: 'Lampes et bougies, du soir au matin.' },
  },
  {
    handle: 'decor',
    name: { en: 'Decor', fr: 'Décoration' },
    parent: 'home',
    description: { en: 'Mirrors, frames, vases, baskets.', fr: 'Miroirs, cadres, vases, paniers.' },
  },
  {
    handle: 'care-textile',
    name: { en: 'Care & textile', fr: 'Soin & textile' },
    parent: null,
    description: { en: 'Soaps, throws, cushions, notebooks.', fr: 'Savons, plaids, coussins, carnets.' },
  },
] as const

// --- Products ---------------------------------------------------------------

const UNIQUE = (sku: string, eur: number, usd: number, stock = 25): Variant[] => [
  { title: { en: 'One size', fr: 'Taille unique' }, sku, eur, usd, stock },
]

export const PRODUCTS: Product[] = [
  // --- Kitchen & table -------------------------------------------------------
  {
    handle: 'onsen-teapot',
    title: { en: 'Onsen teapot', fr: 'Théière Onsen' },
    subtitle: { en: 'Glazed stoneware, 900 ml', fr: 'Grès émaillé, 900 ml' },
    description: {
      en: "A squat stoneware teapot, glazed by hand in a deep blue that turns to ink in low light. The spout does not drip, the handle stays warm rather than hot, and it goes through the dishwasher without complaint.",
      fr: "Une théière trapue en grès, émaillée à la main dans un bleu profond qui vire à l'encre sous la lumière rasante. Le bec ne goutte pas, la anse reste tiède, et elle passe au lave-vaisselle sans broncher.",
    },
    material: { en: 'Glazed stoneware', fr: 'Grès émaillé' },
    images: ['theiere-onsen-1.jpg', 'theiere-onsen-2.jpg'],
    collection: 'essentials',
    category: 'kitchen-table',
    options: [
      {
        title: { en: 'Color', fr: 'Couleur' },
        values: [
          { en: 'Midnight blue', fr: 'Bleu nuit' },
          { en: 'Terracotta', fr: 'Terre cuite' },
        ],
      },
    ],
    variants: [
      { title: { en: 'Midnight blue', fr: 'Bleu nuit' }, sku: 'THE-ONS-BLU', optionValues: ['Midnight blue'], eur: 5900, usd: 6900, stock: 18 },
      { title: { en: 'Terracotta', fr: 'Terre cuite' }, sku: 'THE-ONS-TER', optionValues: ['Terracotta'], eur: 5900, usd: 6900, stock: 7 },
    ],
  },
  {
    handle: 'sakura-teapot',
    title: { en: 'Sakura teapot', fr: 'Théière Sakura' },
    subtitle: { en: 'Painted porcelain, 700 ml', fr: 'Porcelaine peinte, 700 ml' },
    description: {
      en: "A floral pattern painted by hand on thin porcelain, in the spirit of last century's English tea services. Short run: thirty pieces, then no more.",
      fr: "Un motif floral peint à la main sur une porcelaine fine, dans l'esprit des services anglais du siècle dernier. Série courte : trente pièces, puis c'est fini.",
    },
    material: { en: 'Porcelain', fr: 'Porcelaine' },
    images: ['theiere-sakura-1.jpg'],
    collection: 'limited-edition',
    category: 'kitchen-table',
    variants: UNIQUE('THE-SAK', 7900, 8900, 12),
  },
  {
    handle: 'lumen-plates',
    title: { en: 'Lumen plates', fr: 'Assiettes Lumen' },
    subtitle: { en: 'Set of 4, white porcelain', fr: 'Lot de 4, porcelaine blanche' },
    description: {
      en: "A white that does not tire the eye: faintly creamy, with a slightly thick rim and enough weight to stay put. They go in the oven, the microwave and the dishwasher.",
      fr: "Le blanc qui ne fatigue pas : légèrement crème, bord un peu épais, assez lourdes pour rester en place. Elles vont au four, au micro-ondes et au lave-vaisselle.",
    },
    material: { en: 'Porcelain', fr: 'Porcelaine' },
    images: ['assiettes-lumen-1.jpg'],
    collection: 'essentials',
    category: 'kitchen-table',
    options: [
      {
        title: { en: 'Size', fr: 'Format' },
        values: [
          { en: 'Dinner 27 cm', fr: 'Plates 27 cm' },
          { en: 'Soup 22 cm', fr: 'Creuses 22 cm' },
        ],
      },
    ],
    variants: [
      { title: { en: 'Dinner 27 cm', fr: 'Plates 27 cm' }, sku: 'ASS-LUM-27', optionValues: ['Dinner 27 cm'], eur: 6400, usd: 7400, stock: 30 },
      { title: { en: 'Soup 22 cm', fr: 'Creuses 22 cm' }, sku: 'ASS-LUM-22', optionValues: ['Soup 22 cm'], eur: 5800, usd: 6800, stock: 22 },
    ],
  },
  {
    handle: 'soleil-bowls',
    title: { en: 'Soleil bowls', fr: 'Bols Soleil' },
    subtitle: { en: 'Set of 2, yellow ceramic', fr: 'Lot de 2, céramique jaune' },
    description: {
      en: "A frank, almost cheeky yellow on ceramic that is thrown on the wheel, then scored with fine grooves. The kind of bowl you take out in the morning without thinking.",
      fr: "Un jaune franc, presque insolent, sur une céramique tournée puis gravée de fines rainures. Le genre de bol qu'on sort le matin sans réfléchir.",
    },
    material: { en: 'Ceramic', fr: 'Céramique' },
    images: ['bols-soleil-1.jpg'],
    category: 'kitchen-table',
    variants: UNIQUE('BOL-SOL', 3400, 3900, 40),
  },
  {
    handle: 'solid-oak-board',
    title: { en: 'Solid oak board', fr: 'Planche Chêne massif' },
    subtitle: { en: 'Oiled, 42 × 26 cm', fr: 'Huilée, 42 × 26 cm' },
    description: {
      en: "Cut from a single piece of oak, finished with linseed oil, with a juice groove on three sides. It wears in, it does not wear out: a pass of sandpaper and it is good for another ten years.",
      fr: "Taillée dans une seule pièce de chêne, huilée au lin, avec une rigole sur trois côtés. Elle se patine, elle ne se jette pas : un coup de papier de verre et elle repart pour dix ans.",
    },
    material: { en: 'Solid oak', fr: 'Chêne massif' },
    images: ['planche-chene-1.jpg', 'planche-chene-2.jpg'],
    collection: 'essentials',
    category: 'kitchen-table',
    options: [
      {
        title: { en: 'Size', fr: 'Taille' },
        values: [
          { en: 'Medium', fr: 'Moyenne' },
          { en: 'Large', fr: 'Grande' },
        ],
      },
    ],
    variants: [
      { title: { en: 'Medium', fr: 'Moyenne' }, sku: 'PLA-CHE-M', optionValues: ['Medium'], eur: 4900, usd: 5600, stock: 20 },
      { title: { en: 'Large', fr: 'Grande' }, sku: 'PLA-CHE-L', optionValues: ['Large'], eur: 6900, usd: 7900, stock: 11 },
    ],
  },
  {
    handle: 'workshop-apron',
    title: { en: 'Workshop apron', fr: "Tablier d'atelier" },
    subtitle: { en: 'Washed cotton canvas', fr: 'Toile de coton lavé' },
    description: {
      en: "Straight cut, straps crossed at the back, two deep pockets. A thick canvas that softens with every wash and keeps the marks of whatever you do in it.",
      fr: "Coupe droite, bretelles croisées dans le dos, deux poches profondes. Une toile épaisse qui s'assouplit au fil des lavages et garde la trace de ce qu'on y fait.",
    },
    material: { en: 'Washed cotton', fr: 'Coton lavé' },
    images: ['tablier-atelier-1.jpg'],
    category: 'care-textile',
    options: [
      {
        title: { en: 'Size', fr: 'Taille' },
        values: [
          { en: 'S/M', fr: 'S/M' },
          { en: 'L/XL', fr: 'L/XL' },
        ],
      },
    ],
    variants: [
      { title: { en: 'S/M', fr: 'S/M' }, sku: 'TAB-ATE-SM', optionValues: ['S/M'], eur: 4200, usd: 4800, stock: 16 },
      { title: { en: 'L/XL', fr: 'L/XL' }, sku: 'TAB-ATE-LX', optionValues: ['L/XL'], eur: 4200, usd: 4800, stock: 14 },
    ],
  },

  // --- Light -----------------------------------------------------------------
  {
    handle: 'halo-lamp',
    title: { en: 'Halo lamp', fr: 'Lampe Halo' },
    subtitle: { en: 'Cotton shade, brass stem', fr: 'Abat-jour coton, pied laiton' },
    description: {
      en: "A bedside lamp that throws its light downward without glare. Brushed brass stem, switch on the cord, E27 bulb not included: pick a warm one, 2700 K.",
      fr: "Une lampe de chevet qui éclaire vers le bas sans éblouir. Pied en laiton brossé, interrupteur au fil, ampoule E27 non fournie — prenez-la chaude, 2700 K.",
    },
    material: { en: 'Brass, cotton', fr: 'Laiton, coton' },
    images: ['lampe-halo-1.jpg'],
    collection: 'essentials',
    category: 'light',
    variants: UNIQUE('LAM-HAL', 8900, 9900, 14),
  },
  {
    handle: 'linen-lamp',
    title: { en: 'Linen lamp', fr: 'Lampe Lin' },
    subtitle: { en: 'Natural linen shade', fr: 'Abat-jour lin naturel' },
    description: {
      en: "Raw linen scatters a warm, uneven light, like a lantern. Matte black metal frame, two meters of braided fabric cord.",
      fr: "Le lin brut diffuse une lumière chaude et irrégulière, comme une lanterne. Structure métal noir mat, câble textile tressé de deux mètres.",
    },
    material: { en: 'Linen, steel', fr: 'Lin, acier' },
    images: ['lampe-lin-1.jpg'],
    category: 'light',
    variants: UNIQUE('LAM-LIN', 7400, 8400, 9),
  },
  {
    handle: 'lueur-portable-lamp',
    title: { en: 'Lueur portable lamp', fr: 'Lampe nomade Lueur' },
    subtitle: { en: 'Cordless, 12 h of battery', fr: 'Sans fil, 12 h d\'autonomie' },
    description: {
      en: "Charges over USB-C, three brightness levels, and it moves from the nightstand to the terrace without anyone hunting for a socket. Textured glass, anodized aluminum base.",
      fr: "Rechargeable en USB-C, trois intensités, elle passe de la table de nuit à la terrasse sans qu'on cherche une prise. Verre texturé, base en aluminium anodisé.",
    },
    material: { en: 'Glass, aluminum', fr: 'Verre, aluminium' },
    images: ['lampe-lueur-1.jpg'],
    collection: 'limited-edition',
    category: 'light',
    variants: UNIQUE('LAM-LUE', 12900, 14900, 8),
  },
  {
    handle: 'amber-wood-candle',
    title: { en: 'Amber & Wood candle', fr: 'Bougie Ambre & Bois' },
    subtitle: { en: 'Soy wax, 220 g, 50 h', fr: 'Cire de soja, 220 g, 50 h' },
    description: {
      en: "Amber, cedar, a touch of vanilla. Cold-poured soy wax, cotton wick, a glass you keep. Burn it for two hours the first time so the wax melts all the way to the edge.",
      fr: "Ambre, cèdre, une pointe de vanille. Cire de soja coulée à froid, mèche coton, verre réutilisable. Brûlez-la deux heures la première fois pour que la cire fonde jusqu'aux bords.",
    },
    material: { en: 'Soy wax', fr: 'Cire de soja' },
    images: ['bougie-ambre-1.jpg', 'bougie-ambre-2.jpg'],
    collection: 'essentials',
    category: 'light',
    options: [
      {
        title: { en: 'Size', fr: 'Format' },
        values: [
          { en: '220 g', fr: '220 g' },
          { en: '400 g', fr: '400 g' },
        ],
      },
    ],
    variants: [
      { title: { en: '220 g', fr: '220 g' }, sku: 'BOU-AMB-220', optionValues: ['220 g'], eur: 2900, usd: 3400, stock: 60 },
      { title: { en: '400 g', fr: '400 g' }, sku: 'BOU-AMB-400', optionValues: ['400 g'], eur: 4400, usd: 4900, stock: 35 },
    ],
  },
  {
    handle: 'black-fig-candle',
    title: { en: 'Black Fig candle', fr: 'Bougie Figue Noire' },
    subtitle: { en: 'Soy wax, 220 g, 50 h', fr: 'Cire de soja, 220 g, 50 h' },
    description: {
      en: "Fig leaf, almond milk, a woody base. Greener and fresher than the Amber: the one you light in the afternoon rather than the evening.",
      fr: "Feuille de figuier, lait d'amande, un fond boisé. Plus verte et plus fraîche que l'Ambre — celle qu'on allume l'après-midi plutôt que le soir.",
    },
    material: { en: 'Soy wax', fr: 'Cire de soja' },
    images: ['bougie-figue-1.jpg', 'bougie-figue-2.jpg'],
    category: 'light',
    variants: UNIQUE('BOU-FIG', 2900, 3400, 45),
  },

  // --- Decor -----------------------------------------------------------------
  {
    handle: 'halo-round-mirror',
    title: { en: 'Halo round mirror', fr: 'Miroir rond Halo' },
    subtitle: { en: 'Wooden frame, Ø 60 cm', fr: 'Cadre bois, Ø 60 cm' },
    description: {
      en: "A circle of pale wood, a mirror with no bevel, a hanger already fitted on the back. It opens up a narrow hallway better than any painting.",
      fr: "Un cercle de bois clair, un miroir sans biseau, une attache déjà montée au dos. Il agrandit une entrée étroite mieux que n'importe quel tableau.",
    },
    material: { en: 'Oak, glass', fr: 'Chêne, verre' },
    images: ['miroir-halo-1.jpg'],
    collection: 'essentials',
    category: 'decor',
    variants: UNIQUE('MIR-HAL', 11900, 13500, 10),
  },
  {
    handle: 'gallery-frame',
    title: { en: 'Gallery frame', fr: 'Cadre Gallery' },
    subtitle: { en: 'Solid wood, anti-glare glass', fr: 'Bois massif, verre antireflet' },
    description: {
      en: "A slim 12 mm molding, an off-white mat, anti-glare glass that shows the picture and not the window across the room. Stands or hangs, portrait or landscape.",
      fr: "Une baguette fine de 12 mm, un passe-partout blanc cassé, un verre antireflet qui laisse voir l'image et pas la fenêtre d'en face. Se pose ou s'accroche, portrait ou paysage.",
    },
    material: { en: 'Solid wood', fr: 'Bois massif' },
    images: ['cadre-gallery-1.jpg', 'cadre-gallery-2.jpg'],
    category: 'decor',
    options: [
      {
        title: { en: 'Size', fr: 'Format' },
        values: [
          { en: 'A4', fr: 'A4' },
          { en: 'A3', fr: 'A3' },
        ],
      },
    ],
    variants: [
      { title: { en: 'A4', fr: 'A4' }, sku: 'CAD-GAL-A4', optionValues: ['A4'], eur: 3200, usd: 3700, stock: 34 },
      { title: { en: 'A3', fr: 'A3' }, sku: 'CAD-GAL-A3', optionValues: ['A3'], eur: 4500, usd: 5200, stock: 21 },
    ],
  },
  {
    handle: 'narrow-neck-vase',
    title: { en: 'Narrow-neck vase', fr: 'Vase col étroit' },
    subtitle: { en: 'Blown glass, 24 cm', fr: 'Verre soufflé, 24 cm' },
    description: {
      en: "A tight neck that holds three stems straight, which is all it needs to do. Mouth-blown, so each piece has its own bubbles.",
      fr: "Un col resserré qui tient trois tiges bien droites — c'est tout ce qu'il faut. Soufflé bouche, donc chaque pièce a ses propres bulles.",
    },
    material: { en: 'Blown glass', fr: 'Verre soufflé' },
    images: ['vase-col-etroit-1.jpg', 'vase-col-etroit-2.jpg'],
    collection: 'limited-edition',
    category: 'decor',
    variants: UNIQUE('VAS-COL', 3900, 4500, 26),
  },
  {
    handle: 'osier-woven-basket',
    title: { en: 'Osier woven basket', fr: 'Panier tressé Osier' },
    subtitle: { en: 'Handmade, Ø 38 cm', fr: 'Fait main, Ø 38 cm' },
    description: {
      en: "Woven by hand, no glue, no staples. It holds laundry, firewood or nothing at all, and it looks good enough to stay in plain sight.",
      fr: "Tressé à la main, sans colle ni agrafe. Il range le linge, le bois ou rien du tout, et il est assez beau pour rester en vue.",
    },
    material: { en: 'Wicker', fr: 'Osier' },
    images: ['panier-osier-1.jpg', 'panier-osier-2.jpg'],
    category: 'decor',
    variants: UNIQUE('PAN-OSI', 5400, 6200, 15),
  },

  // --- Care & textile --------------------------------------------------------
  {
    handle: 'tartan-throw',
    title: { en: 'Tartan throw', fr: 'Plaid Tartan' },
    subtitle: { en: 'Lambswool, 130 × 180 cm', fr: 'Laine d\'agneau, 130 × 180 cm' },
    description: {
      en: "A real tartan woven from lambswool, fringes knotted by hand. Heavy without being stifling: the one that lives on the sofa from November to March.",
      fr: "Un vrai tartan tissé en laine d'agneau, franges nouées à la main. Lourd sans être étouffant : celui qu'on garde sur le canapé de novembre à mars.",
    },
    material: { en: 'Lambswool', fr: "Laine d'agneau" },
    images: ['plaid-tartan-1.jpg'],
    collection: 'essentials',
    category: 'care-textile',
    variants: UNIQUE('PLA-TAR', 8900, 9900, 12),
  },
  {
    handle: 'oat-milk-soap',
    title: { en: 'Oat Milk soap', fr: "Savon Lait d'Avoine" },
    subtitle: { en: 'Cold process, 100 g', fr: 'Saponifié à froid, 100 g' },
    description: {
      en: "Mild enough for skin that feels tight after washing. Oat milk, shea butter, no essential oils, so nothing stings.",
      fr: "Doux au point de convenir aux peaux qui tirent. Lait d'avoine, beurre de karité, aucune huile essentielle — donc rien qui pique.",
    },
    material: { en: 'Cold-process soap', fr: 'Savon saponifié à froid' },
    images: ['savon-avoine-1.jpg'],
    category: 'care-textile',
    variants: UNIQUE('SAV-AVO', 900, 1100, 80),
  },
  {
    handle: 'pink-clay-soap',
    title: { en: 'Pink Clay soap', fr: 'Savon Argile Rose' },
    subtitle: { en: 'Cold process, 100 g', fr: 'Saponifié à froid, 100 g' },
    description: {
      en: "Pink clay softens and mattifies. A light geranium scent, a dense lather, and it lasts a good month in the shower if you let it dry between uses.",
      fr: "L'argile rose adoucit et matifie. Parfum géranium léger, mousse dense, il tient un bon mois sous la douche si on le laisse sécher entre deux.",
    },
    material: { en: 'Cold-process soap', fr: 'Savon saponifié à froid' },
    images: ['savon-argile-1.jpg'],
    category: 'care-textile',
    variants: UNIQUE('SAV-ARG', 900, 1100, 80),
  },
  {
    handle: 'activated-charcoal-soap',
    title: { en: 'Activated Charcoal soap', fr: 'Savon Charbon Actif' },
    subtitle: { en: 'Cold process, 100 g', fr: 'Saponifié à froid, 100 g' },
    description: {
      en: "Deep black, purifying, with a hint of eucalyptus. The only one of the three you notice from across the bathroom.",
      fr: "Noir profond, purifiant, avec une pointe d'eucalyptus. Le seul des trois qu'on remarque de loin dans la salle de bain.",
    },
    material: { en: 'Cold-process soap', fr: 'Savon saponifié à froid' },
    images: ['savon-charbon-1.jpg'],
    collection: 'limited-edition',
    category: 'care-textile',
    variants: UNIQUE('SAV-CHA', 1000, 1200, 65),
  },
  {
    handle: 'bound-notebook',
    title: { en: 'Bound notebook', fr: 'Carnet relié' },
    subtitle: { en: 'Thread-sewn, 192 pages, 90 g/m²', fr: 'Cousu fil, 192 pages, 90 g/m²' },
    description: {
      en: "A sewn binding that opens flat, 90 g paper that keeps ink from showing through, a ribbon marker and a pocket at the back. Nothing more.",
      fr: "Une reliure cousue qui s'ouvre à plat, un papier de 90 g qui ne laisse pas traverser l'encre, un signet et une pochette au dos. Rien de plus.",
    },
    material: { en: '90 g/m² paper', fr: 'Papier 90 g/m²' },
    images: ['carnet-relie-1.jpg', 'carnet-relie-2.jpg'],
    collection: 'essentials',
    category: 'care-textile',
    options: [
      {
        title: { en: 'Ruling', fr: 'Réglure' },
        values: [
          { en: 'Lined', fr: 'Ligné' },
          { en: 'Dotted', fr: 'Pointillé' },
        ],
      },
    ],
    variants: [
      { title: { en: 'Lined', fr: 'Ligné' }, sku: 'CAR-REL-LIG', optionValues: ['Lined'], eur: 1800, usd: 2100, stock: 50 },
      { title: { en: 'Dotted', fr: 'Pointillé' }, sku: 'CAR-REL-POI', optionValues: ['Dotted'], eur: 1800, usd: 2100, stock: 50 },
    ],
  },
]

// --- Resolver: one language, the flat shape the seed writes -----------------

export function catalogFor(locale: DemoLocale) {
  const t = (copy: Copy) => copy[locale]
  const products: SeedProduct[] = PRODUCTS.map((p) => ({
    ...p,
    title: t(p.title),
    subtitle: t(p.subtitle),
    description: t(p.description),
    material: p.material && t(p.material),
    options: p.options?.map((o) => ({ title: t(o.title), values: o.values.map(t) })),
    variants: p.variants.map((v) => ({
      ...v,
      title: t(v.title),
      // A variant names its option values in English; hand the seed the same
      // language as the option it will look them up in.
      optionValues: v.optionValues?.map((en, i) => t(p.options![i].values.find((value) => value.en === en)!)),
    })),
  }))
  return {
    products,
    collections: COLLECTIONS.map((c) => ({ ...c, title: t(c.title) })),
    categories: CATEGORIES.map((c) => ({ ...c, name: t(c.name), description: t(c.description) })),
    shipping: SHIPPING.map((s) => ({ ...s, name: t(s.name) })),
    tax: TAX.map((x) => ({ ...x, name: t(x.name) })),
    regions: REGIONS,
    promoCode: t(PROMO_CODE),
    storeName: STORE_NAME,
    locationName: t(LOCATION_NAME),
    fulfillmentSetName: t(FULFILLMENT_SET_NAME),
    zoneName: t(ZONE_NAME),
  }
}

export type DemoCatalog = ReturnType<typeof catalogFor>
