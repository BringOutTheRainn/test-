// Phone features. Inside the Capacitor app the native plugins are used;
// in a browser these fall back to web APIs or do nothing.

function capPlugin(name: string): any {
  const cap = (window as any).Capacitor;
  return cap && cap.Plugins ? cap.Plugins[name] : undefined;
}

function hapticTap(ms: number) {
  const h = capPlugin('Haptics');
  if (h && typeof h.impact === 'function') {
    h.impact({ style: ms >= 30 ? 'HEAVY' : ms >= 15 ? 'MEDIUM' : 'LIGHT' }).catch(() => undefined);
    return;
  }
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch { /* ignore */ }
}

// Android back button: the handler returns true when it closed something; otherwise the app minimises.
function onBackButton(handler: () => boolean) {
  const app = capPlugin('App');
  if (app && app.addListener) {
    app.addListener('backButton', () => {
      if (!handler() && typeof app.minimizeApp === 'function') app.minimizeApp();
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') handler(); });
}

function hideSplash() {
  const s = capPlugin('SplashScreen');
  if (s && typeof s.hide === 'function') s.hide().catch(() => undefined);
}

// Local notifications (phone only): a few gentle reminders while the app is closed.
const REMINDER_IDS = [1, 2, 3, 4, 5, 6];

function askReminderPermission() {
  const ln = capPlugin('LocalNotifications');
  if (ln && typeof ln.requestPermissions === 'function') ln.requestPermissions().catch(() => undefined);
}

function cancelReminders() {
  const ln = capPlugin('LocalNotifications');
  if (ln && typeof ln.cancel === 'function') ln.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) }).catch(() => undefined);
}

async function scheduleReminders(list: Reminder[]) {
  const ln = capPlugin('LocalNotifications');
  if (!ln || typeof ln.schedule !== 'function' || list.length === 0) return;
  try {
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted') return;
    await ln.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
    await ln.schedule({ notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true } })) });
  } catch { /* reminders are a nice-to-have */ }
}
