// Local notifications through @capacitor/local-notifications. Phones only;
// in a browser every call quietly does nothing.

import type { Reminder } from '../core/notify.js';
import { isNative } from './platform.js';

interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  schedule(o: { notifications: Array<{ id: number; title: string; body: string; schedule: { at: Date } }> }): Promise<unknown>;
  cancel(o: { notifications: Array<{ id: number }> }): Promise<void>;
}

const IDS = [1, 2, 3, 4];

function plugin(): LocalNotificationsPlugin | undefined {
  if (!isNative()) return undefined;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.Plugins?.LocalNotifications as LocalNotificationsPlugin | undefined;
}

export function notificationsSupported(): boolean {
  return !!plugin();
}

/** Asks the system for permission. Resolves true when granted. */
export async function requestNotifications(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const now = await p.checkPermissions();
    if (now.display === 'granted') return true;
    return (await p.requestPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleReminders(list: Reminder[]): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: IDS.map((id) => ({ id })) });
    if (!list.length) return;
    await p.schedule({ notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: new Date(r.at) } })) });
  } catch {
    /* notifications are a nice-to-have */
  }
}

export async function clearReminders(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: IDS.map((id) => ({ id })) });
  } catch {
    /* ignore */
  }
}
