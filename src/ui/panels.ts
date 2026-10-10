// The Upgrades, Trophies, Cosmos and Probes tabs.

import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../data/achievements.js';
import { ANOMALIES, ANOMALY_BY_ID } from '../data/anomalies.js';
import { abandonAnomaly, anomaliesUnlocked, enterAnomaly } from '../core/anomalies.js';
import { COSMIC, COSMIC_BY_ID } from '../data/cosmic.js';
import { DESTINATIONS, DESTINATION_BY_ID, RELICS } from '../data/expeditions.js';
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades.js';
import { availableUpgrades, buyCosmic, buyUpgrade, cosmicAvailable, upgradePrice } from '../core/economy.js';
import { collectExpeditions, expeditionDurationMs, expeditionReward, freeSlots, relicName, startExpedition } from '../core/expeditions.js';
import { fmt, fmtPercent, fmtTime } from '../core/format.js';
import { canCollapse, collapse, DM_SCALE, earningsForNextDarkMatter, pendingDarkMatter } from '../core/prestige.js';
import { achievementCount, darkMatterAvailable } from '../core/state.js';
import { sfxAchievement, sfxCollapse, sfxDenied, sfxUpgrade } from './audio.js';
import type { Ctx, Panel } from './ctx.js';
import { $, confirmModal, esc, openModal, setText, toast, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { haptic } from './platform.js';
import { stageFor, STAGES } from './sky.js';

// ------------------------------------------------------------------ Upgrades

export class UpgradesPanel implements Panel {
  private key = '';
  private list: HTMLElement;
  private owned: HTMLElement;
  private ownedTitle: HTMLElement;

  constructor(private root: HTMLElement, ctx: Ctx) {
    root.innerHTML = `
      <h3 class="section-title">Available</h3>
      <div class="upg-list" id="upg-list"></div>
      <h3 class="section-title" id="upg-owned-title">Bought</h3>
      <div class="upg-owned" id="upg-owned"></div>`;
    this.list = $('#upg-list', root);
    this.owned = $('#upg-owned', root);
    this.ownedTitle = $('#upg-owned-title', root);
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const buy = t.closest<HTMLElement>('[data-buy]');
      if (buy) {
        const u = UPGRADE_BY_ID[buy.dataset.buy!];
        if (buyUpgrade(ctx.s, ctx.d, u.id)) {
          sfxUpgrade();
          haptic('medium');
          ctx.recalc();
          ctx.dirty();
        } else sfxDenied();
        return;
      }
      const own = t.closest<HTMLElement>('[data-owned]');
      if (own) {
        const u = UPGRADE_BY_ID[own.dataset.owned!];
        toast(`<div class="t-ico">${icon(u.icon)}</div><div><b>${esc(u.name)}</b><br>${esc(u.desc)}</div>`);
      }
    });
  }

  refresh(ctx: Ctx): void {
    const { s, d } = ctx;
    const ups = d.noUpgrades ? [] : availableUpgrades(s);
    const key = ups.map((u) => u.id).join(',') + '|' + Object.keys(s.upgrades).length + d.noUpgrades;
    if (key !== this.key) {
      this.key = key;
      this.list.innerHTML = ups.length
        ? ups.map((u) => `
          <div class="upg-card" data-id="${u.id}">
            <div class="upg-ico">${icon(u.icon)}</div>
            <div class="upg-text"><div class="upg-name">${esc(u.name)}</div><div class="upg-desc">${esc(u.desc)}</div></div>
            <button class="btn btn-buy" data-buy="${u.id}"><span class="sd-dot"></span>${fmt(upgradePrice(d, u))}</button>
          </div>`).join('')
        : `<p class="empty">${d.noUpgrades ? 'Upgrades cannot be bought in this anomaly.' : 'No upgrades right now. Buy more generators to unlock new ones.'}</p>`;
      const bought = UPGRADES.filter((u) => s.upgrades[u.id]);
      setText(this.ownedTitle, `Bought (${bought.length} of ${UPGRADES.length})`);
      this.owned.innerHTML = bought.map((u) => `<button class="owned-chip" data-owned="${u.id}" aria-label="${esc(u.name)}">${icon(u.icon)}</button>`).join('');
    }
    this.list.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) => {
      toggleClass(b, 'afford', upgradePrice(d, UPGRADE_BY_ID[b.dataset.buy!]) <= s.stardust);
    });
  }
}

