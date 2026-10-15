// Rewarded ads. On a phone build with the AdMob plugin this shows a real rewarded video;
// in the browser it plays a short stand-in so every reward flow can be tried.

const ADS = {
  // Google's public test unit; swap in the real one (and set testing to false) before release.
  rewardedId: 'ca-app-pub-3940256099942544/5224354917',
  testing: true,
  standInSeconds: 5,
};

function admob(): any {
  const cap = (window as any).Capacitor;
  return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.AdMob;
}

let admobReady: Promise<void> | null = null;

async function showRewardedAd(): Promise<boolean> {
  const plugin = admob();
  if (plugin) {
    try {
      if (!admobReady) admobReady = plugin.initialize({ initializeForTesting: ADS.testing });
      await admobReady;
      await plugin.prepareRewardVideoAd({ adId: ADS.rewardedId, isTesting: ADS.testing });
      const reward = await plugin.showRewardVideoAd();
      return !!reward;
    } catch (e) {
      console.warn('Rewarded ad failed', e);
      return false;
    }
  }
  return standInAd();
}

// A full-screen countdown standing in for a video ad in the browser.
function standInAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'adbreak';
    let left = ADS.standInSeconds;
    box.innerHTML = `<div class="adcard"><small>Sponsored break (test ad)</small><b class="adcount">${left}</b><p>Your reward arrives when the timer ends.</p><button class="act ghost">Skip and lose the reward</button></div>`;
    document.body.appendChild(box);
    const count = box.querySelector('.adcount') as HTMLElement;
    const timer = setInterval(() => {
      left -= 1;
      count.textContent = String(left);
      if (left <= 0) { clearInterval(timer); box.remove(); resolve(true); }
    }, 1000);
    box.querySelector('button')!.addEventListener('click', () => { clearInterval(timer); box.remove(); resolve(false); });
  });
}
