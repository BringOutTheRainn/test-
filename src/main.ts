// Entry point: builds the screen, loads the save and runs the game loop.

import { ACHIEVEMENT_BY_ID } from './data/achievements.js';
import { availableNews } from './data/news.js';
import { checkAchievements, grantAchievement } from './core/achievements.js';
import { checkAnomaly } from './core/anomalies.js';
import { ANOMALY_BY_ID } from './data/anomalies.js';
import { catchComet, cometDue, cometStaySeconds, rollBlack, scheduleNextComet } from './core/comets.js';
import { dailyReady } from './core/daily.js';
import { availableUpgrades, computeDerived, tap, tick, upgradePrice, type Derived } from './core/economy.js';
import { fmt, fmtRate, fmtTime } from './core/format.js';
import { canCollapse } from './core/prestige.js';
import { applyOffline, deserialize, SAVE_KEY, serialize } from './core/save.js';
import { newState, type GameState } from './core/state.js';
import { resumeAudio, sfxAchievement, sfxComet, sfxTap, suspendAudio, unlockAudio } from './ui/audio.js';
import { BuildPanel } from './ui/build.js';
import type { BuyAmount, Ctx, Panel } from './ui/ctx.js';
import { $, closeModal, esc, modalOpen, setText, toast, toggleClass, topModalDismissable } from './ui/dom.js';
import { icon, installIcons } from './ui/icons.js';
import { applySettings, openDaily, openHyperdrive, openSettings, openStats, showOffline } from './ui/menus.js';
import { initAds, setBanner } from './ui/ads.js';
import { hyperRemainingMs } from './core/ads.js';
import { AD_CONFIG } from './data/ads.js';
import { CosmosPanel, cosmosUnlocked, ProbesPanel, TrophiesPanel, UpgradesPanel } from './ui/panels.js';
import { haptic, hideSplash, onBackButton, onPause } from './ui/platform.js';
import { Sky, STAGES, stageFor } from './ui/sky.js';

const TABS = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'upgrades', label: 'Upgrades', icon: 'upgrade' },
  { id: 'trophies', label: 'Trophies', icon: 'trophy' },
  { id: 'cosmos', label: 'Cosmos', icon: 'cosmos' },
  { id: 'probes', label: 'Probes', icon: 'probe' },
];

