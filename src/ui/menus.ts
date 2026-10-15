// Modal screens: stats, settings, offline earnings and the daily reward.

import { ACHIEVEMENTS } from '../data/achievements.js';
import { GENERATORS } from '../data/generators.js';
import { UPGRADES } from '../data/upgrades.js';
import { claimDaily, dailyReward, nextStreakDay, rewardMinutes } from '../core/daily.js';
import { fmt, fmtLong, fmtPercent, fmtRate, fmtTime, setNumberStyle } from '../core/format.js';
import { exportSave, importSave } from '../core/save.js';
import { achievementCount, newState, totalGenerators, upgradeCount } from '../core/state.js';
import { setMusic, setSound, sfxAchievement, sfxBuy, sfxDenied, sfxTap } from './audio.js';
import type { Ctx } from './ctx.js';
import { closeModal, confirmModal, esc, openModal, toast } from './dom.js';
import { icon } from './icons.js';
import { copyText, haptic, setVibration } from './platform.js';
import { notificationsSupported, requestNotifications } from './notify.js';
import { rewardedAvailable, showRewarded } from './ads.js';
import { BUFF_MULT, earn } from '../core/economy.js';
import { AD_CONFIG } from '../data/ads.js';
import { boostMult, frenzyCooldown, frenzyReady, grantFrenzy, grantHyper, hyperCanStack, hyperRemainingMs } from '../core/ads.js';
import { claimContract, contractClaimable, contractProgress, contractTimeLeft, currentContract, MEDAL_PCT, tierReward } from '../core/contracts.js';
import { AD_SPEEDUP_HOURS, CRYSTAL_HOURS, LEVEL_PCT, crystalProgress, levelCost, levelUp, speedUpCrystal } from '../core/crystals.js';
import { GENERATORS as GENS } from '../data/generators.js';
import { generatorVisible } from '../core/economy.js';
import { FERTILIZE_COOLDOWN_HOURS, FERTILIZE_HOURS, GARDEN_GEN, SEEDS, fertilize, fertilizeReady, harvest, harvestAll, harvestValue, plant, plotCount, plotProgress, plotReady, readyPlots, seedById } from '../core/garden.js';
import { BADGE_GOALS, BADGE_MINUTES, BADGE_NAMES, GOLD_TIER, PLATINUM_CRYSTALS, badgeCount, EVENT_AD_MINUTES, EVENT_GENS, badgeReady, badgeReward, buyEventGen, claimBadge, currentEvent, eventAdBoost, eventAdReady, eventPrice, eventRate, eventTap, eventTapOnce, eventDay, eventTheme, eventTimeLeft } from '../core/event.js';
import { FORGE_GEN, REFILL_MINUTES, SPELLS, STOKE_COOLDOWN_HOURS, cast, heatFullIn, maxHeat, spellById, stoke, stokeReady, syncHeat } from '../core/forge.js';
import { GOODS, MARKET_GEN, TICK_MINUTES, TIP_COOLDOWN_HOURS, TIP_TICKS, buyGood, creditValue, holdSize, insiderTip, maxBuy, nextTickIn, sellGood, syncMarket, tipReady, type GoodState } from '../core/market.js';
import { AD_SPINS_PER_DAY, SLICES, adSpinsLeft, freeSpinReady, sliceValue, spin } from '../core/wheel.js';
import { buyProduct, productPrice } from './store.js';
import { PASS_TIERS, XP_PER_TIER, XP_RATES, claimPass, currentPass, passClaimable, passTier, passXp, seasonNumber, seasonTimeLeft, tierReward as passReward, type PassReward } from '../core/pass.js';
import { claimMission, describeMission, missionDone, missionProgress, missionReward, swapMission } from '../core/missions.js';

export const VERSION = '1.0.0';