// ------------------------------------------------------------------ Trophies

export class TrophiesPanel implements Panel {
  private key = '';
  private grid: HTMLElement;
  private summary: HTMLElement;

  constructor(private root: HTMLElement, ctx: Ctx) {
    root.innerHTML = `<div class="trophy-summary" id="trophy-summary"></div><div class="trophy-grid" id="trophy-grid"></div>`;
    this.grid = $('#trophy-grid', root);
    this.summary = $('#trophy-summary', root);
    this.grid.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ach]');
      if (!el) return;
      const a = ACHIEVEMENT_BY_ID[el.dataset.ach!];
      const got = a.id in ctx.s.achievements;
      const name = got || !a.hidden ? a.name : '???';
      const desc = got || !a.hidden ? a.desc : 'A secret achievement.';
      toast(`<div class="t-ico">${icon(got ? 'trophy' : 'lock')}</div><div><b>${esc(name)}</b>${got ? ' ✓' : ''}<br>${esc(desc)}</div>`, got ? 'trophy' : 'info');
    });
  }

  refresh(ctx: Ctx): void {
    const s = ctx.s;
    const n = achievementCount(s);
    const key = String(n);
    if (key === this.key) return;
    this.key = key;
    const per = ctx.d ? achievementBonus(ctx) : 0.01;
    this.summary.innerHTML = `<b>${n}</b> of ${ACHIEVEMENTS.length} achievements · <span class="good">+${fmtPercent(per * n)}</span> production`;
    this.grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const got = a.id in s.achievements;
      return `<button class="trophy${got ? ' got' : ''}${a.hidden && !got ? ' secret' : ''}" data-ach="${a.id}" aria-label="${esc(got || !a.hidden ? a.name : 'Secret')}">${icon(got ? 'trophy' : 'lock')}</button>`;
    }).join('');
  }
}

function achievementBonus(ctx: Ctx): number {
  return ctx.s.cosmic.map ? 0.015 : 0.01;
}

// ------------------------------------------------------------------ Cosmos

export const COSMOS_UNLOCK = DM_SCALE;

export function cosmosUnlocked(ctx: Ctx): boolean {
  return ctx.s.earnedAll >= COSMOS_UNLOCK || ctx.s.collapses > 0;
}

export class CosmosPanel implements Panel {
  private built = false;
  private treeKey = '';

