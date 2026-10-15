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