export function openStats(ctx: Ctx): void {
  const render = (): string => {
    const { s, d } = ctx;
    const rows: Array<[string, string]> = [
      ['Stardust in bank', fmtLong(s.stardust)],
      ['Earned this universe', fmtLong(s.earnedRun)],
      ['Earned all time', fmtLong(s.earnedAll)],
      ['Production', `${fmtRate(d.sps)} per second`],
      ['Best production', `${fmtRate(s.highestSps)} per second`],
      ['Production multiplier', `x${fmt(d.globalMult, 2)}`],
      ['Stardust per tap', fmtRate(d.tap)],
      ['Taps (this universe / all)', `${fmt(s.tapsRun)} / ${fmt(s.tapsAll)}`],
      ['Earned by tapping (all time)', fmtLong(s.tapEarnedAll)],
      ['Generators owned', fmt(totalGenerators(s))],
      ['Upgrades bought', `${upgradeCount(s)} of ${UPGRADES.length}`],
      ['Achievements', `${achievementCount(s)} of ${ACHIEVEMENTS.length}`],
      ['Comets caught (this universe / all)', `${s.cometsRun} / ${s.cometsAll}`],
      ['Universes collapsed', String(s.collapses)],
      ['Dark Matter', fmt(s.darkMatter)],
      ['Earned while away', fmtLong(s.offlineEarnedAll)],
      ['Expeditions completed', String(s.expeditionsDone)],
      ['Missions completed', fmt(s.missionsDone)],
      ['Event Gold badges', String(s.eventGolds)],
      ['Stardust Vaults opened', String(s.vaultsOpened)],
      ['Lucky Orbit spins', String(s.wheelSpins)],
      ['Warp Exchange profit', `${fmt(s.marketProfit)} credits`],
      ['Contract Medals', `${s.contractMedals} (+${fmtPercent(s.contractMedals * MEDAL_PCT)})`],
      ['Ads watched', String(s.adsWatched)],
      ['Login streak', `${s.dailyStreak} day${s.dailyStreak === 1 ? '' : 's'}`],
      ['Time played', fmtTime(s.playSeconds)],
      ['This universe started', fmtTime((Date.now() - s.runStartedAt) / 1000) + ' ago'],
    ];
    const gens = GENERATORS.map((g, i) => s.generators[i]
      ? `<tr><td>${esc(g.name)}</td><td>${s.generators[i]}</td><td>${fmtRate(d.genSps[i])}/s</td></tr>` : '').join('');
    return `<table class="stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td colspan="2">${v}</td></tr>`).join('')}</table>
      ${gens ? `<h3 class="section-title">Generators</h3><table class="stats">${gens}</table>` : ''}`;
  };
  const el = openModal({ title: 'Stats', body: render(), wide: true, onClose: () => clearInterval(timer) });
  const timer = setInterval(() => {
    const body = el.querySelector('.modal-body');
    if (body) body.innerHTML = render();
  }, 1000);
}

function toggleRow(id: string, label: string, on: boolean): string {
  return `<label class="toggle"><span>${label}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="switch"></span></label>`;
}

export function applySettings(ctx: Ctx): void {
  const st = ctx.s.settings;
  setSound(st.sound);
  setMusic(st.music);
  setVibration(st.vibration);
  setNumberStyle(st.numberStyle);
  ctx.sky.particlesOn = st.particles;
}

export function openSettings(ctx: Ctx): void {
  const st = ctx.s.settings;
  const el = openModal({
    title: 'Settings',
    body: `
      ${toggleRow('set-sound', 'Sound effects', st.sound)}
      ${toggleRow('set-music', 'Ambient music', st.music)}
      ${toggleRow('set-vibration', 'Vibration', st.vibration)}
      ${toggleRow('set-particles', 'Particles', st.particles)}
      ${toggleRow('set-sci', 'Scientific notation', st.numberStyle === 'scientific')}
      ${notificationsSupported() ? toggleRow('set-notify', 'Reminders (storage full, probes back, daily drop)', st.notifications) : ''}
      <h3 class="section-title">Save</h3>
      <p class="dim">Progress saves automatically on this device. Copy your save code to keep a backup or move to another device.</p>
      <div class="btn-row"><button class="btn btn-plain" id="btn-export">Copy save code</button><button class="btn btn-plain" id="btn-import">Load save code</button></div>
      <h3 class="section-title">Danger zone</h3>
      <button class="btn btn-danger" id="btn-reset">Erase all progress</button>
      <p class="dim small">Stardust Empire ${VERSION}</p>`,
  });
  const bind = (id: string, fn: (on: boolean) => void): void => {
    el.querySelector<HTMLInputElement>('#' + id)!.addEventListener('change', (e) => {
      fn((e.target as HTMLInputElement).checked);
      applySettings(ctx);
      ctx.save();
      ctx.dirty();
    });
  };
  bind('set-sound', (on) => (st.sound = on));
  bind('set-music', (on) => (st.music = on));
  bind('set-vibration', (on) => {
    st.vibration = on;
    if (on) setTimeout(() => haptic('medium'));
  });
  bind('set-particles', (on) => (st.particles = on));
  bind('set-sci', (on) => (st.numberStyle = on ? 'scientific' : 'short'));
  el.querySelector<HTMLInputElement>('#set-notify')?.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.checked) {
      st.notifications = false;
      ctx.save();
      return;
    }
    void requestNotifications().then((ok) => {
      st.notifications = ok;
      box.checked = ok;
      if (!ok) toast('Notifications are blocked. You can allow them in your phone settings.', 'info');
      ctx.save();
    });
  });

  el.querySelector('#btn-export')!.addEventListener('click', async () => {
    ctx.save();
    const code = exportSave(ctx.s);
    const ok = await copyText(code);
    if (ok) toast('Save code copied to the clipboard.', 'good');
    else openModal({ title: 'Your save code', body: `<p class="dim">Copy all of this text and keep it somewhere safe.</p><textarea class="code" readonly>${esc(code)}</textarea>` });
  });
  el.querySelector('#btn-import')!.addEventListener('click', () => {
    openModal({
      title: 'Load save code',
      body: '<p class="dim">Paste a save code. This replaces your current progress.</p><textarea class="code" id="import-text" placeholder="Paste here"></textarea>',
      buttons: [
        { label: 'Cancel' },
        {
          label: 'Load', kind: 'primary', onClick: (root) => {
            const text = root.querySelector<HTMLTextAreaElement>('#import-text')!.value;
            try {
              const s = importSave(text);
              ctx.replaceState(s);
              closeModal(el);
              toast('Save loaded.', 'good');
              return true;
            } catch {
              toast('That save code did not work. Check it was copied completely.', 'bad');
              return false;
            }
          },
        },
      ],
    });
  });
  el.querySelector('#btn-reset')!.addEventListener('click', () => {
    confirmModal('Erase everything?', 'This deletes all progress, including Dark Matter and achievements. It cannot be undone.', 'Erase', () => {
      confirmModal('Really erase?', 'Last chance. Your whole empire will be gone.', 'Yes, erase it all', () => {
        ctx.replaceState(newState());
        closeModal(el);
        toast('A fresh start.', 'info');
      }, true);
    }, true);
  });
}

export function showOffline(ctx: Ctx, seconds: number, earned: number): void {
  if (earned <= 0 || seconds < 60) return;
  const buttons: Parameters<typeof openModal>[0]['buttons'] = [{ label: 'Collect', kind: rewardedAvailable() ? 'plain' : 'primary' }];
  if (rewardedAvailable()) {
    buttons.push({
      label: 'Watch ad: x2', kind: 'primary', onClick: () => {
        void showRewarded('double your offline Stardust').then((ok) => {
          if (!ok) return;
          earn(ctx.s, earned);
          ctx.s.adsWatched++;
          ctx.save();
          ctx.sky.floatCenter(`+${fmt(earned)}`, '#ffcf5a', 30);
          toast(`<div class="t-ico">${icon('gift')}</div><div><b>Doubled!</b><br>+${fmt(earned)} more Stardust</div>`, 'good');
        });
      },
    });
  }
  openModal({
    title: 'Welcome back!',
    body: `<div class="offline"><div class="big-ico">${icon('drone')}</div>
      <p>While you were away for <b>${fmtTime(seconds)}</b>, your empire harvested</p>
      <p class="offline-amount"><span class="sd-dot big"></span>${fmt(earned)}</p><p class="dim">Stardust</p></div>`,
    buttons,
    onClose: () => { if (seconds >= 1800) askReminders(ctx); },
  });
}

/** One polite ask, the first time a player comes back after a while. */
function askReminders(ctx: Ctx): void {
  const s = ctx.s;
  if (!notificationsSupported() || s.settings.notifications || s.seenHints.notifyAsk) return;
  s.seenHints.notifyAsk = true;
  ctx.save();
  openModal({
    title: 'Want a heads-up?',
    body: `<div class="offline"><div class="big-ico">${icon('drone')}</div>
      <p>Get a ping when your storage is full, a probe is back, or your daily drop is waiting. Nothing else.</p></div>`,
    buttons: [
      { label: 'No thanks' },
      {
        label: 'Yes, remind me', kind: 'primary', onClick: () => {
          void requestNotifications().then((ok) => {
            s.settings.notifications = ok;
            ctx.save();
            if (ok) toast('Reminders on. Change this any time in Settings.', 'good');
          });
        },
      },
    ],
  });
}

const SLICE_COLORS = ['#3b4cc0', '#ff7ad9', '#2a9d8f', '#ffcf5a', '#6b3cff', '#5ef0ff', '#e76f51', '#ffd700'];

function wheelSvg(rot: number): string {
  const r = 92;
  const pt = (deg: number, rad = r): string => {
    const a = (deg * Math.PI) / 180;
    return `${(100 + rad * Math.sin(a)).toFixed(2)},${(100 - rad * Math.cos(a)).toFixed(2)}`;
  };
  const slices = SLICES.map((x, i) => {
    const mid = i * 45;
    const dark = i === 3 || i === 5 || i === 7;
    return `<path d="M100,100 L${pt(mid - 22.5)} A${r},${r} 0 0 1 ${pt(mid + 22.5)} Z" fill="${SLICE_COLORS[i]}" stroke="#0c0f23" stroke-width="2"/>
      ${mid > 90 && mid < 270
        ? `<text transform="rotate(${mid + 180} 100 100)" x="100" y="171" text-anchor="middle" class="wheel-label${dark ? ' dark' : ''}">${esc(x.label)}</text>`
        : `<text transform="rotate(${mid} 100 100)" x="100" y="34" text-anchor="middle" class="wheel-label${dark ? ' dark' : ''}">${esc(x.label)}</text>`}`;
  }).join('');
  return `<div class="wheel-wrap"><svg class="wheel-disc" viewBox="0 0 200 200" style="transform:rotate(${rot}deg)" aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill="#0c0f23"/>${slices}
      <circle cx="100" cy="100" r="16" fill="#141937" stroke="#ffcf5a" stroke-width="3"/></svg>
    <i class="wheel-pin"></i></div>`;
}

function prizeText(ctx: Ctx, i: number, amount: number): string {
  const x = SLICES[i];
  if (x.kind === 'hyper') return `Hyperdrive +${x.minutes} minutes`;
  if (x.kind === 'comet') return 'A comet is on its way';
  if (x.kind === 'crystal' && !amount) return '+1 Quasar Crystal';
  return `+${fmt(amount)} Stardust${i === 7 ? ', the jackpot!' : ''}`;
}

export function openHyperdrive(ctx: Ctx): void {
  let rot = 0;
  const render = (): string => {
    const s = ctx.s;
    const left = hyperRemainingMs(s);
    const can = hyperCanStack(s) && rewardedAvailable();
    const frenzyOn = s.buffs.find((b) => b.kind === 'frenzy');
    const wait = frenzyCooldown(s);
    const mult = boostMult();
    const frenzyText = ctx.d.noTaps ? 'Not available while tapping is disabled.'
      : frenzyOn ? `Active: ${Math.ceil(frenzyOn.endsAt - s.time)}s left.`
      : wait > 0 ? `Recharging: ${fmtTime(wait)}.` : '';
    const free = freeSpinReady(s);
    const adLeft = adSpinsLeft(s);
    const spinBtn = free ? '<button class="btn btn-primary" data-spin="free">Spin free</button>'
      : adLeft > 0 ? `<button class="btn ${rewardedAvailable() ? 'btn-primary' : 'btn-plain'}" data-spin="ad" ${rewardedAvailable() ? '' : 'disabled'}>Ad spin: ${adLeft} left</button>`
      : '<p class="dim small">Next free spin tomorrow.</p>';
    return `<div class="boosts">
      <div class="wheel-card">
        ${wheelSvg(rot)}
        <div class="wheel-side"><b>Lucky Orbit</b>
          <p>One free spin every day and ${AD_SPINS_PER_DAY} more with an ad. Up to 8 hours of production, Hyperdrive, comets and crystals.</p>
          ${spinBtn}</div>
      </div>
      ${mult > 1 ? '<p class="ev-pass-on">Double weekend: boosts last twice as long while the weekend event runs.</p>' : ''}
      <div class="boost">
        <div class="boost-ico">${icon('probe')}</div>
        <div class="boost-main"><b>Hyperdrive</b>
          <p>Double all production for ${(AD_CONFIG.hyperMinutes * mult) / 60} hours. Keeps running while you are away and stacks up to ${AD_CONFIG.hyperCapMinutes / 60} hours.</p>
          ${left > 0 ? `<p class="dim small">Active: ${fmtTime(left / 1000)} left.</p>` : ''}
          ${hyperCanStack(s) ? '' : '<p class="dim small">Fully charged. Come back when it runs lower.</p>'}</div>
        <button class="btn ${can ? 'btn-primary' : 'btn-plain'}" data-boost="hyper" ${can ? '' : 'disabled'}>Watch ad</button>
      </div>
      <div class="boost">
        <div class="boost-ico">${icon('tap')}</div>
        <div class="boost-main"><b>Tap Frenzy</b>
          <p>For ${AD_CONFIG.frenzySeconds * mult} seconds, probes tap ${AD_CONFIG.frenzyTapsPerSecond} times a second and every tap is worth x${BUFF_MULT.frenzy}.</p>
          ${frenzyText ? `<p class="dim small">${frenzyText}</p>` : ''}</div>
        <button class="btn ${frenzyUsable() ? 'btn-primary' : 'btn-plain'}" data-boost="frenzy" ${frenzyUsable() ? '' : 'disabled'}>Watch ad</button>
      </div>
    </div>`;
  };
  const frenzyUsable = (): boolean => !ctx.d.noTaps && frenzyReady(ctx.s) && rewardedAvailable();
  const el = openModal({ title: 'Boosts', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const timer = setInterval(() => { if (!busy) body.innerHTML = render(); }, 1000);
  const doSpin = (viaAd: boolean): void => {
    const r = spin(ctx.s, ctx.d, viaAd);
    if (!r) { busy = false; return; }
    ctx.save();
    // Land the chosen slice under the pin, after five full turns.
    const target = (360 - r.slice * 45) % 360;
    rot += 1800 + ((target - (rot % 360) + 360) % 360);
    const disc = body.querySelector<SVGElement>('.wheel-disc');
    body.querySelectorAll<HTMLButtonElement>('[data-spin]').forEach((x) => { x.disabled = true; });
    sfxTap();
    if (disc) {
      disc.classList.add('spinning');
      disc.style.transform = `rotate(${rot}deg)`;
    }
    setTimeout(() => {
      busy = false;
      sfxAchievement();
      haptic('medium');
      toast(`<div class="t-ico">${icon('gift')}</div><div><b>Lucky Orbit</b><br>${esc(prizeText(ctx, r.slice, r.amount))}</div>`, 'good');
      ctx.recalc();
      ctx.dirty();
      if (el.isConnected) body.innerHTML = render();
    }, disc ? 2700 : 0);
  };
  body.addEventListener('click', (e) => {
    const w = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spin]');
    if (w && !w.disabled && !busy) {
      busy = true;
      if (w.dataset.spin === 'free') doSpin(false);
      else void showRewarded('spin the Lucky Orbit').then((ok) => { if (ok) doSpin(true); else busy = false; });
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-boost]');
    if (!b || b.disabled || busy) return;
    busy = true;
    const kind = b.dataset.boost;
    void showRewarded(kind === 'hyper' ? 'Hyperdrive: double production' : 'Tap Frenzy').then((ok) => {
      busy = false;
      if (ok && kind === 'hyper') {
        grantHyper(ctx.s);
        toast(`<div class="t-ico">${icon('probe')}</div><div><b>Hyperdrive engaged</b><br>Production x2 for ${fmtTime(hyperRemainingMs(ctx.s) / 1000)}</div>`, 'good');
      } else if (ok && kind === 'frenzy') {
        grantFrenzy(ctx.s);
        closeModal(el);
        toast(`<div class="t-ico">${icon('tap')}</div><div><b>Tap Frenzy!</b><br>${AD_CONFIG.frenzyTapsPerSecond} taps a second, each x${BUFF_MULT.frenzy}</div>`, 'good');
      }
      if (ok) {
        ctx.recalc();
        ctx.save();
        sfxAchievement();
        haptic('medium');
      }
      if (el.isConnected) body.innerHTML = render();
    });
  });
}

function contractCard(ctx: Ctx): string {
  const { s, d } = ctx;
  const { def, state } = currentContract(s);
  const p = contractProgress(s);
  const top = def.goals[2];
  const ready = contractClaimable(s) > 0;
  const marks = def.goals.map((g, i) => `<i class="tier-mark ${state.claimed > i ? 'got' : p >= g ? 'ready' : ''}" style="left:${(g / top) * 100}%"></i>`).join('');
  const tiers = def.goals.map((g, i) => `<div class="tier ${state.claimed > i ? 'got' : ''}">
      <b>${fmt(g)}</b><span><span class="sd-dot"></span>${fmt(tierReward(d, i))}${i === 2 ? ` + Medal` : ''}</span></div>`).join('');
  const days = contractTimeLeft() / 86400000;
  const left = days >= 1 ? `${Math.floor(days)}d ${Math.floor((days % 1) * 24)}h left` : `${fmtTime(contractTimeLeft() / 1000)} left`;
  return `<div class="contract">
    <div class="contract-head"><div><div class="contract-kicker">Weekly contract</div><div class="contract-name">${esc(def.name)}</div></div><div class="dim small">${left}</div></div>
    <p class="contract-goal">${esc(def.goalText.replace('{n}', fmt(top)))} this week. Medal: +${fmtPercent(MEDAL_PCT)} production forever.</p>
    <div class="bar contract-bar"><div class="bar-fill" style="width:${Math.min(100, (p / top) * 100)}%"></div>${marks}</div>
    <div class="contract-tiers">${tiers}</div>
    ${ready ? `<button class="btn btn-primary contract-claim" data-contract="1">Claim tier ${state.claimed + 1}</button>`
      : state.claimed >= 3 ? '<p class="dim small">Contract complete. A new one starts Monday.</p>' : `<p class="dim small">Progress: ${fmt(p)} / ${fmt(def.goals[state.claimed])}</p>`}
  </div>`;
}

export function openCrystals(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const s = ctx.s;
    const left = Math.max(0, s.crystalNextAt - Date.now());
    const canAd = !s.crystalAdUsed && rewardedAvailable() && left > 0;
    const rows = GENS.map((g, i) => {
      if (!generatorVisible(s, i) && !s.genLevels[i]) return '';
      const lvl = s.genLevels[i] ?? 0;
      const cost = levelCost(s, i);
      return `<div class="lvl-row">
        <div class="lvl-ico">${icon(g.id)}</div>
        <div class="lvl-main"><b>${esc(g.name)}</b><span class="dim small">${lvl ? `Level ${lvl} · +${fmtPercent(lvl * LEVEL_PCT)} production` : 'Not levelled yet'}${i === GARDEN_GEN ? (lvl ? ' · Garden open' : ' · Level 1 opens the Nebula Garden') : ''}${i === FORGE_GEN ? (lvl ? ' · Forge lit' : ' · Level 1 lights the Star Forge minigame') : ''}</span></div>
        <button class="btn ${s.crystals >= cost ? 'btn-primary' : 'btn-plain'}" data-level="${i}" ${s.crystals >= cost ? '' : 'disabled'}>${icon('crystal')}${cost}</button>
      </div>`;
    }).join('');
    return `<div class="crystal-head">
        <div class="crystal-big">${icon('crystal')}<b>${s.crystals}</b></div>
        <div class="crystal-grow"><div class="dim small">Next crystal in ${fmtTime(left / 1000)}</div>
          <div class="bar"><div class="bar-fill crystal-fill" style="width:${crystalProgress(s) * 100}%"></div></div>
          ${canAd ? `<button class="btn btn-plain btn-small" data-speed="1">Watch ad: ${AD_SPEEDUP_HOURS} hours sooner</button>` : ''}</div>
      </div>
      <p class="dim small">A crystal forms every ${CRYSTAL_HOURS} hours, even while you are away. Each level makes that generator ${fmtPercent(LEVEL_PCT)} stronger, forever.</p>
      <div class="lvl-list">${rows}</div>`;
  };
  const el = openModal({ title: 'Quasar Crystals', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-level],[data-speed]');
    if (!t || t.disabled || busy) return;
    if (t.dataset.level) {
      const gen = Number(t.dataset.level);
      if (!levelUp(ctx.s, gen)) return;
      if (gen === GARDEN_GEN && ctx.s.genLevels[gen] === 1) {
        toast(`<div class="t-ico">${icon('sprout')}</div><div><b>Nebula Garden open</b><br>Find it at the top of the Build tab.</div>`, 'good', 5000);
      }
      if (gen === FORGE_GEN && ctx.s.genLevels[gen] === 1) {
        toast(`<div class="t-ico">${icon('anvil')}</div><div><b>Star Forge lit</b><br>Spend its heat from the top of the Build tab.</div>`, 'good', 5000);
      }
      sfxAchievement();
      haptic('medium');
      ctx.recalc();
      ctx.save();
      redraw();
      onChange();
      return;
    }
    busy = true;
    void showRewarded('grow a crystal sooner').then((ok) => {
      busy = false;
      if (ok && speedUpCrystal(ctx.s)) {
        ctx.save();
        toast(`<div class="t-ico">${icon('crystal')}</div><div><b>Crystal growth sped up</b><br>${AD_SPEEDUP_HOURS} hours sooner</div>`, 'good');
      }
      redraw();
    });
  });
}

let gardenSeed = 'moss';

export function openGarden(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const { s, d } = ctx;
    const now = Date.now();
    const n = plotCount(s);
    const seeds = SEEDS.map((x) => `<button class="seed${x.id === gardenSeed ? ' on' : ''}" data-seed="${x.id}" aria-pressed="${x.id === gardenSeed}">
        ${icon(x.id)}<b>${esc(x.name)}</b><span class="dim small">${fmtTime(x.growMinutes * 60)} · ${fmt(harvestValue(s, d, x))}</span></button>`).join('');
    const plots = Array.from({ length: n }, (_, i) => {
      const p = s.garden[i] ?? null;
      if (!p) return `<button class="plot empty" data-plot="${i}" aria-label="Plant ${esc(seedById(gardenSeed)!.name)}"><span class="plot-plus">+</span></button>`;
      const seed = seedById(p.seed)!;
      const pr = plotProgress(p, now);
      const ready = pr >= 1;
      const left = (1 - pr) * seed.growMinutes * 60;
      return `<button class="plot${ready ? ' ready' : ''}" data-plot="${i}" aria-label="${esc(seed.name)}${ready ? ', ready to harvest' : ''}">
        <span class="plot-ico" style="transform:scale(${0.45 + 0.55 * pr})">${icon(seed.id)}</span>
        <span class="plot-time">${ready ? 'Harvest' : fmtTime(left)}</span>
        ${ready ? '' : `<span class="plot-bar"><span style="width:${pr * 100}%"></span></span>`}</button>`;
    }).join('');
    const ready = readyPlots(s, now);
    const canAd = fertilizeReady(s, now) && rewardedAvailable();
    const cool = Math.max(0, s.gardenFertilizeAt - now);
    const lvl = s.genLevels[GARDEN_GEN] ?? 0;
    return `<p class="dim small">Pick a spore, then tap an empty plot. Plants grow in real time, even while you are away. Nebula Refinery level ${lvl}: ${n} plots${n < 9 ? ', two more next level' : ''}.</p>
      <div class="seeds">${seeds}</div>
      <div class="garden-bed">${plots}</div>
      <div class="garden-actions">
        <button class="btn ${ready ? 'btn-primary' : 'btn-plain'}" data-harvest-all="1" ${ready ? '' : 'disabled'}>Harvest ${ready || ''} and replant</button>
        ${canAd ? `<button class="btn btn-plain" data-fertilize="1">Watch ad: grow ${FERTILIZE_HOURS} hours</button>` : cool > 0 ? `<span class="dim small">Fertilizer again in ${fmtTime(cool / 1000)}</span>` : ''}
      </div>
      <p class="dim small">Harvests: ${fmt(s.gardenHarvests)}. Fertilizer can be used every ${FERTILIZE_COOLDOWN_HOURS} hours.</p>`;
  };
  const el = openModal({ title: 'Nebula Garden', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  const paid = (amount: number, what: string): void => {
    sfxAchievement();
    haptic('medium');
    toast(`<div class="t-ico">${icon('sprout')}</div><div><b>${what}</b><br>+${fmt(amount)} Stardust</div>`, 'good');
    ctx.recalc();
    ctx.save();
    onChange();
  };
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-seed],[data-plot],[data-harvest-all],[data-fertilize]');
    if (!t || t.disabled || busy) return;
    const { s, d } = ctx;
    if (t.dataset.seed) {
      gardenSeed = t.dataset.seed;
      haptic('light');
    } else if (t.dataset.plot) {
      const i = Number(t.dataset.plot);
      const p = s.garden[i];
      if (!p) {
        if (plant(s, i, gardenSeed)) { haptic('light'); ctx.save(); }
      } else if (plotReady(p)) {
        const name = seedById(p.seed)!.name;
        const amount = harvest(s, d, i);
        if (amount) paid(amount, `${name} harvested`);
      } else {
        toast(`${esc(seedById(p.seed)!.name)} is still growing.`, 'info');
      }
    } else if (t.dataset.harvestAll) {
      const n = readyPlots(s);
      const amount = harvestAll(s, d);
      if (amount) paid(amount, `${n} plant${n === 1 ? '' : 's'} harvested`);
    } else {
      busy = true;
      void showRewarded('fertilize the garden').then((ok) => {
        busy = false;
        if (ok && fertilize(ctx.s)) {
          ctx.save();
          toast(`<div class="t-ico">${icon('sprout')}</div><div><b>Garden fertilized</b><br>Every plant grew ${FERTILIZE_HOURS} hours</div>`, 'good');
        }
        redraw();
      });
      return;
    }
    redraw();
  });
}

const EVENT_ICONS = ['siphon', 'nebula', 'forge', 'wormhole'];

function extra(tier: number): string {
  return tier === GOLD_TIER ? ' and a Contract Medal' : tier === GOLD_TIER + 1 ? ` and ${PLATINUM_CRYSTALS} crystals` : '';
}

export function openEvent(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const { s, d } = ctx;
    const now = Date.now();
    const e = currentEvent(s, now);
    if (!e) return '<p>This weekend\'s event has ended. The next one opens on Friday.</p>';
    const theme = eventTheme(e.week);
    const nBadges = badgeCount(e);
    const goals = BADGE_GOALS.slice(0, nBadges);
    const top = goals[goals.length - 1];
    // The bar is on a log scale so the early badges are not squashed into the first pixel.
    const pos = (v: number): number => Math.min(100, Math.max(0, (Math.log10(Math.max(1, v)) / Math.log10(top)) * 100));
    const marks = goals.map((g, i) => `<span class="ev-mark${e.claimed > i ? ' got' : ''}" style="left:${pos(g)}%"><i>${BADGE_NAMES[i]}</i></span>`).join('');
    const ready = badgeReady(e);
    const next = e.claimed < nBadges ? e.claimed : -1;
    const gens = EVENT_GENS.map((g, i) => {
      const price = eventPrice(e, i);
      const ok = e.flux >= price;
      return `<button class="ev-gen${ok ? ' ok' : ''}" data-egen="${i}" ${ok ? '' : 'aria-disabled="true"'}>
        <span class="ev-gen-ico">${icon(EVENT_ICONS[i])}</span>
        <span class="ev-gen-main"><b>${esc(g.name)}</b><span class="dim small">${fmt(g.rate)} Flux/s each</span></span>
        <span class="ev-gen-side"><span class="ev-price">${fmt(price)}</span><span class="ev-owned">${e.gens[i] ?? 0}</span></span></button>`;
    }).join('');
    const adOk = eventAdReady(e, now) && rewardedAvailable();
    return `<div class="ev-head"><div><div class="contract-kicker">Day ${eventDay(now)} of 3 · ends in ${fmtTime(eventTimeLeft(now) / 1000)}</div>
        <div class="ev-name">${esc(theme.name)}</div><div class="dim small">${esc(theme.flavor)}</div></div></div>
      <div class="ev-core">
        <button class="ev-rift" data-etap="1" aria-label="Tap the rift">${icon('rift')}</button>
        <div class="ev-flux"><div class="ev-flux-n">${fmt(e.flux)}</div><div class="dim small">Flux · ${fmt(eventRate(e))}/s · ${fmt(eventTap(e), 1)} per tap</div>
          ${adOk ? `<button class="btn btn-plain btn-small" data-ead="1">Watch ad: +${EVENT_AD_MINUTES} min of Flux</button>` : ''}</div>
      </div>
      <div class="bar ev-bar"><div class="bar-fill ev-fill" style="width:${pos(e.earned)}%"></div>${marks}</div>
      ${ready ? `<button class="btn btn-primary btn-wide" data-ebadge="1">Claim ${BADGE_NAMES[e.claimed]} badge: +${fmt(badgeReward(d, e.claimed))} Stardust${extra(e.claimed)}</button>`
        : next >= 0 ? `<p class="dim small">${BADGE_NAMES[next]} badge at ${fmt(BADGE_GOALS[next])} Flux earned (${fmt(e.earned)} so far). Pays ${BADGE_MINUTES[next] >= 60 ? `${BADGE_MINUTES[next] / 60} hours` : `${BADGE_MINUTES[next]} minutes`} of production${extra(next)}.</p>`
        : '<p class="dim small">Every badge won. See you next weekend.</p>'}
      ${e.pass ? '<p class="ev-pass-on">Event Pass active: double Flux and the Platinum badge.</p>'
        : `<button class="ev-pass" data-epass="1"><b>Event Pass · ${esc(productPrice('event_pass'))}</b><span>Double Flux this weekend and a Platinum badge worth 12 hours of production and ${PLATINUM_CRYSTALS} crystals.</span></button>`}
      <div class="ev-gens">${gens}</div>
      <p class="dim small">Flux keeps flowing while you are away and is wiped when the weekend ends. Badges are paid in Stardust.</p>`;
  };
  const el = openModal({ title: 'Weekend Event', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-etap],[data-egen],[data-ebadge],[data-ead],[data-epass]');
    if (!t || busy) return;
    if (t.dataset.epass) {
      busy = true;
      void buyProduct(ctx, 'event_pass').then(() => { busy = false; redraw(); onChange(); });
      return;
    }
    const { s, d } = ctx;
    const e = currentEvent(s);
    if (!e) { redraw(); return; }
    if (t.dataset.etap) {
      eventTapOnce(e);
      sfxTap();
      haptic('light');
    } else if (t.dataset.egen) {
      if (buyEventGen(e, Number(t.dataset.egen))) { sfxBuy(); haptic('light'); }
      else sfxDenied();
    } else if (t.dataset.ebadge) {
      const tier = e.claimed;
      const amount = claimBadge(s, d, e);
      if (!amount) return;
      sfxAchievement();
      haptic('heavy');
      toast(`<div class="t-ico">${icon('rift')}</div><div><b>${BADGE_NAMES[tier]} badge</b><br>+${fmt(amount)} Stardust${extra(tier)}</div>`, 'good', 5000);
      ctx.recalc();
      ctx.save();
      onChange();
    } else {
      busy = true;
      void showRewarded('boost the event').then((ok) => {
        busy = false;
        const live = currentEvent(ctx.s);
        if (ok && live) {
          const n = eventAdBoost(live);
          if (n) toast(`<div class="t-ico">${icon('rift')}</div><div><b>Rift surge</b><br>+${fmt(n)} Flux</div>`, 'good');
          ctx.save();
        }
        redraw();
      });
      return;
    }
    redraw();
  });
}

export function openForge(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const s = ctx.s;
    const now = Date.now();
    const heat = syncHeat(s, now);
    const max = maxHeat(s);
    const full = heatFullIn(s);
    const spells = SPELLS.map((x) => {
      const ok = heat >= x.cost;
      return `<button class="spell${ok ? ' ok' : ''}" data-spell="${x.id}" ${ok ? '' : 'disabled'}>
        <b>${esc(x.name)}</b><span class="spell-cost">${x.cost} heat</span><span class="dim">${esc(x.desc)}</span></button>`;
    }).join('');
    const canAd = stokeReady(s, now) && rewardedAvailable();
    const cool = Math.max(0, s.forgeAdAt - now);
    return `<div class="heat-head">${icon('anvil')}<div class="heat-main">
        <div class="heat-n">${Math.floor(heat)} / ${max} heat</div>
        <div class="bar"><div class="bar-fill heat-fill" style="width:${max ? (heat / max) * 100 : 0}%"></div></div>
        <div class="dim small">${full > 0 ? `Full in ${fmtTime(full / 1000)}` : 'The forge is white hot.'}</div></div></div>
      <div class="spells">${spells}</div>
      ${canAd ? `<button class="btn btn-plain btn-wide" data-stoke="1">Watch ad: refill the forge</button>` : cool > 0 ? `<p class="dim small">Stoke again in ${fmtTime(cool / 1000)}.</p>` : ''}
      <p class="dim small">Heat refills from empty in ${REFILL_MINUTES / 60} hours, even while you are away. Star Forge level ${s.genLevels[FORGE_GEN] ?? 0}: each level adds 10 heat. Forgings used: ${fmt(s.forgeCasts)}. Stoking is once every ${STOKE_COOLDOWN_HOURS} hours.</p>`;
  };
  const el = openModal({ title: 'Star Forge', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spell],[data-stoke]');
    if (!t || t.disabled || busy) return;
    if (t.dataset.spell) {
      const spell = spellById(t.dataset.spell)!;
      const r = cast(ctx.s, ctx.d, spell.id);
      if (!r.ok) { sfxDenied(); return; }
      haptic('medium');
      if (r.failed) {
        sfxDenied();
        toast(`<div class="t-ico">${icon('anvil')}</div><div><b>The melt cracked</b><br>The heat is gone. Better luck next pour.</div>`, 'info');
      } else {
        sfxAchievement();
        const detail = r.amount ? `+${fmt(r.amount)} Stardust` : esc(spell.desc);
        toast(`<div class="t-ico">${icon('anvil')}</div><div><b>${esc(spell.name)}</b><br>${detail}</div>`, 'good');
      }
      ctx.recalc();
      ctx.dirty();
      ctx.save();
      onChange();
      // Buffs and comets happen on the sky, so get out of the way.
      if (spell.id !== 'smelt') { closeModal(el); return; }
    } else {
      busy = true;
      void showRewarded('stoke the forge').then((ok) => {
        busy = false;
        if (ok && stoke(ctx.s)) {
          ctx.save();
          toast(`<div class="t-ico">${icon('anvil')}</div><div><b>Forge stoked</b><br>Heat is full again</div>`, 'good');
        }
        redraw();
        onChange();
      });
      return;
    }
    redraw();
  });
}

function sparkline(g: GoodState, rest: number): string {
  const pts = g.hist.length > 1 ? g.hist : [g.price, g.price];
  const lo = Math.min(rest, ...pts);
  const hi = Math.max(rest, ...pts);
  const span = hi - lo || 1;
  const y = (v: number): string => (28 - ((v - lo) / span) * 26).toFixed(1);
  const step = 100 / (pts.length - 1);
  const line = pts.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="100" y1="${y(rest)}" y2="${y(rest)}" class="spark-rest"/>
    <polyline points="${line}" class="spark-line ${up ? 'up' : 'down'}"/></svg>`;
}

