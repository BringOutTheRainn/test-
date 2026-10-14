// In-app purchases and the Shop screen. In the app this drives Google Play
// Billing through cordova-plugin-purchase (the global CdvPurchase). In a
// browser it shows a test checkout so every product can be tried without a
// store account; nothing is charged there.

import { PRODUCTS, PRODUCT_BY_ID, SKINS, type Product } from '../data/store.js';
import { crystalsUnlocked } from '../core/crystals.js';
import { currentEvent, eventActive, eventTimeLeft } from '../core/event.js';
import { currentPass, seasonTimeLeft } from '../core/pass.js';
import { fmt, fmtTime } from '../core/format.js';
import {
  STARTER_PCT, SUPPORTER_MULT, VAULT_CAP_HOURS, VAULT_HOURS_PER_CRYSTAL, VAULT_RATE,
  canBuy, fillVault, grant, owns, setSkin, starterOfferLeft, vaultValue,
} from '../core/shop.js';
import { sfxAchievement } from './audio.js';
import type { Ctx } from './ctx.js';
import { esc, openModal, toast } from './dom.js';
import { icon } from './icons.js';
import { haptic, isNative } from './platform.js';
import { setBanner } from './ads.js';

// The parts of cordova-plugin-purchase (v13) used here.
interface CdvOffer { order(): Promise<unknown> }
interface CdvProduct { id: string; owned: boolean; pricing?: { price: string }; getOffer(): CdvOffer | undefined }
interface CdvTransaction { products: Array<{ id: string }>; finish(): Promise<void> }
interface CdvWhen {
  approved(cb: (t: CdvTransaction) => void): CdvWhen;
  productUpdated(cb: (p: CdvProduct) => void): CdvWhen;
}
interface CdvStore {
  register(p: Array<{ id: string; type: string; platform: string }>): void;
  when(): CdvWhen;
  initialize(platforms: string[]): Promise<unknown>;
  get(id: string, platform?: string): CdvProduct | undefined;
  restorePurchases(): Promise<unknown>;
  error(cb: (e: { message: string; code?: number }) => void): void;
}
interface CdvGlobal {
  store: CdvStore;
  ProductType: { CONSUMABLE: string; NON_CONSUMABLE: string };
  Platform: { GOOGLE_PLAY: string; APPLE_APPSTORE: string };
}

function cdv(): CdvGlobal | undefined {
  return (window as unknown as { CdvPurchase?: CdvGlobal }).CdvPurchase;
}

function platformId(c: CdvGlobal): string {
  const p = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  return p === 'ios' ? c.Platform.APPLE_APPSTORE : c.Platform.GOOGLE_PLAY;
}

let appCtx: Ctx | null = null;
let nativeReady = false;
/** Resolves the purchase the player is waiting on, by product id. */
const waiting = new Map<string, (ok: boolean) => void>();

/** Real store when running in the app with the billing plugin; test checkout otherwise. */
export function storeIsLive(): boolean {
  return isNative() && nativeReady;
}

export function storeAvailable(): boolean {
  return !isNative() || nativeReady;
}

/** Local price from the store when known, else the US price from the catalogue. */
export function productPrice(id: string): string {
  const c = cdv();
  if (c && nativeReady) {
    const p = c.store.get(id, platformId(c));
    if (p?.pricing?.price) return p.pricing.price;
  }
  return PRODUCT_BY_ID[id]?.price ?? '';
}

function applyGrant(id: string): void {
  const ctx = appCtx;
  if (!ctx) return;
  const g = grant(ctx.s, ctx.d, id);
  if (!g) return;
  if (id === 'supporter_pack') void setBanner(false);
  if (id.startsWith('skin_')) ctx.sky.setSkin(ctx.s.skin);
  ctx.recalc();
  ctx.dirty();
  ctx.save();
  sfxAchievement();
  haptic('heavy');
  const p = PRODUCT_BY_ID[id];
  const parts = [g.stardust ? `+${fmt(g.stardust)} Stardust` : '', g.crystals ? `+${g.crystals} crystals` : ''].filter(Boolean).join(' · ');
  toast(`<div class="t-ico">${icon(p.icon)}</div><div><b>${esc(p.name)}</b><br>${esc(g.text)}${parts ? `<br>${parts}` : ''}</div>`, 'good', 6000);
}

/** Connects to the store once at start-up. Safe to call in a browser. */
export async function initStore(ctx: Ctx): Promise<void> {
  appCtx = ctx;
  const c = cdv();
  if (!isNative() || !c) return;
  const platform = platformId(c);
  try {
    c.store.register(PRODUCTS.map((p) => ({
      id: p.id,
      type: p.kind === 'consumable' ? c.ProductType.CONSUMABLE : c.ProductType.NON_CONSUMABLE,
      platform,
    })));
    c.store.when()
      .approved((t) => {
        // Grant first, then finish, so a crash in between replays the purchase
        // on the next launch instead of losing it.
        for (const p of t.products) {
          applyGrant(p.id);
          waiting.get(p.id)?.(true);
          waiting.delete(p.id);
        }
        void t.finish();
      })
      .productUpdated((p) => {
        // Owned one-time products (bought on another device, or restored).
        if (p.owned && PRODUCT_BY_ID[p.id]?.kind === 'nonconsumable') applyGrant(p.id);
      });
    c.store.error((e) => console.warn('Store error', e.code, e.message));
    await c.store.initialize([platform]);
    nativeReady = true;
  } catch (e) {
    console.warn('Store unavailable', e);
  }
}

