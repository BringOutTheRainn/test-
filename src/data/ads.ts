// Ad settings. These are Google's public AdMob test IDs, which always show
// test ads. Replace them with your own IDs from the AdMob console before
// release (and set ADMOB_APP_ID for the Android build, see docs/RELEASE.md).

export const AD_CONFIG = {
  enabled: true,
  /** Show a banner above the tab bar. Off by default: it costs screen space. */
  banner: false,
  /** Use test ads. Must be true until your AdMob account is approved. */
  testing: true,
  android: {
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    banner: 'ca-app-pub-3940256099942544/9214589741',
  },
  ios: {
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    banner: 'ca-app-pub-3940256099942544/2435281174',
  },
  /** Hyperdrive: a rewarded ad doubles production for this long, stacking up to the cap. */
  hyperMinutes: 120,
  hyperCapMinutes: 480,
  /** Full-screen ads: at most one per this many minutes, never in the first minutes of play. */
  interstitialGapMinutes: 8,
  interstitialAfterPlayMinutes: 20,
};