export function openMarket(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const { s, d } = ctx;
    const now = Date.now();
    const m = syncMarket(s, now)!;
    const unit = creditValue(d);
    const hold = holdSize(s);
    const rows = GOODS.map((def, i) => {
      const g = m.goods[i];
      const prev = g.hist.length > 1 ? g.hist[g.hist.length - 2] : g.price;
      const move = g.price - prev;
      const pl = g.held ? (g.price - g.avg) * g.held : 0;
      const canBuy = maxBuy(s, d, m, i);
      const tip = m.tip === i && m.tipTicks > 0;
      return `<div class="good${tip ? ' tipped' : ''}">
        <div class="good-top">
          <div class="good-name"><b>${esc(def.name)}</b>${tip ? '<span class="good-tip">Tip</span>' : ''}<span class="dim small">rests at ${def.rest}</span></div>
          <div class="good-price ${move >= 0 ? 'up' : 'down'}">${g.price.toFixed(1)}<span>${move >= 0 ? '▲' : '▼'} ${Math.abs(move).toFixed(1)}</span></div>
        </div>
        ${sparkline(g, def.rest)}
        <div class="good-foot">
          <span class="good-held">${g.held} / ${hold}${g.held ? ` · paid ${g.avg.toFixed(1)}` : ''}${g.held ? ` · <b class="${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}${fmt(pl)}</b>` : ''}</span>
          <span class="good-btns">
            <button class="chip" data-buy="${i}" data-n="10" ${canBuy ? '' : 'disabled'}>+10</button>
            <button class="chip" data-buy="${i}" data-n="max" ${canBuy ? '' : 'disabled'}>Max</button>
            <button class="chip" data-sell="${i}" ${g.held ? '' : 'disabled'}>Sell</button>
          </span>
        </div>
      </div>`;
    }).join('');
    const canAd = tipReady(m, now) && rewardedAvailable();
    const cool = Math.max(0, m.tipAt - now);
    return `<div class="market-head">${icon('exchange')}<div>
        <div class="market-tick">Prices move in ${fmtTime(nextTickIn(m, now) / 1000)}</div>
        <div class="dim small">1 credit = 1 second of production (${fmt(unit)} Stardust)</div></div></div>
      <div class="goods">${rows}</div>
      ${canAd ? `<button class="btn btn-plain btn-wide" data-tip="1">Watch ad: get an insider tip</button>` : cool > 0 ? `<p class="dim small">Next tip in ${fmtTime(cool / 1000)}.</p>` : ''}
      <p class="dim small">Prices drift every ${TICK_MINUTES} minutes, even while you are away, and pull back toward their resting price. Warp Gate level ${s.genLevels[MARKET_GEN] ?? 0}: holds ${hold} of each good (25 more per level). A tip lifts the cheapest good for ${TIP_TICKS * TICK_MINUTES} minutes, once every ${TIP_COOLDOWN_HOURS} hours. Goods are priced from your production, so sell before you collapse. Profit so far: ${fmt(s.marketProfit)} credits.</p>`;
  };
  const el = openModal({ title: 'Warp Exchange', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy],[data-sell],[data-tip]');
    if (!t || t.disabled || busy) return;
    const { s, d } = ctx;
    if (t.dataset.buy) {
      const n = t.dataset.n === 'max' ? Infinity : Number(t.dataset.n);
      if (!buyGood(s, d, Number(t.dataset.buy), n)) { sfxDenied(); return; }
      sfxBuy();
      haptic('light');
    } else if (t.dataset.sell) {
      const i = Number(t.dataset.sell);
      const r = sellGood(s, d, i, Infinity);
      if (!r.sold) return;
      if (r.profit > 0) sfxAchievement(); else sfxTap();
      const word = r.profit >= 0 ? 'profit' : 'loss';
      toast(`<div class="t-ico">${icon('exchange')}</div><div><b>Sold ${r.sold} ${esc(GOODS[i].name)}</b><br>+${fmt(r.value)} Stardust, ${fmt(Math.abs(r.profit))} credit ${word}</div>`, r.profit > 0 ? 'good' : 'info');
    } else {
      busy = true;
      void showRewarded('get a market tip').then((ok) => {
        busy = false;
        if (ok) {
          const i = insiderTip(ctx.s);
          if (i >= 0) toast(`<div class="t-ico">${icon('exchange')}</div><div><b>Insider tip</b><br>${esc(GOODS[i].name)} is about to rise</div>`, 'good');
          ctx.save();
        }
        redraw();
      });
      return;
    }
    ctx.recalc();
    ctx.dirty();
    ctx.save();
    onChange();
    redraw();
  });
}

function passCard(ctx: Ctx): string {
  const s = ctx.s;
  const p = currentPass(s);
  const xp = passXp(s, p);
  const tier = passTier(s, p);
  const into = tier >= PASS_TIERS ? XP_PER_TIER : xp - tier * XP_PER_TIER;
  const ready = passClaimable(s);
  return `<button class="pass-card" data-pass="1">
    <div class="pass-card-head"><span class="contract-kicker">Star Pass · Season ${seasonNumber() % 100}${p.premium ? ' · Premium' : ''}</span><span class="dim small">${fmtTime(seasonTimeLeft() / 1000)} left</span></div>
    <div class="pass-card-main"><b>Tier ${tier} of ${PASS_TIERS}</b>${ready ? `<span class="pass-ready">${ready} reward${ready === 1 ? '' : 's'} ready</span>` : '<span class="dim small">Open</span>'}</div>
    <div class="bar"><div class="bar-fill pass-fill" style="width:${(into / XP_PER_TIER) * 100}%"></div></div>
  </button>`;
}

function rewardText(r: PassReward): string {
  const bits = [`${r.minutes} min`];
  if (r.crystals) bits.push(`${icon('crystal')}${r.crystals}`);
  if (r.medal) bits.push('Medal');
  if (r.skin) bits.push('Aurora skin');
  return bits.join(' · ');
}

export function openPass(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const s = ctx.s;
    const p = currentPass(s);
    const xp = passXp(s, p);
    const tier = passTier(s, p);
    const ready = passClaimable(s);
    const rows = Array.from({ length: PASS_TIERS }, (_, i) => {
      const t = i + 1;
      const reached = tier >= t;
      const cell = (premium: boolean): string => {
        const claimed = premium ? p.prem >= t : p.free >= t;
        const locked = premium && !p.premium;
        const cls = claimed ? 'got' : reached && !locked ? 'ready' : locked ? 'locked' : '';
        return `<div class="pass-cell ${cls}">${locked ? icon('lock') : ''}<span>${rewardText(passReward(t, premium))}</span></div>`;
      };
      return `<div class="pass-row${reached ? ' reached' : ''}"><div class="pass-tier">${t}</div>${cell(false)}${cell(true)}</div>`;
    }).join('');
    const ways = ([
      ['Mission', XP_RATES.missions], ['Daily drop', XP_RATES.dailies], ['Contract tier', XP_RATES.contractTiers],
      ['Event badge', XP_RATES.badges], ['Collapse', XP_RATES.collapses], ['Comet', XP_RATES.comets],
      ['Forging', XP_RATES.casts], ['Profitable sale', XP_RATES.trades], ['Harvest', XP_RATES.harvests],
    ] as Array<[string, number]>).map(([n, x]) => `<span>${n} <b>+${x}</b></span>`).join('');
    return `<div class="pass-top"><div><div class="contract-kicker">Season ends in ${fmtTime(seasonTimeLeft() / 1000)}</div>
        <div class="ev-name">Tier ${tier} of ${PASS_TIERS}</div><div class="dim small">${fmt(xp)} XP · ${XP_PER_TIER} XP per tier</div></div></div>
      <div class="pass-ways">${ways}</div>
      ${ready ? `<button class="btn btn-primary btn-wide" data-pclaim="1">Claim ${ready} reward${ready === 1 ? '' : 's'}</button>` : ''}
      ${p.premium ? '' : `<button class="ev-pass" data-pbuy="1"><b>Unlock Premium · ${esc(productPrice('star_pass'))}</b><span>A second track: double Stardust, 20 crystals, 2 Contract Medals and the Aurora skin. Tiers you already reached pay out at once.</span></button>`}
      <div class="pass-grid"><div class="pass-row pass-headrow"><div class="pass-tier">Tier</div><div>Free</div><div>Premium</div></div>${rows}</div>`;
  };
  const el = openModal({ title: 'Star Pass', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => {
    const top = body.scrollTop;
    body.innerHTML = render();
    body.scrollTop = top;
  };
  const timer = setInterval(() => { if (!busy) redraw(); }, 2000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pclaim],[data-pbuy]');
    if (!t || busy) return;
    if (t.dataset.pbuy) {
      busy = true;
      void buyProduct(ctx, 'star_pass').then(() => { busy = false; redraw(); onChange(); });
      return;
    }
    const r = claimPass(ctx.s, ctx.d);
    if (!r.tiers) return;
    if (r.skin) ctx.sky.setSkin(ctx.s.skin);
    sfxAchievement();
    haptic('heavy');
    const bits = [`+${fmt(r.stardust)} Stardust`];
    if (r.crystals) bits.push(`+${r.crystals} crystals`);
    if (r.medals) bits.push(`+${r.medals} Contract Medal${r.medals === 1 ? '' : 's'}`);
    if (r.skin) bits.push('Aurora skin unlocked');
    toast(`<div class="t-ico">${icon('trophy')}</div><div><b>${r.tiers} pass reward${r.tiers === 1 ? '' : 's'}</b><br>${bits.join(' · ')}</div>`, 'good', 6000);
    ctx.recalc();
    ctx.dirty();
    ctx.save();
    onChange();
    redraw();
  });
}

export function openMissions(ctx: Ctx, onChange: () => void): void {
  const render = (): string => {
    const { s, d } = ctx;
    const rows = s.missions.map((m, i) => {
      const done = missionDone(s, m);
      const prog = missionProgress(s, m);
      const pct = Math.min(100, (prog / m.target) * 100);
      const progText = `${fmt(prog)} / ${fmt(m.target)}`;
      return `<div class="mission ${done ? 'done' : ''}">
        <div class="mission-main">
          <div class="mission-name">${esc(describeMission(m, fmt))}</div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="mission-meta"><span>${progText}</span><span class="mission-reward"><span class="sd-dot"></span>${fmt(missionReward(d, m))}</span></div>
        </div>
        ${done ? `<button class="btn btn-primary" data-claim="${i}">Claim</button>`
          : rewardedAvailable() ? `<button class="btn btn-plain mission-swap" data-swap="${i}" aria-label="Watch an ad to swap this mission">Swap<small>ad</small></button>` : ''}
      </div>`;
    }).join('');
    return `${passCard(ctx)}${contractCard(ctx)}
      <h3 class="section-title">Missions</h3>
      <div class="missions">${rows}</div>
      <p class="dim small">Missions completed: ${fmt(s.missionsDone)}</p>`;
  };
  const el = openModal({ title: 'Goals', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-claim],[data-swap],[data-contract],[data-pass]');
    if (!t || busy) return;
    if (t.dataset.pass) {
      openPass(ctx, () => { redraw(); onChange(); });
      return;
    }
    if (t.dataset.contract) {
      const r = claimContract(ctx.s, ctx.d);
      if (!r) return;
      sfxAchievement();
      haptic(r.medal ? 'heavy' : 'medium');
      ctx.sky.floatCenter(`+${fmt(r.amount)}`, '#ffcf5a', 30);
      if (r.medal) ctx.recalc();
      toast(`<div class="t-ico">${icon('trophy')}</div><div><b>${r.medal ? 'Contract Medal won!' : `Contract tier ${r.tier + 1} reached`}</b><br>+${fmt(r.amount)} Stardust${r.medal ? ` · +${fmtPercent(MEDAL_PCT)} production forever` : ''}</div>`, 'trophy', 4500);
      ctx.save();
      redraw();
      onChange();
      return;
    }
    if (t.dataset.claim) {
      const amount = claimMission(ctx.s, ctx.d, Number(t.dataset.claim));
      if (amount <= 0) return;
      sfxAchievement();
      haptic('medium');
      ctx.sky.floatCenter(`+${fmt(amount)}`, '#ffcf5a', 28);
      toast(`<div class="t-ico">${icon('mission')}</div><div><b>Mission complete</b><br>+${fmt(amount)} Stardust</div>`, 'good');
      ctx.save();
      redraw();
      onChange();
    } else if (t.dataset.swap) {
      busy = true;
      const i = Number(t.dataset.swap);
      void showRewarded('swap a mission').then((ok) => {
        busy = false;
        if (ok) {
          swapMission(ctx.s, ctx.d, i);
          ctx.s.adsWatched++;
          ctx.save();
          onChange();
        }
        redraw();
      });
    }
  });
}

export function openDaily(ctx: Ctx, onClaim: () => void): void {
  const { s, d } = ctx;
  const day = nextStreakDay(s);
  const cells = [1, 2, 3, 4, 5, 6, 7].map((n) => `
    <div class="day ${n < day ? 'done' : n === day ? 'today' : ''}">
      <div class="day-n">Day ${n}</div>${icon(n === 7 ? 'gift' : 'comet')}<div class="day-r">${rewardMinutes(n) >= 60 ? rewardMinutes(n) / 60 + 'h' : rewardMinutes(n) + 'm'}</div>
    </div>`).join('');
  openModal({
    title: 'Daily supply drop',
    body: `<p class="dim">Come back every day to keep your streak. Each reward is worth minutes of production.</p>
      <div class="days">${cells}</div>
      <p class="daily-amount">Today: <span class="sd-dot"></span><b>${fmt(dailyReward(s, d, day))}</b> Stardust</p>`,
    buttons: [
      { label: 'Claim', kind: rewardedAvailable() ? 'plain' : 'primary', onClick: () => claim(1) },
      ...(rewardedAvailable() ? [{
        label: 'Watch ad: x2', kind: 'primary' as const, onClick: () => {
          void showRewarded('double today\'s supply drop').then((ok) => {
            if (!ok) return;
            ctx.s.adsWatched++;
            claim(2);
          });
        },
      }] : []),
    ],
  });

  function claim(mult: number): void {
    const r = claimDaily(ctx.s, ctx.d);
    if (!r) return;
    if (mult > 1) earn(ctx.s, r.amount * (mult - 1));
    const total = r.amount * mult;
    sfxAchievement();
    haptic('medium');
    ctx.sky.floatCenter(`+${fmt(total)}`, '#ffcf5a', 30);
    toast(`<div class="t-ico">${icon('gift')}</div><div><b>Day ${r.day} claimed${mult > 1 ? ' x2' : ''}</b><br>+${fmt(total)} Stardust · streak ${r.streak}</div>`, 'good');
    ctx.save();
    onClaim();
  }
}

export function fmtBuffPct(mult: number): string {
  return fmtPercent(mult - 1);
}
