// Ads. In the app this drives Google AdMob through the Capacitor AdMob plugin
// (@capacitor-community/admob). In a browser it shows a stand-in ad so every
// placement can be tried without an ad account.

import { AD_CONFIG } from '../data/ads.js';
import { esc, openModal, closeModal } from './dom.js';
import { isNative } from './platform.js';
import { suspendAudio, resumeAudio } from './audio.js';

interface AdMobPlugin {
  initialize(o: { initializeForTesting?: boolean }): Promise<void>;
  requestConsentInfo?(): Promise<{ status: string; isConsentFormAvailable?: boolean }>;
  showConsentForm?(): Promise<unknown>;
  prepareRewardVideoAd(o: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showRewardVideoAd(): Promise<{ type: string; amount: number } | undefined>;
  prepareInterstitial(o: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showInterstitial(): Promise<void>;
  showBanner(o: { adId: string; adSize: string; position: string; margin?: number; isTesting?: boolean }): Promise<void>;
  removeBanner(): Promise<void>;
}

function admob(): AdMobPlugin | undefined {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.Plugins?.AdMob as AdMobPlugin | undefined;
}

function ids(): typeof AD_CONFIG.android {
  const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  return platform === 'ios' ? AD_CONFIG.ios : AD_CONFIG.android;
}

let ready = false;
let rewardedLoaded = false;
let interstitialLoaded = false;

let initing: Promise<void> | null = null;

/** Starts the ad SDK once. Later callers share the same promise. */
export function initAds(): Promise<void> {
  if (!initing) initing = startAds();
  return initing;
}

async function startAds(): Promise<void> {
  if (!AD_CONFIG.enabled) return;
  const ad = admob();
  if (!isNative() || !ad) {
    ready = true;
    return;
  }
  try {
    await ad.initialize({ initializeForTesting: AD_CONFIG.testing });
    // Ask for consent where the law requires it (EEA and UK).
    const info = await ad.requestConsentInfo?.();
    if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') await ad.showConsentForm?.();
    ready = true;
    void preloadRewarded();
    void preloadInterstitial();
  } catch (e) {
    console.warn('Ads unavailable', e);
  }
}

async function preloadRewarded(): Promise<void> {
  const ad = admob();
  if (!ad) return;
  try {
    await ad.prepareRewardVideoAd({ adId: ids().rewarded, isTesting: AD_CONFIG.testing });
    rewardedLoaded = true;
  } catch {
    rewardedLoaded = false;
  }
}

async function preloadInterstitial(): Promise<void> {
  const ad = admob();
  if (!ad) return;
  try {
    await ad.prepareInterstitial({ adId: ids().interstitial, isTesting: AD_CONFIG.testing });
    interstitialLoaded = true;
  } catch {
    interstitialLoaded = false;
  }
}

/** Is a rewarded ad worth offering right now? */
export function rewardedAvailable(): boolean {
  if (!AD_CONFIG.enabled) return false;
  // Offered before the SDK finishes starting; showRewarded waits for it.
  return !isNative() || !!admob();
}

/**
 * Shows a rewarded ad. Resolves true only when the player watched it to the
 * end, so the caller should grant the reward only then.
 */
export async function showRewarded(what: string): Promise<boolean> {
  if (!rewardedAvailable()) return false;
  await initAds();
  if (!ready) return false;
  const ad = admob();
  if (isNative() && ad) {
    if (!rewardedLoaded) await preloadRewarded();
    if (!rewardedLoaded) return false;
    rewardedLoaded = false;
    suspendAudio();
    try {
      const reward = await ad.showRewardVideoAd();
      return !!reward;
    } catch {
      return false;
    } finally {
      resumeAudio();
      void preloadRewarded();
    }
  }
  return webAd(`Rewarded ad: ${what}`, 5, true);
}

/** Shows a full-screen ad if one is loaded. Never blocks the game for long. */
export async function showInterstitial(): Promise<void> {
  if (!AD_CONFIG.enabled || !ready) return;
  const ad = admob();
  if (isNative() && ad) {
    if (!interstitialLoaded) return void preloadInterstitial();
    interstitialLoaded = false;
    suspendAudio();
    try {
      await ad.showInterstitial();
    } catch {
      /* no fill */
    } finally {
      resumeAudio();
      void preloadInterstitial();
    }
    return;
  }
  await webAd('Full-screen ad', 3, false);
}

export async function setBanner(on: boolean): Promise<void> {
  const ad = admob();
  document.body.classList.toggle('has-banner', on);
  if (!isNative() || !ad) return;
  try {
    if (on) await ad.showBanner({ adId: ids().banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: AD_CONFIG.testing });
    else await ad.removeBanner();
  } catch {
    /* banner is optional */
  }
}

/** Browser stand-in: a countdown card in place of a real ad. */
function webAd(label: string, seconds: number, rewarded: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    let left = seconds;
    let done = false;
    const el = openModal({
      title: 'Ad',
      dismissable: false,
      body: `<div class="fake-ad"><div class="fake-ad-tag">Stand-in ad</div><p>${esc(label)}</p>
        <p class="dim">In the app a real ad plays here. This placeholder lets you try the flow in a browser.</p>
        <div class="fake-ad-count" id="ad-count">${left}</div></div>`,
      buttons: [{
        label: rewarded ? 'Skip (no reward)' : 'Close',
        onClick: () => {
          if (!done) {
            done = true;
            clearInterval(timer);
            resolve(!rewarded);
          }
        },
      }],
    });
    const timer = setInterval(() => {
      left--;
      const c = el.querySelector('#ad-count');
      if (c) c.textContent = String(Math.max(0, left));
      if (left <= 0 && !done) {
        done = true;
        clearInterval(timer);
        closeModal(el);
        resolve(true);
      }
    }, 1000);
  });
}
