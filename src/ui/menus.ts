// Modal screens: stats, settings, offline earnings and the daily reward.

import { ACHIEVEMENTS } from '../data/achievements.js';
import { GENERATORS } from '../data/generators.js';
import { UPGRADES } from '../data/upgrades.js';
import { claimDaily, dailyReward, nextStreakDay, rewardMinutes } from '../core/daily.js';
import { fmt, fmtLong, fmtPercent, fmtRate, fmtTime, setNumberStyle } from '../core/format.js';
import { exportSave, importSave } from '../core/save.js';
import { achievementCount, newState, totalGenerators, upgradeCount } from '../core/state.js';
import { setMusic, setSound, sfxAchievement } from './audio.js';
import type { Ctx } from './ctx.js';
import { closeModal, confirmModal, esc, openModal, toast } from './dom.js';
import { icon } from './icons.js';
import { copyText, haptic, setVibration } from './platform.js';
import { notificationsSupported, requestNotifications } from './notify.js';
import { rewardedAvailable, showRewarded } from './ads.js';
import { BUFF_MULT, earn } from '../core/economy.js';
import { AD_CONFIG } from '../data/ads.js';
import { frenzyCooldown, frenzyReady, grantFrenzy, grantHyper, hyperCanStack, hyperRemainingMs } from '../core/ads.js';
import { claimContract, contractClaimable, contractProgress, contractTimeLeft, currentContract, MEDAL_PCT, tierReward } from '../core/contracts.js';
import { AD_SPEEDUP_HOURS, CRYSTAL_HOURS, LEVEL_PCT, crystalProgress, levelCost, levelUp, speedUpCrystal } from '../core/crystals.js';
import { GENERATORS as GENS } from '../data/generators.js';
import { generatorVisible } from '../core/economy.js';
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

export function openHyperdrive(ctx: Ctx): void {
  const render = (): string => {
    const s = ctx.s;
    const left = hyperRemainingMs(s);
    const can = hyperCanStack(s) && rewardedAvailable();
    const frenzyOn = s.buffs.find((b) => b.kind === 'frenzy');
    const wait = frenzyCooldown(s);
    const frenzyText = ctx.d.noTaps ? 'Not available while tapping is disabled.'
      : frenzyOn ? `Active: ${Math.ceil(frenzyOn.endsAt - s.time)}s left.`
      : wait > 0 ? `Recharging: ${fmtTime(wait)}.` : '';
    return `<div class="boosts">
      <div class="boost">
        <div class="boost-ico">${icon('probe')}</div>
        <div class="boost-main"><b>Hyperdrive</b>
          <p>Double all production for ${AD_CONFIG.hyperMinutes / 60} hours. Keeps running while you are away and stacks up to ${AD_CONFIG.hyperCapMinutes / 60} hours.</p>
          ${left > 0 ? `<p class="dim small">Active: ${fmtTime(left / 1000)} left.</p>` : ''}
          ${hyperCanStack(s) ? '' : '<p class="dim small">Fully charged. Come back when it runs lower.</p>'}</div>
        <button class="btn ${can ? 'btn-primary' : 'btn-plain'}" data-boost="hyper" ${can ? '' : 'disabled'}>Watch ad</button>
      </div>
      <div class="boost">
        <div class="boost-ico">${icon('tap')}</div>
        <div class="boost-main"><b>Tap Frenzy</b>
          <p>For ${AD_CONFIG.frenzySeconds} seconds, probes tap ${AD_CONFIG.frenzyTapsPerSecond} times a second and every tap is worth x${BUFF_MULT.frenzy}.</p>
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
  body.addEventListener('click', (e) => {
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
        <div class="lvl-main"><b>${esc(g.name)}</b><span class="dim small">${lvl ? `Level ${lvl} · +${fmtPercent(lvl * LEVEL_PCT)} production` : 'Not levelled yet'}</span></div>
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
      if (!levelUp(ctx.s, Number(t.dataset.level))) return;
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
    return `${contractCard(ctx)}
      <h3 class="section-title">Missions</h3>
      <div class="missions">${rows}</div>
      <p class="dim small">Missions completed: ${fmt(s.missionsDone)}</p>`;
  };
  const el = openModal({ title: 'Missions', body: render(), onClose: () => clearInterval(timer) });
  const body = el.querySelector<HTMLElement>('.modal-body')!;
  let busy = false;
  const redraw = (): void => { body.innerHTML = render(); };
  const timer = setInterval(() => { if (!busy) redraw(); }, 1000);
  body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-claim],[data-swap],[data-contract]');
    if (!t || busy) return;
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
