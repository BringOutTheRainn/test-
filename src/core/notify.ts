// Reminders scheduled when the app goes to the background. Only real events
// get a notification, at most one of each kind, so they stay welcome.

import { AD_CONFIG } from '../data/ads.js';
import { dailyReady, dayNumber } from './daily.js';
import type { Derived } from './economy.js';
import type { GameState } from './state.js';

export interface Reminder {
  /** Stable id per kind, so rescheduling replaces rather than duplicates. */
  id: number;
  at: number;
  title: string;
  body: string;
}

const MIN_DELAY = 10 * 60000;
/** Daily reminders go out at this local hour. */
const DAILY_HOUR = 18;

/** Next local time at the given hour that is on or after `from`. */
function nextLocalHour(from: number, hour: number): number {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() < from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function planReminders(s: GameState, d: Derived, now = Date.now()): Reminder[] {
  const out: Reminder[] = [];
  if (d.baseSps > 0) {
    out.push({
      id: 1,
      at: now + d.offlineCapHours * 3600000,
      title: 'Storage full',
      body: `Your empire has stored ${d.offlineCapHours} hours of Stardust and stopped collecting. Come empty it.`,
    });
  }
  if (AD_CONFIG.enabled && s.hyperEndsAt > now) {
    out.push({ id: 2, at: s.hyperEndsAt, title: 'Hyperdrive ended', body: 'Production is back to normal speed. Engage Hyperdrive again?' });
  }
  const back = s.expeditions.map((e) => e.returnsAt).filter((t) => t > now);
  if (back.length) {
    out.push({ id: 3, at: Math.min(...back), title: 'Probe returned', body: 'An expedition is back with loot. Open it before you send the next one.' });
  }
  // Daily drop: remind the evening of the next day it is ready.
  const readyAt = dailyReady(s, now) ? now : nextLocalHour(now, 0);
  const streakNote = s.dailyStreak > 1 && s.dailyLastDay >= dayNumber(now) - 1 ? ` Keep your ${s.dailyStreak} day streak going.` : '';
  out.push({ id: 4, at: nextLocalHour(Math.max(readyAt, now + MIN_DELAY), DAILY_HOUR), title: 'Daily supply drop', body: `A free supply drop is waiting.${streakNote}` });
  return out.filter((r) => r.at - now >= MIN_DELAY).sort((a, b) => a.at - b.at);
}
