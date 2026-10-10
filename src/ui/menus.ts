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
import { rewardedAvailable, showRewarded } from './ads.js';
import { earn } from '../core/economy.js';
import { AD_CONFIG } from '../data/ads.js';
import { grantHyper, hyperCanStack, hyperRemainingMs } from '../core/ads.js';

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
  });
}

export function openHyperdrive(ctx: Ctx): void {
  const left = hyperRemainingMs(ctx.s);
  const can = hyperCanStack(ctx.s);
  openModal({
    title: 'Hyperdrive',
    body: `<div class="offline"><div class="big-ico">${icon('probe')}</div>
      <p>Watch a short ad to <b>double all production for ${AD_CONFIG.hyperMinutes / 60} hours</b>. It keeps running while you are away and stacks up to ${AD_CONFIG.hyperCapMinutes / 60} hours.</p>
      ${left > 0 ? `<p class="dim">Active: ${fmtTime(left / 1000)} left.</p>` : ''}
      ${can ? '' : '<p class="dim">Hyperdrive is fully charged. Come back when it runs lower.</p>'}</div>`,
    buttons: can && rewardedAvailable() ? [
      { label: 'Not now' },
      {
        label: 'Watch ad', kind: 'primary', onClick: () => {
          void showRewarded('Hyperdrive: double production').then((ok) => {
            if (!ok) return;
            grantHyper(ctx.s);
            ctx.recalc();
            ctx.save();
            sfxAchievement();
            haptic('medium');
            toast(`<div class="t-ico">${icon('probe')}</div><div><b>Hyperdrive engaged</b><br>Production x2 for ${fmtTime(hyperRemainingMs(ctx.s) / 1000)}</div>`, 'good');
          });
        },
      },
    ] : [{ label: 'Close', kind: 'primary' }],
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