  constructor(private root: HTMLElement, private ctx: Ctx) {
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#btn-collapse')) this.askCollapse();
      const node = t.closest<HTMLElement>('[data-cosmic]');
      if (node) this.showCosmic(node.dataset.cosmic!);
      const enter = t.closest<HTMLElement>('[data-anomaly]');
      if (enter) this.askAnomaly(enter.dataset.anomaly!);
      if (t.closest('#btn-abandon')) this.askAbandon();
    });
  }

  private build(): void {
    this.built = true;
    this.root.innerHTML = `
      <div class="dm-card">
        <div class="dm-ico">${icon('darkMatter')}</div>
        <div><div class="dm-amount" id="dm-amount"></div><div class="dm-sub" id="dm-sub"></div></div>
      </div>
      <div class="collapse-card">
        <div class="collapse-row"><span>Collapse now for</span><b id="dm-pending"></b></div>
        <div class="bar"><div class="bar-fill" id="dm-bar"></div></div>
        <div class="collapse-note" id="dm-next"></div>
        <button class="btn btn-cosmic btn-wide" id="btn-collapse">Collapse the Universe</button>
      </div>
      <div id="anomalies"></div>
      <h3 class="section-title">Cosmic upgrades</h3>
      <p class="hint-text">Bought with Dark Matter. Kept forever. Spending Dark Matter does not lower its production bonus.</p>
      <div class="tree" id="tree"></div>`;
  }

  refresh(ctx: Ctx): void {
    const { s, d } = ctx;
    if (!cosmosUnlocked(ctx)) {
      this.built = false;
      this.treeKey = '';
      const pct = Math.min(1, Math.log10(Math.max(1, s.earnedAll)) / Math.log10(COSMOS_UNLOCK));
      this.root.innerHTML = `
        <div class="locked-card">
          <div class="locked-ico">${icon('darkMatter')}</div>
          <h3>The Cosmos is sealed</h3>
          <p>Earn ${fmt(COSMOS_UNLOCK)} Stardust in total to learn how to collapse the universe and harvest Dark Matter.</p>
          <div class="bar"><div class="bar-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>
          <p class="dim">${fmt(s.earnedAll)} / ${fmt(COSMOS_UNLOCK)}</p>
        </div>`;
      return;
    }
    if (!this.built) this.build();
    const pending = pendingDarkMatter(s);
    setText($('#dm-amount', this.root), `${fmt(s.darkMatter)} Dark Matter`);
    const dmPct = (s.cosmic.resonance ? 0.03 : 0.02) + (s.cosmic.resonance2 ? 0.01 : 0);
    setText($('#dm-sub', this.root), `${fmt(darkMatterAvailable(s))} to spend · +${fmtPercent(dmPct * s.darkMatter)} production`);
    setText($('#dm-pending', this.root), `+${fmt(pending)} Dark Matter`);
    const nextAt = earningsForNextDarkMatter(s);
    const prevTotal = Math.pow(Math.cbrt(nextAt / DM_SCALE) - 1, 3) * DM_SCALE;
    const frac = Math.max(0, Math.min(1, (s.earnedAll - prevTotal) / (nextAt - prevTotal)));
    ($('#dm-bar', this.root) as HTMLElement).style.width = `${(frac * 100).toFixed(1)}%`;
    setText($('#dm-next', this.root), s.earnedAll < DM_SCALE
      ? `Your first Dark Matter forms at ${fmt(DM_SCALE)} lifetime Stardust (${fmt(s.earnedAll)} so far).`
      : `Next Dark Matter at ${fmt(nextAt)} lifetime Stardust.`);
    const btn = $('#btn-collapse', this.root) as HTMLButtonElement;
    btn.disabled = !canCollapse(s);

    const key = Object.keys(s.cosmic).join(',') + '|' + darkMatterAvailable(s) + '|' + s.anomaly + Object.keys(s.anomaliesDone).join(',');
    if (key !== this.treeKey) {
      this.treeKey = key;
      this.renderTree(ctx);
      this.renderAnomalies(ctx);
    }
    const a = s.anomaly ? ANOMALY_BY_ID[s.anomaly] : undefined;
    const bar = this.root.querySelector<HTMLElement>('#anomaly-bar');
    if (a && bar) bar.style.width = `${Math.min(100, (Math.log10(Math.max(1, s.earnedRun)) / Math.log10(a.goal)) * 100).toFixed(1)}%`;
    const prog = this.root.querySelector<HTMLElement>('#anomaly-progress');
    if (a && prog) setText(prog, `${fmt(s.earnedRun)} / ${fmt(a.goal)} Stardust`);
    void d;
  }

  private renderAnomalies(ctx: Ctx): void {
    const s = ctx.s;
    const root = $('#anomalies', this.root);
    if (!anomaliesUnlocked(s)) {
      root.innerHTML = '';
      return;
    }
    const done = Object.keys(s.anomaliesDone).length;
    root.innerHTML = `
      <h3 class="section-title">Anomalies · ${done} of ${ANOMALIES.length}</h3>
      <p class="hint-text">Twisted universes with one strange rule. Reach the goal inside one for a permanent reward. Entering collapses your universe and collects any pending Dark Matter.</p>
      <div class="anomalies">${ANOMALIES.map((a) => {
        const isDone = !!s.anomaliesDone[a.id];
        const active = s.anomaly === a.id;
        return `<div class="anomaly ${isDone ? 'done' : ''} ${active ? 'active' : ''}">
          <div class="anomaly-top"><b>${esc(a.name)}</b><span class="anomaly-goal">${isDone ? 'Complete' : `Goal ${fmt(a.goal)}`}</span></div>
          <div class="dim">${esc(a.rule)}</div>
          <div class="anomaly-reward">${esc(a.rewardText)}</div>
          ${active ? `<div class="bar"><div class="bar-fill" id="anomaly-bar"></div></div><div class="anomaly-row"><span class="dim small" id="anomaly-progress"></span><button class="btn btn-plain" id="btn-abandon">Leave</button></div>`
            : isDone ? '' : `<button class="btn btn-cosmic" data-anomaly="${a.id}" ${s.anomaly ? 'disabled' : ''}>Enter</button>`}
        </div>`;
      }).join('')}</div>`;
  }

  private askAnomaly(id: string): void {
    const ctx = this.ctx;
    const a = ANOMALY_BY_ID[id];
    const pending = pendingDarkMatter(ctx.s);
    confirmModal(`Enter ${a.name}?`,
      `<b>Rule:</b> ${esc(a.rule)}<br><b>Goal:</b> earn ${fmt(a.goal)} Stardust in this universe.<br><b>Reward:</b> ${esc(a.rewardText)}<br><br>Your current universe collapses${pending >= 1 ? ` and you collect <b class="dm">+${fmt(pending)} Dark Matter</b>` : ''}. You can leave the anomaly at any time.`,
      'Enter', () => {
        enterAnomaly(ctx.s, ctx.d, id);
        this.afterReset();
        toast(`<div class="t-ico">${icon('darkMatter')}</div><div><b>${esc(a.name)}</b><br>${esc(a.rule)}</div>`, 'comet', 5000);
      });
  }

  private askAbandon(): void {
    const ctx = this.ctx;
    confirmModal('Leave the anomaly?', 'Your universe collapses into a normal one. Progress towards this anomaly is lost, but pending Dark Matter is collected.', 'Leave', () => {
      abandonAnomaly(ctx.s, ctx.d);
      this.afterReset();
    }, true);
  }

  private afterReset(): void {
    const ctx = this.ctx;
    sfxCollapse();
    haptic('heavy');
    ctx.recalc();
    ctx.dirty();
    ctx.save();
    document.body.classList.add('collapsing');
    setTimeout(() => document.body.classList.remove('collapsing'), 1600);
    ctx.sky.setStage(0);
    ctx.showTab('build');
  }

  private renderTree(ctx: Ctx): void {
    const s = ctx.s;
    const cols = 5;
    const rows = Math.max(...COSMIC.map((c) => c.y)) + 1;
    const cell = 100 / cols;
    const rowH = 92;
    let lines = '';
    for (const c of COSMIC) {
      for (const r of c.requires) {
        const p = COSMIC_BY_ID[r];
        const on = s.cosmic[c.id] && s.cosmic[r];
        lines += `<line x1="${(p.x + 0.5) * cell}%" y1="${p.y * rowH + 36}" x2="${(c.x + 0.5) * cell}%" y2="${c.y * rowH + 36}" class="${on ? 'on' : ''}"/>`;
      }
    }
    const nodes = COSMIC.map((c) => {
      const owned = !!s.cosmic[c.id];
      const open = cosmicAvailable(s, c.id);
      const afford = open && darkMatterAvailable(s) >= c.cost;
      const cls = owned ? 'owned' : open ? (afford ? 'open afford' : 'open') : 'closed';
      return `<button class="node ${cls}" data-cosmic="${c.id}" style="left:${(c.x + 0.5) * cell}%;top:${c.y * rowH}px" aria-label="${esc(c.name)}">
        <span class="node-dot">${icon(owned ? 'darkMatter' : open ? 'darkMatter' : 'lock')}</span>
        <span class="node-name">${esc(c.name)}</span>
        ${owned ? '' : `<span class="node-cost">${fmt(c.cost)}</span>`}
      </button>`;
    }).join('');
    $('#tree', this.root).innerHTML = `<svg class="tree-lines" width="100%" height="${rows * rowH}">${lines}</svg>${nodes}`;
    ($('#tree', this.root) as HTMLElement).style.height = `${rows * rowH}px`;
  }

  private showCosmic(id: string): void {
    const ctx = this.ctx;
    const c = COSMIC_BY_ID[id];
    const owned = !!ctx.s.cosmic[id];
    const open = cosmicAvailable(ctx.s, id);
    const needs = c.requires.filter((r) => !ctx.s.cosmic[r]).map((r) => COSMIC_BY_ID[r].name);
    const body = `<div class="cosmic-detail"><div class="big-ico">${icon('darkMatter')}</div><p>${esc(c.desc)}</p>
      <p class="dim">${owned ? 'Owned.' : `Costs ${fmt(c.cost)} Dark Matter. You have ${fmt(darkMatterAvailable(ctx.s))}.`}</p>
      ${needs.length ? `<p class="dim">Needs: ${needs.map(esc).join(', ')}</p>` : ''}</div>`;
    openModal({
      title: c.name,
      body,
      buttons: owned || !open ? [{ label: 'Close', kind: 'primary' }] : [
        { label: 'Close', kind: 'plain' },
        {
          label: `Buy for ${fmt(c.cost)}`, kind: 'primary', onClick: () => {
            if (buyCosmic(ctx.s, id)) {
              sfxUpgrade();
              haptic('medium');
              ctx.recalc();
              ctx.dirty();
              ctx.save();
              toast(`<div class="t-ico">${icon('darkMatter')}</div><div><b>${esc(c.name)}</b><br>${esc(c.desc)}</div>`, 'good');
            } else {
              sfxDenied();
              return false;
            }
            return true;
          },
        },
      ],
    });
  }

  private askCollapse(): void {
    const ctx = this.ctx;
    const pending = pendingDarkMatter(ctx.s);
    if (pending < 1) return;
    confirmModal(
      'Collapse the Universe?',
      `Everything in this universe collapses: Stardust, generators and upgrades. You keep achievements, Dark Matter and Cosmic upgrades.<br><br>You will gain <b class="dm">+${fmt(pending)} Dark Matter</b>, for <b>+${fmtPercent(pending * 0.02)}</b> production or more, forever.`,
      'Collapse',
      () => {
        const gained = collapse(ctx.s, ctx.d);
        sfxCollapse();
        haptic('heavy');
        ctx.recalc();
        ctx.dirty();
        ctx.save();
        document.body.classList.add('collapsing');
        setTimeout(() => document.body.classList.remove('collapsing'), 1600);
        ctx.sky.setStage(stageFor(0));
        ctx.showTab('build');
        toast(`<div class="t-ico">${icon('darkMatter')}</div><div><b>A new universe begins</b><br>+${fmt(gained)} Dark Matter</div>`, 'good', 5000);
      },
    );
  }
}

