/**
 * The demo shop's catalogue, as data.
 *
 * "Maison Pygmalion" — a small home-goods DTC store. Everything a real one has:
 * a subtitle and a description worth reading, two or three photos, options that
 * actually produce several variants, a price in each currency, and stock.
 *
 * Photos live in `apps/playground/public/demo/` (CC0 — see CREDITS.md there).
 * Swap the paths and the copy and this is your shop.
 *
 * Money is integer minor units: 4900 = 49,00 €.
 */

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
  /** `public/demo/*.jpg` file names — the first is the thumbnail. */
  images: string[]
  collection?: string
  category: string
  options?: { title: string; values: string[] }[]
  variants: SeedVariant[]
}

export const COLLECTIONS = [
  { handle: 'les-essentiels', title: 'Les essentiels' },
  { handle: 'edition-limitee', title: 'Édition limitée' },
] as const

/** Two roots, four leaves — enough depth to prove the mpath descendant filter. */
export const CATEGORIES = [
  { handle: 'maison', name: 'Maison', parent: null, description: 'Tout ce qui se pose, s\'accroche et s\'allume.' },
  { handle: 'cuisine', name: 'Cuisine & table', parent: 'maison', description: 'Le service, la théière, la planche.' },
  { handle: 'lumiere', name: 'Lumière', parent: 'maison', description: 'Lampes et bougies, du soir au matin.' },
  { handle: 'deco', name: 'Décoration', parent: 'maison', description: 'Miroirs, cadres, vases, paniers.' },
  { handle: 'soin', name: 'Soin & textile', parent: null, description: 'Savons, plaids, coussins, carnets.' },
] as const

const UNIQUE = (sku: string, eur: number, usd: number, stock = 25): SeedVariant[] => [
  { title: 'Taille unique', sku, eur, usd, stock },
]

