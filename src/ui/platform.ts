// Small wrappers over phone features. Inside the Capacitor app the native
// plugins are used; in a browser they fall back to web APIs or do nothing.

interface CapPlugin {
  addListener?: (event: string, cb: (...args: unknown[]) => void) => unknown;
  [method: string]: unknown;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, CapPlugin>;
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function plugin(name: string): CapPlugin | undefined {
  return cap()?.Plugins?.[name];
}

export function isNative(): boolean {
  return !!cap()?.isNativePlatform?.();
}

let vibrationOn = true;
export function setVibration(on: boolean): void {
  vibrationOn = on;
}

export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!vibrationOn) return;
  const h = plugin('Haptics');
  if (h && typeof h.impact === 'function') {
    (h.impact as (o: { style: string }) => Promise<void>)({ style: kind.toUpperCase() }).catch(() => undefined);
    return;
  }
  if (navigator.vibrate) navigator.vibrate(kind === 'light' ? 8 : kind === 'medium' ? 20 : 45);
}

/** Android back button. The handler returns true when it handled the press. */
export function onBackButton(handler: () => boolean): void {
  const app = plugin('App');
  if (app?.addListener) {
    app.addListener('backButton', () => {
      if (!handler() && typeof app.minimizeApp === 'function') (app.minimizeApp as () => void)();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') handler();
  });
}

/** Called when the app goes to the background or comes back. */
export function onPause(pause: () => void, resume: () => void): void {
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  window.addEventListener('pagehide', pause);
  const app = plugin('App');
  app?.addListener?.('appStateChange', (state: unknown) => {
    if ((state as { isActive: boolean }).isActive) resume();
    else pause();
  });
}

export function hideSplash(): void {
  const s = plugin('SplashScreen');
  if (s && typeof s.hide === 'function') (s.hide as () => Promise<void>)().catch(() => undefined);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