// ------------------------------------------------------------------ Probes

export class ProbesPanel implements Panel {
  private key = '';

  constructor(private root: HTMLElement, private ctx: Ctx) {
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const go = t.closest<HTMLElement>('[data-launch]');
      if (go) {
        if (startExpedition(ctx.s, ctx.d, go.dataset.launch!)) {
          sfxUpgrade();
          haptic('medium');
          ctx.save();
          this.key = '';
        } else sfxDenied();
      }
      if (t.closest('#btn-collect')) this.collect();
    });
  }

  collect(): void {
    const ctx = this.ctx;
    const results = collectExpeditions(ctx.s, ctx.d);
    if (!results.length) return;
    ctx.recalc();
    ctx.save();
    sfxAchievement();
    haptic('medium');
    const lines = results.map((r) => `<li><b>${esc(DESTINATION_BY_ID[r.destId].name)}</b>: +${fmt(r.stardust)} Stardust${r.relic ? `<br><span class="relic-get">${icon('relic')} ${esc(relicName(r.relic))} (level ${r.relicLevel})</span>` : ''}</li>`).join('');
    openModal({ title: 'Probes are back', body: `<ul class="result-list">${lines}</ul>` });
    this.key = '';
  }

  refresh(ctx: Ctx): void {
    const { s, d } = ctx;
    const now = Date.now();
    const key = s.expeditions.map((e) => e.id + e.returnsAt).join(',') + '|' + JSON.stringify(s.relics) + '|' + d.expeditionSlots;
    if (key !== this.key) {
      this.key = key;
      const slots = freeSlots(s, d);
      this.root.innerHTML = `
        <div class="probe-head"><div class="probe-ico">${icon('probe')}</div><div><b>Expeditions</b><br><span class="dim">${d.expeditionSlots} probe${d.expeditionSlots > 1 ? 's' : ''} · rewards scale with your production</span></div></div>
        <div id="probe-active">${s.expeditions.map((e, i) => `
          <div class="probe-run"><div class="probe-run-top"><b>${esc(DESTINATION_BY_ID[e.id]?.name ?? e.id)}</b><span class="probe-left" data-i="${i}"></span></div>
          <div class="bar"><div class="bar-fill" data-bar="${i}"></div></div></div>`).join('')}</div>
        <button class="btn btn-primary btn-wide" id="btn-collect" hidden>Collect returned probes</button>
        <h3 class="section-title">Destinations</h3>
        ${DESTINATIONS.map((dest) => `
          <div class="dest">
            <div class="dest-text"><b>${esc(dest.name)}</b><br><span class="dim">${esc(dest.desc)}</span><br>
            <span class="dest-meta">${fmtTime(expeditionDurationMs(d, dest) / 1000)} · ~${fmt(expeditionReward(d, dest))} Stardust · ${Math.round(dest.relicChance * 100)}% Relic</span></div>
            <button class="btn btn-buy ${slots > 0 ? 'afford' : ''}" data-launch="${dest.id}" ${slots > 0 ? '' : 'disabled'}>Launch</button>
          </div>`).join('')}
        <h3 class="section-title">Relics</h3>
        <div class="relics">${RELICS.map((r) => {
          const lvl = s.relics[r.id] ?? 0;
          return `<div class="relic ${lvl ? 'got' : ''}"><div class="relic-ico">${icon(lvl ? 'relic' : 'lock')}</div><div><b>${lvl ? esc(r.name) : 'Unknown relic'}</b> ${lvl ? `<span class="dim">Lv ${lvl}/${r.maxLevel}</span>` : ''}<br><span class="dim">${lvl ? esc(r.desc) : 'Found on expeditions.'}</span></div></div>`;
        }).join('')}</div>`;
    }
    let ready = false;
    s.expeditions.forEach((e, i) => {
      const left = (e.returnsAt - now) / 1000;
      const frac = Math.min(1, (now - e.startedAt) / Math.max(1, e.returnsAt - e.startedAt));
      const label = this.root.querySelector<HTMLElement>(`.probe-left[data-i="${i}"]`);
      const bar = this.root.querySelector<HTMLElement>(`[data-bar="${i}"]`);
      if (label) setText(label, left > 0 ? fmtTime(left) : 'Returned!');
      if (bar) bar.style.width = `${(frac * 100).toFixed(1)}%`;
      if (left <= 0) ready = true;
    });
    ($('#btn-collect', this.root) as HTMLButtonElement).hidden = !ready;
  }
}

export function stageName(earned: number): string {
  return STAGES[stageFor(earned)].name;
}