/** Buys a product. Resolves true once it is granted. */
export function buyProduct(ctx: Ctx, id: string): Promise<boolean> {
  appCtx = ctx;
  const p = PRODUCT_BY_ID[id];
  if (!p || !canBuy(ctx.s, id)) return Promise.resolve(false);
  const c = cdv();
  if (isNative()) {
    if (!c || !nativeReady) {
      toast('The store is not available right now. Check your connection and try again.', 'bad');
      return Promise.resolve(false);
    }
    const offer = c.store.get(id, platformId(c))?.getOffer();
    if (!offer) {
      toast('This item is not available in your store yet.', 'bad');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      // order() resolves with an error when the player cancels; approval comes through initStore.
      void offer.order().then((err) => {
        if (err && waiting.has(id)) {
          waiting.delete(id);
          resolve(false);
        }
      });
    });
  }
  return testCheckout(p).then((ok) => {
    if (ok) applyGrant(id);
    return ok;
  });
}

function testCheckout(p: Product): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    openModal({
      title: 'Checkout',
      body: `<div class="fake-ad"><div class="fake-ad-tag">Test purchase</div>
        <p><b>${esc(p.name)}</b> · ${esc(p.price)}</p><p class="dim small">${esc(p.desc)}</p>
        <p class="dim small">In the app this opens Google Play. Here nothing is charged.</p></div>`,
      onClose: () => finish(false),
      buttons: [
        { label: 'Cancel', kind: 'plain', onClick: () => finish(false) },
        { label: `Buy ${p.price}`, kind: 'primary', onClick: () => finish(true) },
      ],
    });
  });
}

export async function restorePurchases(): Promise<void> {
  const c = cdv();
  if (!c || !nativeReady) {
    toast('The store is not available right now.', 'bad');
    return;
  }
  await c.store.restorePurchases();
  toast('Purchases restored.', 'good');
}

// ------------------------------------------------------------------ Shop

function buyButton(ctx: Ctx, id: string, label?: string): string {
  const ok = canBuy(ctx.s, id);
  return `<button class="btn ${ok ? 'btn-primary' : 'btn-plain'} shop-buy" data-buy="${id}" ${ok ? '' : 'disabled'}>${esc(label ?? productPrice(id))}</button>`;
}