function layout(): void {
  $('#app').innerHTML = `
    <header class="top">
      <div class="bank">
        <div class="amount-row"><span class="sd-dot big"></span><span class="amount" id="amount">0</span></div>
        <div class="rate" id="rate">0 per second</div>
      </div>
      <button class="icon-btn" id="btn-stats" aria-label="Stats">${icon('chart')}</button>
      <button class="icon-btn" id="btn-settings" aria-label="Settings">${icon('gear')}</button>
    </header>
    <section class="sky-wrap">
      <canvas id="sky" aria-label="Celestial body. Tap to harvest Stardust."></canvas>
      <div class="stage-label" id="stage-label"></div>
      <div class="toasts" id="toasts" aria-live="polite"></div>
      <div class="buffs" id="buffs"></div>
      <button class="gift-btn" id="btn-daily" hidden aria-label="Daily reward">${icon('gift')}</button>
      <button class="hyper-btn" id="btn-hyper" hidden aria-label="Hyperdrive"><span class="hyper-ico">${icon('probe')}</span><span class="hyper-text" id="hyper-text">x2</span></button>
      <div class="tap-info" id="tap-info"></div>
      <div class="hint" id="hint" hidden></div>
      <div class="ticker" aria-hidden="true"><div class="ticker-text" id="ticker"></div></div>
    </section>
    <section class="panel">
      <div class="tab-bodies">
        ${TABS.map((t) => `<div class="tab-body" id="tab-${t.id}" hidden></div>`).join('')}
      </div>
      <nav class="tabs" role="tablist">
        ${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span><i class="badge" hidden></i></button>`).join('')}
      </nav>
    </section>
    <div id="modals"></div>`;
}

function loadState(): GameState {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) return deserialize(text);
  } catch (e) {
    console.warn('Could not load save', e);
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (text) localStorage.setItem(SAVE_KEY + '-broken-' + Date.now(), text);
    } catch {
      /* storage unavailable */
    }
  }
  return newState();
}

function start(): void {
  installIcons();
  layout();

  const state = loadState();
  let derived: Derived = computeDerived(state);
  let rebuildAll = true;
  let activeTab = 'build';
  const panels: Record<string, Panel> = {};

  const sky = new Sky($('#sky') as HTMLCanvasElement, {
    onTap: (x, y) => {
      if (ctx.d.noTaps) {
        if (Math.random() < 0.2) sky.floatText(x, y, 'Hands tied!', '#ff5f7a', 18);
        return null;
      }
      const amount = tap(ctx.s, ctx.d);
      sfxTap();
      haptic('light');
      return '+' + fmt(amount, 1);
    },
    onComet: (black) => {
      const r = catchComet(ctx.s, ctx.d, black);
      ctx.recalc();
      sfxComet();
      haptic('heavy');
      sky.floatCenter(r.title, black ? '#c58bff' : '#bff6ff', 28);
      if (r.amount > 0) sky.floatCenter('+' + fmt(r.amount), '#ffcf5a', 26);
      toast(`<div class="t-ico">${icon(black ? 'blackComet' : 'comet')}</div><div><b>${esc(r.title)}</b><br>${esc(r.amount > 0 ? `+${fmt(r.amount)} Stardust` : r.detail)}</div>`, r.kind === 'well' ? 'bad' : 'comet');
    },
    onCometMissed: () => undefined,
  });

  const ctx: Ctx = {
    s: state,
    d: derived,
    sky,
    buyAmount: 1 as BuyAmount,
    recalc() {
      derived = computeDerived(ctx.s);
      ctx.d = derived;
    },
    save() {
      ctx.s.lastSeen = Date.now();
      try {
        localStorage.setItem(SAVE_KEY, serialize(ctx.s));
      } catch (e) {
        console.warn('Save failed', e);
      }
    },
    replaceState(s: GameState) {
      ctx.s = s;
      ctx.recalc();
      applySettings(ctx);
      sky.setStage(stageFor(s.earnedRun));
      ctx.save();
      ctx.dirty();
      ctx.showTab('build');
    },
    dirty() {
      rebuildAll = true;
    },
    showTab(id: string) {
      activeTab = id;
      document.querySelectorAll<HTMLElement>('.tab').forEach((b) => toggleClass(b, 'on', b.dataset.tab === id));
      document.querySelectorAll<HTMLElement>('.tab-body').forEach((b) => (b.hidden = b.id !== `tab-${id}`));
      $(`#tab-${id}`).scrollTop = 0;
      panels[id]?.refresh(ctx);
    },
  };

  panels.build = new BuildPanel($('#tab-build'), ctx);
  panels.upgrades = new UpgradesPanel($('#tab-upgrades'), ctx);
  panels.trophies = new TrophiesPanel($('#tab-trophies'), ctx);
  panels.cosmos = new CosmosPanel($('#tab-cosmos'), ctx);
  panels.probes = new ProbesPanel($('#tab-probes'), ctx);

  applySettings(ctx);
  sky.setStage(stageFor(state.earnedRun));

  // Offline progress since the last session.
  const off = applyOffline(ctx.s, ctx.d);
  if (off.earned > 0) {
    if (off.seconds >= 3600) grantAchievement(ctx.s, 'offline_hour');
    showOffline(ctx, off.seconds, off.earned);
  }

  document.querySelector('.tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (b) ctx.showTab(b.dataset.tab!);
  });
  $('#btn-stats').addEventListener('click', () => openStats(ctx));
  $('#btn-settings').addEventListener('click', () => openSettings(ctx));
  $('#btn-daily').addEventListener('click', () => openDaily(ctx, () => refreshSlow(true)));
  $('#btn-hyper').addEventListener('click', () => openHyperdrive(ctx));
  void initAds().then(() => {
    if (AD_CONFIG.banner && !ctx.s.noAds) void setBanner(true);
  });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  // Block pinch-zoom and double-tap zoom on iOS Safari.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  onBackButton(() => {
    if (modalOpen()) {
      if (topModalDismissable()) closeModal();
      return true;
    }
    if (activeTab !== 'build') {
      ctx.showTab('build');
      return true;
    }
    return false;
  });

  let paused = false;
  onPause(
    () => {
      if (paused) return;
      paused = true;
      ctx.save();
      suspendAudio();
    },
    () => {
      if (!paused) return;
      paused = false;
      resumeAudio();
      const back = applyOffline(ctx.s, ctx.d);
      if (back.earned > 0 && back.seconds >= 60) {
        if (back.seconds >= 3600) grantAchievement(ctx.s, 'offline_hour');
        showOffline(ctx, back.seconds, back.earned);
      }
      ctx.recalc();
      last = performance.now();
    },
  );

  // ---------------------------------------------------------------- slow UI

  const amountEl = $('#amount');
  const rateEl = $('#rate');
  const buffsEl = $('#buffs');
  const stageEl = $('#stage-label');
  const tapInfo = $('#tap-info');
  const dailyBtn = $('#btn-daily') as HTMLButtonElement;
  const hyperBtn = $('#btn-hyper') as HTMLButtonElement;
  const hyperText = $('#hyper-text');
  let shownAmount = state.stardust;

  function refreshSlow(force = false): void {
    const { s, d } = ctx;
    // Achievements.
    const fresh = checkAchievements(s, d.sps);
    if (fresh.length) {
      ctx.recalc();
      sfxAchievement();
      for (const id of fresh.slice(0, 3)) {
        const a = ACHIEVEMENT_BY_ID[id];
        toast(`<div class="t-ico">${icon('trophy')}</div><div><b>Achievement: ${esc(a.name)}</b><br>${esc(a.desc)}</div>`, 'trophy', 4000);
      }
      if (fresh.length > 3) toast(`and ${fresh.length - 3} more achievements!`, 'trophy');
      rebuildAll = true;
    }

    // Anomaly goal.
    const finished = checkAnomaly(s);
    if (finished) {
      const a = ANOMALY_BY_ID[finished];
      ctx.recalc();
      sfxAchievement();
      haptic('heavy');
      toast(`<div class="t-ico">${icon('darkMatter')}</div><div><b>Anomaly complete: ${esc(a.name)}</b><br>${esc(a.rewardText)} The rule is lifted.</div>`, 'good', 6000);
      rebuildAll = true;
    }

    // Stage of the celestial body.
    const stage = stageFor(s.earnedRun);
    sky.setStage(stage);
    sky.setDrones(s.generators[0]);
    sky.setOwned(s.generators);
    setText(stageEl, s.anomaly ? `${STAGES[stage].name} · ${ANOMALY_BY_ID[s.anomaly]?.name ?? ''}` : STAGES[stage].name);
    toggleClass(stageEl, 'anomaly', !!s.anomaly);
    setText(tapInfo, d.noTaps ? 'Tapping is disabled' : `${fmt(d.tap, 1)} per tap`);

    // Buff chips.
    const buffHtml = s.buffs.map((b) => {
      const left = Math.max(0, b.endsAt - s.time);
      const label = { rush: 'Rush x7', supernova: 'Tap x777', well: 'Well x0.5', horizon: 'Horizon x66' }[b.kind];
      return `<div class="buff buff-${b.kind}"><span>${label}</span><b>${Math.ceil(left)}s</b><i style="width:${(left / b.duration) * 100}%"></i></div>`;
    }).join('');
    if (buffsEl.innerHTML !== buffHtml) buffsEl.innerHTML = buffHtml;
    const top = s.buffs.find((b) => b.kind === 'well') ?? s.buffs.find((b) => b.kind === 'horizon') ?? s.buffs.find((b) => b.kind === 'rush') ?? s.buffs.find((b) => b.kind === 'supernova');
    sky.aura = top ? top.kind : 'none';

    dailyBtn.hidden = !dailyReady(s) || s.tapsAll < 10;

    // Hyperdrive (rewarded ad) button, offered once the player is hooked.
    const hyperLeft = hyperRemainingMs(s);
    if (d.hyper && hyperLeft <= 0) ctx.recalc();
    hyperBtn.hidden = !AD_CONFIG.enabled || (s.generators[1] === 0 && s.collapses === 0);
    toggleClass(hyperBtn, 'on', hyperLeft > 0);
    setText(hyperText, hyperLeft > 0 ? fmtTime(hyperLeft / 1000) : 'x2');

    // Tabs: Cosmos shows a lock until unlocked, Probes only once bought.
    const probeTab = document.querySelector<HTMLElement>('[data-tab="probes"]')!;
    probeTab.hidden = !d.expeditions;
    toggleClass(document.querySelector('[data-tab="cosmos"]')!, 'locked', !cosmosUnlocked(ctx));
    badge('upgrades', !d.noUpgrades && availableUpgrades(s).some((u) => upgradePrice(d, u) <= s.stardust));
    badge('cosmos', canCollapse(s) && s.collapses === 0);
    badge('probes', s.expeditions.some((e) => e.returnsAt <= Date.now()) || (d.expeditions && s.expeditions.length < d.expeditionSlots));

    if (rebuildAll || force) {
      rebuildAll = false;
      for (const id in panels) panels[id].refresh(ctx);
    } else {
      panels[activeTab]?.refresh(ctx);
    }
    hints();
  }

  function badge(tab: string, on: boolean): void {
    const b = document.querySelector<HTMLElement>(`[data-tab="${tab}"] .badge`);
    if (b) b.hidden = !on;
  }

  // ---------------------------------------------------------------- hints

  const hintEl = $('#hint');
  let hintId = '';
  function showHint(id: string, text: string): void {
    if (hintId === id) return;
    hintId = id;
    hintEl.textContent = text;
    hintEl.hidden = false;
    hintEl.dataset.hint = id;
  }
  function hints(): void {
    const { s } = ctx;
    const seen = s.seenHints;
    toggleClass(document.querySelector('.gen[data-gen="0"]')!, 'pulse', s.generators[0] === 0 && s.stardust >= 15);
    if (s.tapsAll < 5) return showHint('tap', 'Tap the asteroid to harvest Stardust');
    if (s.generators[0] === 0 && s.stardust >= 15 && !seen.buy) return showHint('buy', 'Buy a Mining Drone below. It mines for you.');
    if (s.generators[0] > 0) seen.buy = true;
    if (sky.hasComet && !seen.comet) return showHint('comet', 'A comet! Tap it quickly for a boost');
    if (!sky.hasComet && s.cometsAll > 0) seen.comet = true;
    if (!seen.upgrade && Object.keys(s.upgrades).length === 0 && availableUpgrades(s).some((u) => upgradePrice(ctx.d, u) <= s.stardust)) {
      return showHint('upgrade', 'An upgrade is ready. Tap it in the strip above your generators.');
    }
    if (Object.keys(s.upgrades).length > 0) seen.upgrade = true;
    if (!seen.cosmos && canCollapse(s)) return showHint('cosmos', 'Dark Matter is ready. Open Cosmos to collapse.');
    if (s.collapses > 0) seen.cosmos = true;
    if (hintId) {
      hintId = '';
      hintEl.hidden = true;
    }
  }

  // ---------------------------------------------------------------- ticker

  const tickerEl = $('#ticker');
  let lastNews = '';
  function nextNews(): void {
    const list = availableNews(ctx.s);
    let pick = list[Math.floor(Math.random() * list.length)];
    if (pick === lastNews && list.length > 1) pick = list[(list.indexOf(pick) + 1) % list.length];
    lastNews = pick;
    tickerEl.textContent = pick;
    tickerEl.classList.remove('run');
    void tickerEl.offsetWidth;
    tickerEl.classList.add('run');
  }
  tickerEl.addEventListener('animationend', nextNews);
  nextNews();

  // ---------------------------------------------------------------- loop

  let last = performance.now();
  let slowTimer = 0;
  let saveTimer = 0;
  let autoTapAcc = 0;
  let cometPending = false;

  function frame(now: number): void {
    const dt = Math.min(1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) {
      const { s } = ctx;
      if (tick(s, ctx.d, dt)) ctx.recalc();

      // Comets.
      if (cometDue(s) && !sky.hasComet) {
        cometPending = !ctx.d.noComets;
        scheduleNextComet(s, ctx.d);
      }
      if (cometPending && !modalOpen()) {
        cometPending = false;
        sky.spawnComet(cometStaySeconds(ctx.d), rollBlack(ctx.d));
      }

      // Probes tapping for you.
      if (ctx.d.autoTap > 0) {
        autoTapAcc += ctx.d.autoTap * dt;
        while (autoTapAcc >= 1) {
          autoTapAcc -= 1;
          sky.autoTap();
        }
      }

      // Number counters ease towards the real value.
      shownAmount += (s.stardust - shownAmount) * Math.min(1, dt * 12);
      if (Math.abs(s.stardust - shownAmount) < 1 || s.stardust < shownAmount) shownAmount = s.stardust;
      setText(amountEl, fmt(shownAmount));
      setText(rateEl, `${fmtRate(ctx.d.sps)} per second`);
      toggleClass(rateEl, 'boosted', ctx.d.prodBuff > 1);
      toggleClass(rateEl, 'nerfed', ctx.d.prodBuff < 1);

      slowTimer += dt;
      if (slowTimer >= 0.25) {
        slowTimer = 0;
        refreshSlow();
      }
      saveTimer += dt;
      if (saveTimer >= 10) {
        saveTimer = 0;
        ctx.save();
      }
    }
    sky.frame(dt);
    requestAnimationFrame(frame);
  }

  if (ctx.s.nextCometAt < ctx.s.time) scheduleNextComet(ctx.s, ctx.d);
  ctx.showTab('build');
  refreshSlow(true);
  requestAnimationFrame(frame);
  hideSplash();

  // Hooks for automated screenshots and tests.
  (window as unknown as { __game: unknown }).__game = {
    ctx,
    spawnComet: (black = false) => sky.spawnComet(13, black),
    cometPosition: () => sky.cometPosition(),
    fmtTime,
  };
}

start();
