// In-app purchases. The ids must match the products created in Google Play
// Console (see docs/RELEASE.md). Prices here are only shown when the store
// cannot report the local price (in the browser build, or offline).

export type ProductKind = 'consumable' | 'nonconsumable';

export interface Product {
  id: string;
  kind: ProductKind;
  name: string;
  desc: string;
  /** Fallback price label in US dollars. */
  price: string;
  icon: string;
}

export interface Skin {
  id: string;
  name: string;
  /** Canvas filter applied to the celestial body. */
  filter: string;
  /** Swatch colours for the shop tile. */
  swatch: [string, string];
  /** Earned, not sold (the Star Pass skin). */
  exclusive?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'lava', name: 'Lava World', filter: 'hue-rotate(-35deg) saturate(1.8) contrast(1.1)', swatch: ['#ffb347', '#b3200f'] },
  { id: 'ice', name: 'Frost Giant', filter: 'hue-rotate(170deg) saturate(.75) brightness(1.15)', swatch: ['#e8fbff', '#5aa8d8'] },
  { id: 'neon', name: 'Neon Synthwave', filter: 'hue-rotate(255deg) saturate(2.4) contrast(1.2)', swatch: ['#ff5ef0', '#3a1aff'] },
  { id: 'gold', name: 'Golden Relic', filter: 'sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.08)', swatch: ['#fff2a8', '#b8860b'] },
  { id: 'aurora', name: 'Aurora', filter: 'hue-rotate(110deg) saturate(1.9) brightness(1.1) contrast(1.05)', swatch: ['#9dffd8', '#3a5cff'], exclusive: true },
];

export const PRODUCTS: Product[] = [
  { id: 'supporter_pack', kind: 'nonconsumable', name: 'Supporter Pack', price: '$3.99', icon: 'trophy',
    desc: 'No break ads or banners, ever. Optional reward ads stay. Production x2 forever.' },
  { id: 'starter_pack', kind: 'nonconsumable', name: 'Starter Pack', price: '$1.99', icon: 'gift',
    desc: '10 Quasar Crystals, 4 hours of production and +10% production forever. Once only.' },
  { id: 'crystals_5', kind: 'consumable', name: 'Handful of Crystals', price: '$0.99', icon: 'crystal', desc: '5 Quasar Crystals.' },
  { id: 'crystals_30', kind: 'consumable', name: 'Crystal Cluster', price: '$4.99', icon: 'crystal', desc: '30 Quasar Crystals.' },
  { id: 'crystals_80', kind: 'consumable', name: 'Crystal Geode', price: '$9.99', icon: 'crystal', desc: '80 Quasar Crystals. Best value.' },
  { id: 'event_pass', kind: 'consumable', name: 'Event Pass', price: '$2.99', icon: 'rift',
    desc: 'This weekend only: double Flux and a Platinum badge worth 12 hours of production and 10 crystals.' },
  { id: 'vault_open', kind: 'consumable', name: 'Open the Stardust Vault', price: '$2.99', icon: 'darkMatter',
    desc: 'Pays out everything the vault has saved up.' },
  { id: 'star_pass', kind: 'consumable', name: 'Star Pass Premium', price: '$4.99', icon: 'trophy',
    desc: 'This season: a second reward track with double Stardust, 20 crystals, 2 Contract Medals and the Aurora skin.' },
  ...SKINS.filter((k) => !k.exclusive).map((k): Product => ({ id: `skin_${k.id}`, kind: 'nonconsumable', name: k.name, price: '$0.99', icon: 'cosmos', desc: 'A new look for your celestial body.' })),
];

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