export function openShop(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const { s, d } = ctx;
    const now = Date.now();
    fillVault(s, now);
    const parts: string[] = [];

    const starterLeft = starterOfferLeft(s, now);
    if (starterLeft > 0) {
      parts.push(`<div class="shop-card shop-feature">
        <div class="shop-kicker">New player offer · ends in ${fmtTime(starterLeft / 1000)}</div>
        <div class="shop-row">${icon('gift')}<div class="shop-main"><b>Starter Pack</b><span>10 Quasar Crystals, 4 hours of production and +${STARTER_PCT * 100}% production forever.</span></div>${buyButton(ctx, 'starter_pack')}</div>
      </div>`);
    }

    parts.push(`<div class="shop-card${owns(s, 'supporter_pack') ? ' owned' : ''}">
      <div class="shop-row">${icon('trophy')}<div class="shop-main"><b>Supporter Pack</b><span>No break ads or banners, ever. Production x${SUPPORTER_MULT} forever. Optional reward ads stay for their bonuses.</span></div>
      ${owns(s, 'supporter_pack') ? '<span class="shop-owned">Owned</span>' : buyButton(ctx, 'supporter_pack')}</div></div>`);

    const v = vaultValue(s, d);
    parts.push(`<div class="shop-card">
      <div class="shop-row">${icon('darkMatter')}<div class="shop-main"><b>Stardust Vault</b><span>Saves ${VAULT_RATE * 60} minutes of production every hour, even while you are away, up to ${VAULT_CAP_HOURS} hours.${crystalsUnlocked(s) ? ` Plus a crystal for every ${VAULT_HOURS_PER_CRYSTAL} hours saved.` : ''}</span></div></div>
      <div class="bar"><div class="bar-fill vault-fill" style="width:${(s.vaultHours / VAULT_CAP_HOURS) * 100}%"></div></div>
      <div class="shop-row shop-sub"><span class="dim small">${s.vaultHours.toFixed(1)} of ${VAULT_CAP_HOURS} hours saved · worth ${fmt(v.stardust)} Stardust${v.crystals ? ` and ${v.crystals} crystal${v.crystals === 1 ? '' : 's'}` : ''}</span>
      ${buyButton(ctx, 'vault_open', s.vaultHours >= 1 ? `Open ${productPrice('vault_open')}` : 'Filling')}</div></div>`);

    const pass = currentPass(s, now);
    parts.push(`<div class="shop-card">
      <div class="shop-row">${icon('trophy')}<div class="shop-main"><b>Star Pass Premium</b><span>This season (ends in ${fmtTime(seasonTimeLeft(now) / 1000)}): a second reward track with double Stardust, 20 crystals, 2 Contract Medals and the Aurora skin. Rewards for tiers you already reached are paid at once.</span></div>
      ${pass.premium ? '<span class="shop-owned">Active</span>' : buyButton(ctx, 'star_pass')}</div></div>`);

    const e = currentEvent(s, now);
    parts.push(`<div class="shop-card">
      <div class="shop-row">${icon('rift')}<div class="shop-main"><b>Event Pass</b><span>${e ? 'This weekend: double Flux and a Platinum badge worth 12 hours of production and 10 crystals.' : `Opens with the next weekend event${eventActive(now) ? '' : `, in ${fmtTime(eventTimeLeft(now) / 1000)}`}.`}</span></div>
      ${e?.pass ? '<span class="shop-owned">Active</span>' : buyButton(ctx, 'event_pass')}</div></div>`);

    const packs = ['crystals_5', 'crystals_30', 'crystals_80'].map((id) => {
      const p = PRODUCT_BY_ID[id];
      return `<div class="shop-pack">${icon('crystal')}<b>${esc(p.desc.split(' ')[0])}</b><span class="dim small">${esc(p.name)}</span>${buyButton(ctx, id)}</div>`;
    }).join('');
    parts.push(`<div class="shop-card"><div class="shop-head"><b>Quasar Crystals</b>${crystalsUnlocked(s) ? `<span class="dim small">You have ${s.crystals}</span>` : '<span class="dim small">Unlock at 1B lifetime Stardust</span>'}</div>
      <div class="shop-packs">${packs}</div></div>`);

    const skins = [{ id: 'default', name: 'Classic', swatch: ['#a99a8a', '#3e5fa8'] as [string, string] }, ...SKINS].map((k) => {
      const have = k.id === 'default' || owns(s, `skin_${k.id}`);
      const using = s.skin === k.id;
      return `<div class="shop-skin${using ? ' using' : ''}"><span class="skin-swatch" style="background:radial-gradient(circle at 35% 30%, ${k.swatch[0]}, ${k.swatch[1]})"></span>
        <b>${esc(k.name)}</b>${using ? '<span class="shop-owned">In use</span>' : have ? `<button class="btn btn-plain shop-buy" data-skin="${k.id}">Use</button>` : 'exclusive' in k && k.exclusive ? '<span class="dim small shop-owned-note">Star Pass reward</span>' : buyButton(ctx, `skin_${k.id}`)}</div>`;
    }).join('');
    parts.push(`<div class="shop-card"><div class="shop-head"><b>Planet skins</b><span class="dim small">Looks only</span></div><div class="shop-skins">${skins}</div></div>`);

    if (isNative()) parts.push('<button class="btn btn-plain btn-wide" data-restore="1">Restore purchases</button>');
    if (!storeIsLive()) parts.push(`<p class="dim small">${isNative() ? 'The store could not be reached, so prices may be out of date.' : 'Browser preview: purchases here are tests and nothing is charged.'}</p>`);
    return parts.join('');
  };
  const el = openModal({ title: 'Shop', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy],[data-skin],[data-restore]');
    if (!t || t.disabled || busy) return;
    if (t.dataset.skin) {
      if (setSkin(ctx.s, t.dataset.skin)) {
        ctx.sky.setSkin(ctx.s.skin);
        haptic('light');
        ctx.save();
      }
      redraw();
      return;
    }
    busy = true;
    const done = (): void => { busy = false; redraw(); onChange(); };
    if (t.dataset.restore) void restorePurchases().then(done);
    else void buyProduct(ctx, t.dataset.buy!).then(done);
  });
}

/** One-time pop-up for the starter offer, after the player has settled in. */
export function maybeOfferStarter(ctx: Ctx): void {
  const s = ctx.s;
  if (s.starterOffered || s.playSeconds < 20 * 60 || starterOfferLeft(s) <= 0 || !storeAvailable()) return;
  s.starterOffered = true;
  ctx.save();
  openModal({
    title: 'Starter Pack',
    body: `<div class="shop-offer">${icon('gift')}<p><b>A one-time offer for new commanders.</b></p>
      <p>10 Quasar Crystals, 4 hours of production and +${STARTER_PCT * 100}% production forever, for ${esc(productPrice('starter_pack'))}.</p>
      <p class="dim small">Available for ${fmtTime(starterOfferLeft(s) / 1000)} more in the Shop.</p></div>`,
    buttons: [
      { label: 'Not now', kind: 'plain' },
      { label: `Get it ${productPrice('starter_pack')}`, kind: 'primary', onClick: () => { void buyProduct(ctx, 'starter_pack'); } },
    ],
  });
}