export const PRODUCTS: SeedProduct[] = [
  // --- Cuisine & table -------------------------------------------------------
  {
    handle: 'theiere-onsen',
    title: 'Théière Onsen',
    subtitle: 'Grès émaillé, 900 ml',
    description:
      "Une théière trapue en grès, émaillée à la main dans un bleu profond qui vire à l'encre sous la lumière rasante. Le bec ne goutte pas, la anse reste tiède, et elle passe au lave-vaisselle sans broncher.",
    material: 'Grès émaillé',
    images: ['theiere-onsen-1.jpg', 'theiere-onsen-2.jpg'],
    collection: 'les-essentiels',
    category: 'cuisine',
    options: [{ title: 'Couleur', values: ['Bleu nuit', 'Terre cuite'] }],
    variants: [
      { title: 'Bleu nuit', sku: 'THE-ONS-BLU', optionValues: ['Bleu nuit'], eur: 5900, usd: 6900, stock: 18 },
      { title: 'Terre cuite', sku: 'THE-ONS-TER', optionValues: ['Terre cuite'], eur: 5900, usd: 6900, stock: 7 },
    ],
  },
  {
    handle: 'theiere-sakura',
    title: 'Théière Sakura',
    subtitle: 'Porcelaine peinte, 700 ml',
    description:
      "Un motif floral peint à la main sur une porcelaine fine, dans l'esprit des services anglais du siècle dernier. Série courte : trente pièces, puis c'est fini.",
    material: 'Porcelaine',
    images: ['theiere-sakura-1.jpg'],
    collection: 'edition-limitee',
    category: 'cuisine',
    variants: UNIQUE('THE-SAK', 7900, 8900, 12),
  },
  {
    handle: 'assiettes-lumen',
    title: 'Assiettes Lumen',
    subtitle: 'Lot de 4, porcelaine blanche',
    description:
      "Le blanc qui ne fatigue pas : légèrement crème, bord un peu épais, assez lourdes pour rester en place. Elles vont au four, au micro-ondes et au lave-vaisselle.",
    material: 'Porcelaine',
    images: ['assiettes-lumen-1.jpg'],
    collection: 'les-essentiels',
    category: 'cuisine',
    options: [{ title: 'Format', values: ['Plates 27 cm', 'Creuses 22 cm'] }],
    variants: [
      { title: 'Plates 27 cm', sku: 'ASS-LUM-27', optionValues: ['Plates 27 cm'], eur: 6400, usd: 7400, stock: 30 },
      { title: 'Creuses 22 cm', sku: 'ASS-LUM-22', optionValues: ['Creuses 22 cm'], eur: 5800, usd: 6800, stock: 22 },
    ],
  },
  {
    handle: 'bols-soleil',
    title: 'Bols Soleil',
    subtitle: 'Lot de 2, céramique jaune',
    description:
      "Un jaune franc, presque insolent, sur une céramique tournée puis gravée de fines rainures. Le genre de bol qu'on sort le matin sans réfléchir.",
    material: 'Céramique',
    images: ['bols-soleil-1.jpg'],
    category: 'cuisine',
    variants: UNIQUE('BOL-SOL', 3400, 3900, 40),
  },
  {
    handle: 'planche-chene',
    title: 'Planche Chêne massif',
    subtitle: 'Huilée, 42 × 26 cm',
    description:
      "Taillée dans une seule pièce de chêne, huilée au lin, avec une rigole sur trois côtés. Elle se patine, elle ne se jette pas : un coup de papier de verre et elle repart pour dix ans.",
    material: 'Chêne massif',
    images: ['planche-chene-1.jpg', 'planche-chene-2.jpg'],
    collection: 'les-essentiels',
    category: 'cuisine',
    options: [{ title: 'Taille', values: ['Moyenne', 'Grande'] }],
    variants: [
      { title: 'Moyenne', sku: 'PLA-CHE-M', optionValues: ['Moyenne'], eur: 4900, usd: 5600, stock: 20 },
      { title: 'Grande', sku: 'PLA-CHE-L', optionValues: ['Grande'], eur: 6900, usd: 7900, stock: 11 },
    ],
  },
  {
    handle: 'tablier-atelier',
    title: "Tablier d'atelier",
    subtitle: 'Toile de coton lavé',
    description:
      "Coupe droite, bretelles croisées dans le dos, deux poches profondes. Une toile épaisse qui s'assouplit au fil des lavages et garde la trace de ce qu'on y fait.",
    material: 'Coton lavé',
    images: ['tablier-atelier-1.jpg'],
    category: 'soin',
    options: [{ title: 'Taille', values: ['S/M', 'L/XL'] }],
    variants: [
      { title: 'S/M', sku: 'TAB-ATE-SM', optionValues: ['S/M'], eur: 4200, usd: 4800, stock: 16 },
      { title: 'L/XL', sku: 'TAB-ATE-LX', optionValues: ['L/XL'], eur: 4200, usd: 4800, stock: 14 },
    ],
  },

  // --- Lumière ---------------------------------------------------------------
  {
    handle: 'lampe-halo',
    title: 'Lampe Halo',
    subtitle: 'Abat-jour coton, pied laiton',
    description:
      "Une lampe de chevet qui éclaire vers le bas sans éblouir. Pied en laiton brossé, interrupteur au fil, ampoule E27 non fournie — prenez-la chaude, 2700 K.",
    material: 'Laiton, coton',
    images: ['lampe-halo-1.jpg'],
    collection: 'les-essentiels',
    category: 'lumiere',
    variants: UNIQUE('LAM-HAL', 8900, 9900, 14),
  },
  {
    handle: 'lampe-lin',
    title: 'Lampe Lin',
    subtitle: 'Abat-jour lin naturel',
    description:
      "Le lin brut diffuse une lumière chaude et irrégulière, comme une lanterne. Structure métal noir mat, câble textile tressé de deux mètres.",
    material: 'Lin, acier',
    images: ['lampe-lin-1.jpg'],
    category: 'lumiere',
    variants: UNIQUE('LAM-LIN', 7400, 8400, 9),
  },
  {
    handle: 'lampe-lueur',
    title: 'Lampe nomade Lueur',
    subtitle: 'Sans fil, 12 h d\'autonomie',
    description:
      "Rechargeable en USB-C, trois intensités, elle passe de la table de nuit à la terrasse sans qu'on cherche une prise. Verre texturé, base en aluminium anodisé.",
    material: 'Verre, aluminium',
    images: ['lampe-lueur-1.jpg'],
    collection: 'edition-limitee',
    category: 'lumiere',
    variants: UNIQUE('LAM-LUE', 12900, 14900, 8),
  },
  {
    handle: 'bougie-ambre',
    title: 'Bougie Ambre & Bois',
    subtitle: 'Cire de soja, 220 g, 50 h',
    description:
      "Ambre, cèdre, une pointe de vanille. Cire de soja coulée à froid, mèche coton, verre réutilisable. Brûlez-la deux heures la première fois pour que la cire fonde jusqu'aux bords.",
    material: 'Cire de soja',
    images: ['bougie-ambre-1.jpg', 'bougie-ambre-2.jpg'],
    collection: 'les-essentiels',
    category: 'lumiere',
    options: [{ title: 'Format', values: ['220 g', '400 g'] }],
    variants: [
      { title: '220 g', sku: 'BOU-AMB-220', optionValues: ['220 g'], eur: 2900, usd: 3400, stock: 60 },
      { title: '400 g', sku: 'BOU-AMB-400', optionValues: ['400 g'], eur: 4400, usd: 4900, stock: 35 },
    ],
  },
  {
    handle: 'bougie-figue',
    title: 'Bougie Figue Noire',
    subtitle: 'Cire de soja, 220 g, 50 h',
    description:
      "Feuille de figuier, lait d'amande, un fond boisé. Plus verte et plus fraîche que l'Ambre — celle qu'on allume l'après-midi plutôt que le soir.",
    material: 'Cire de soja',
    images: ['bougie-figue-1.jpg', 'bougie-figue-2.jpg'],
    category: 'lumiere',
    variants: UNIQUE('BOU-FIG', 2900, 3400, 45),
  },

  // --- Décoration ------------------------------------------------------------
  {
    handle: 'miroir-halo',
    title: 'Miroir rond Halo',
    subtitle: 'Cadre bois, Ø 60 cm',
    description:
      "Un cercle de bois clair, un miroir sans biseau, une attache déjà montée au dos. Il agrandit une entrée étroite mieux que n'importe quel tableau.",
    material: 'Chêne, verre',
    images: ['miroir-halo-1.jpg'],
    collection: 'les-essentiels',
    category: 'deco',
    variants: UNIQUE('MIR-HAL', 11900, 13500, 10),
  },
  {
    handle: 'cadre-gallery',
    title: 'Cadre Gallery',
    subtitle: 'Bois massif, verre antireflet',
    description:
      "Une baguette fine de 12 mm, un passe-partout blanc cassé, un verre antireflet qui laisse voir l'image et pas la fenêtre d'en face. Se pose ou s'accroche, portrait ou paysage.",
    material: 'Bois massif',
    images: ['cadre-gallery-1.jpg', 'cadre-gallery-2.jpg'],
    category: 'deco',
    options: [{ title: 'Format', values: ['A4', 'A3'] }],
    variants: [
      { title: 'A4', sku: 'CAD-GAL-A4', optionValues: ['A4'], eur: 3200, usd: 3700, stock: 34 },
      { title: 'A3', sku: 'CAD-GAL-A3', optionValues: ['A3'], eur: 4500, usd: 5200, stock: 21 },
    ],
  },
  {
    handle: 'vase-col-etroit',
    title: 'Vase col étroit',
    subtitle: 'Verre soufflé, 24 cm',
    description:
      "Un col resserré qui tient trois tiges bien droites — c'est tout ce qu'il faut. Soufflé bouche, donc chaque pièce a ses propres bulles.",
    material: 'Verre soufflé',
    images: ['vase-col-etroit-1.jpg', 'vase-col-etroit-2.jpg'],
    collection: 'edition-limitee',
    category: 'deco',
    variants: UNIQUE('VAS-COL', 3900, 4500, 26),
  },
  {
    handle: 'panier-osier',
    title: 'Panier tressé Osier',
    subtitle: 'Fait main, Ø 38 cm',
    description:
      "Tressé à la main, sans colle ni agrafe. Il range le linge, le bois ou rien du tout, et il est assez beau pour rester en vue.",
    material: 'Osier',
    images: ['panier-osier-1.jpg', 'panier-osier-2.jpg'],
    category: 'deco',
    variants: UNIQUE('PAN-OSI', 5400, 6200, 15),
  },

  // --- Soin & textile --------------------------------------------------------
  {
    handle: 'plaid-tartan',
    title: 'Plaid Tartan',
    subtitle: 'Laine d\'agneau, 130 × 180 cm',
    description:
      "Un vrai tartan tissé en laine d'agneau, franges nouées à la main. Lourd sans être étouffant : celui qu'on garde sur le canapé de novembre à mars.",
    material: "Laine d'agneau",
    images: ['plaid-tartan-1.jpg'],
    collection: 'les-essentiels',
    category: 'soin',
    variants: UNIQUE('PLA-TAR', 8900, 9900, 12),
  },
  {
    handle: 'savon-avoine',
    title: "Savon Lait d'Avoine",
    subtitle: 'Saponifié à froid, 100 g',
    description:
      "Doux au point de convenir aux peaux qui tirent. Lait d'avoine, beurre de karité, aucune huile essentielle — donc rien qui pique.",
    material: 'Savon saponifié à froid',
    images: ['savon-avoine-1.jpg'],
    category: 'soin',
    variants: UNIQUE('SAV-AVO', 900, 1100, 80),
  },
  {
    handle: 'savon-argile',
    title: 'Savon Argile Rose',
    subtitle: 'Saponifié à froid, 100 g',
    description:
      "L'argile rose adoucit et matifie. Parfum géranium léger, mousse dense, il tient un bon mois sous la douche si on le laisse sécher entre deux.",
    material: 'Savon saponifié à froid',
    images: ['savon-argile-1.jpg'],
    category: 'soin',
    variants: UNIQUE('SAV-ARG', 900, 1100, 80),
  },
  {
    handle: 'savon-charbon',
    title: 'Savon Charbon Actif',
    subtitle: 'Saponifié à froid, 100 g',
    description:
      "Noir profond, purifiant, avec une pointe d'eucalyptus. Le seul des trois qu'on remarque de loin dans la salle de bain.",
    material: 'Savon saponifié à froid',
    images: ['savon-charbon-1.jpg'],
    collection: 'edition-limitee',
    category: 'soin',
    variants: UNIQUE('SAV-CHA', 1000, 1200, 65),
  },
  {
    handle: 'carnet-relie',
    title: 'Carnet relié',
    subtitle: 'Cousu fil, 192 pages, 90 g/m²',
    description:
      "Une reliure cousue qui s'ouvre à plat, un papier de 90 g qui ne laisse pas traverser l'encre, un signet et une pochette au dos. Rien de plus.",
    material: 'Papier 90 g/m²',
    images: ['carnet-relie-1.jpg', 'carnet-relie-2.jpg'],
    collection: 'les-essentiels',
    category: 'soin',
    options: [{ title: 'Réglure', values: ['Ligné', 'Pointillé'] }],
    variants: [
      { title: 'Ligné', sku: 'CAR-REL-LIG', optionValues: ['Ligné'], eur: 1800, usd: 2100, stock: 50 },
      { title: 'Pointillé', sku: 'CAR-REL-POI', optionValues: ['Pointillé'], eur: 1800, usd: 2100, stock: 50 },
    ],
  },
]
