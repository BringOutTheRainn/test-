// The Build tab: buy amount, the strip of ready upgrades and the generator list.

import { GENERATORS } from '../data/generators.js';
import { UPGRADE_BY_ID } from '../data/upgrades.js';
import { availableUpgrades, buyGenerator, buyUpgrade, generatorPrice, generatorRevealed, generatorVisible, maxAffordable, upgradePrice } from '../core/economy.js';
import { fmt, fmtPercent, fmtRate } from '../core/format.js';
import { sfxBuy, sfxDenied, sfxUpgrade } from './audio.js';
import type { BuyAmount, Ctx, Panel } from './ctx.js';
import { $, esc, setText, toast, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { haptic } from './platform.js';

interface Row {
  el: HTMLElement;
  name: HTMLElement;
  price: HTMLElement;
  sub: HTMLElement;
  owned: HTMLElement;
  qty: HTMLElement;
}

export class BuildPanel implements Panel {
  private rows: Row[] = [];
  private strip: HTMLElement;
  private stripKey = '';

  constructor(private root: HTMLElement, ctx: Ctx) {
    root.innerHTML = `
      <div class="buy-row" role="group" aria-label="Buy amount">
        <span class="buy-label">Buy</span>
        ${(['1', '10', '100', 'max'] as const).map((a) => `<button class="chip" data-amt="${a}">${a === 'max' ? 'Max' : 'x' + a}</button>`).join('')}
      </div>
      <div class="upg-strip" id="upg-strip" aria-label="Ready upgrades"></div>
      <div class="gen-list" id="gen-list"></div>`;
    this.strip = $('#upg-strip', root);
    const list = $('#gen-list', root);
    GENERATORS.forEach((g, i) => {
      const el = document.createElement('button');
      el.className = 'gen';
      el.dataset.gen = String(i);
      el.innerHTML = `
        <div class="gen-ico">${icon(g.id)}</div>
        <div class="gen-main">
          <div class="gen-name"></div>
          <div class="gen-price"><span class="sd-dot"></span><span class="p"></span><span class="q"></span></div>
          <div class="gen-sub"></div>
        </div>
        <div class="gen-owned"></div>`;
      list.appendChild(el);
      this.rows.push({ el, name: $('.gen-name', el), price: $('.p', el), qty: $('.q', el), sub: $('.gen-sub', el), owned: $('.gen-owned', el) });
    });

    root.querySelector('.buy-row')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-amt]');
      if (!b) return;
      const v = b.dataset.amt!;
      ctx.buyAmount = (v === 'max' ? 'max' : Number(v)) as BuyAmount;
      this.refresh(ctx);
    });

    const buyRow = (el: HTMLElement): boolean => {
      const gen = Number(el.dataset.gen);
      if (!generatorVisible(ctx.s, gen)) return false;
      const n = buyGenerator(ctx.s, ctx.d, gen, ctx.buyAmount);
      if (n <= 0) return false;
      sfxBuy();
      haptic('light');
      el.classList.remove('bought');
      void el.offsetWidth;
      el.classList.add('bought');
      ctx.recalc();
      this.refresh(ctx);
      return true;
    };

    // Tap to buy; press and hold to keep buying.
    let holdTimer = 0;
    let repeated = false;
    const stopHold = (): void => {
      clearTimeout(holdTimer);
      clearInterval(holdTimer);
      holdTimer = 0;
    };
    list.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.gen');
      if (!el) return;
      repeated = false;
      stopHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = window.setInterval(() => {
          repeated = true;
          if (!buyRow(el)) stopHold();
        }, 110);
      }, 420);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) list.addEventListener(ev, stopHold);
    list.addEventListener('scroll', stopHold, { passive: true });
    list.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.gen');
      if (!el) return;
      if (repeated) {
        repeated = false;
        return;
      }
      if (!buyRow(el)) sfxDenied();
    });

    this.strip.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-upg]');
      if (!el) return;
      const id = el.dataset.upg!;
      const u = UPGRADE_BY_ID[id];
      if (buyUpgrade(ctx.s, ctx.d, id)) {
        sfxUpgrade();
        haptic('medium');
        toast(`<div class="t-ico">${icon(u.icon)}</div><div><b>${esc(u.name)}</b><br>${esc(u.desc)}</div>`, 'good');
        ctx.recalc();
        ctx.dirty();
      } else {
        sfxDenied();
        toast(`<div class="t-ico">${icon(u.icon)}</div><div><b>${esc(u.name)}</b> · ${fmt(upgradePrice(ctx.d, u))}<br>${esc(u.desc)}</div>`);
      }
    });
  }

  refresh(ctx: Ctx): void {
    const { s, d } = ctx;
    this.root.querySelectorAll<HTMLElement>('[data-amt]').forEach((b) => {
      toggleClass(b, 'on', String(ctx.buyAmount) === b.dataset.amt);
    });

    // Upgrade strip: every unlocked upgrade, cheapest first.
    const ups = d.noUpgrades ? [] : availableUpgrades(s).slice(0, 24);
    const key = ups.map((u) => u.id).join(',') + d.noUpgrades;
    if (key !== this.stripKey) {
      this.stripKey = key;
      this.strip.innerHTML = d.noUpgrades ? '<div class="strip-empty">No upgrades in this anomaly</div>' : ups.length
        ? ups.map((u) => `<button class="upg-chip" data-upg="${u.id}" aria-label="${esc(u.name)}">${icon(u.icon)}<span class="tier">${u.group === 'generator' ? romans(u.tier + 1) : ''}</span></button>`).join('')
        : '<div class="strip-empty">Upgrades appear here as your empire grows</div>';
    }
    this.strip.querySelectorAll<HTMLElement>('[data-upg]').forEach((el) => {
      const u = UPGRADE_BY_ID[el.dataset.upg!];
      toggleClass(el, 'afford', upgradePrice(d, u) <= s.stardust);
    });

    let shownNext = false;
    this.rows.forEach((row, i) => {
      const visible = generatorVisible(s, i);
      // Show one locked teaser row below the last visible generator.
      const teaser = !visible && !shownNext && i > 0 && generatorVisible(s, i - 1);
      if (!visible && !teaser) {
        toggleClass(row.el, 'gone', true);
        return;
      }
      if (teaser) shownNext = true;
      toggleClass(row.el, 'gone', false);
      const locked = i > d.maxGen;
      toggleClass(row.el, 'locked', locked);
      const revealed = visible && generatorRevealed(s, i);
      toggleClass(row.el, 'mystery', !revealed);
      const g = GENERATORS[i];
      setText(row.name, revealed ? g.name : '???');
      const amount = ctx.buyAmount === 'max' ? Math.max(1, maxAffordable(s, d, i)) : ctx.buyAmount;
      const price = generatorPrice(s, d, i, amount);
      setText(row.price, fmt(price));
      setText(row.qty, amount > 1 ? ` x${amount}` : '');
      toggleClass(row.el, 'afford', visible && !locked && price <= s.stardust);
      const owned = s.generators[i];
      setText(row.owned, owned ? String(owned) : '');
      if (locked) {
        setText(row.sub, 'Cannot be built in this anomaly');
      } else if (!revealed) {
        setText(row.sub, teaser ? 'Buy the one above to discover' : 'Earn more Stardust to discover');
      } else if (owned) {
        const each = d.genSps[i] / owned;
        const share = d.baseSps > 0 ? d.genSps[i] / d.baseSps : 0;
        setText(row.sub, `${fmtRate(each)}/s each · ${fmtPercent(share)} of total`);
      } else {
        setText(row.sub, g.flavor);
      }
    });
  }
}

function romans(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
