// The app: DOM panels, input, saving and the main loop.

const SAVE_KEY = 'fathom.save';
const rng = () => Math.random();

// The player's local calendar date, YYYY-MM-DD.
// The next 6 pm local time after now (for the gift reminder).
function nextEvening(now: number): number {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= now + 15 * 60e3) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Tab = 'colony' | 'depths' | 'logbook' | 'migrate' | 'stats';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

class App {
  s: State;
  scene!: Scene;
  tab: Tab = 'colony';
  panelKey = '';
  last = performance.now();
  lastSave = Date.now();
  lastRefresh = 0;
  shownPearls = 0;
  readyRequests = 0;
  newsIdx = 0;
  newsAt = 0;
  offline: { seconds: number; pearls: number } | null = null;

  constructor() {
    this.s = this.load();
    this.offline = applyOffline(this.s, Date.now());
    this.shownPearls = this.s.pearls;
    this.build();
    checkAchievements(this.s);
    if (this.offline.seconds > 0 && this.offline.pearls > 0) this.showOffline(this.offline);
    else if (this.s.stats.taps === 0) this.showIntro();
    requestAnimationFrame(() => this.frame());
    setInterval(() => this.save(), 10e3);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(); this.planReminders(); }
      else {
        cancelReminders();
        const off = applyOffline(this.s, Date.now());
        if (off.pearls > 0) this.showOffline(off);
      }
    });
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('resize', () => this.scene.resize());
    onBackButton(() => {
      const m = $('#modal');
      if (!m.hidden) { m.hidden = true; return true; }
      if (this.tab !== 'colony') { this.tab = 'colony'; this.panelKey = ''; this.renderPanel(); return true; }
      this.save();
      return false;
    });
    hideSplash();
    cancelReminders();
    if (spawningActive(Date.now())) setTimeout(() => this.toast('<b>The coral is spawning!</b> Visitors come twice as often and leave double Hearts.'), 1500);
  }

  planReminders() {
    const s = this.s, now = Date.now();
    if (!s.settings.reminders) return;
    const evening = nextEvening(now);
    scheduleReminders(reminderPlan(s, now, evening, localDay(evening)));
  }

  load(): State {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (text) return deserialize(text, Date.now());
    } catch (e) { console.warn('Could not load save', e); }
    return newState(Date.now());
  }

  save() {
    this.s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, serialize(this.s)); } catch { /* storage may be unavailable */ }
  }

  // ---------- Layout ----------

  build() {
    const app = $('#app');
    app.innerHTML = `
      <header id="top">
        <div class="bank">
          <div class="pearls"><span class="ico">${ICON_PEARL}</span><b id="pearls">0</b></div>
          <div class="pps"><span id="pps">0</span> per second</div>
        </div>
        <button id="tide" class="chip" aria-label="Tide"></button>
        <button id="gear" class="icon-btn" aria-label="Settings">⚙</button>
      </header>
      <section id="stage">
        <canvas id="scene"></canvas>
        <div id="depth-tag"></div>
        <button id="gift" class="gift" aria-label="Daily Tide Gift"></button>
        <button id="requests" class="requests" aria-label="Reef Requests"></button>
        <button id="subchip" class="subchip" aria-label="Submarine" hidden></button>
        <button id="geyser" class="geyser" aria-label="Geyser" hidden></button>
        <button id="surge" class="surge" aria-label="Current Surge" hidden></button>
        <div id="boosts"></div>
        <div id="combo"><div class="fill"></div><span>Combo x1.00</span></div>
        <div id="ticker"></div>
      </section>
      <nav id="tabs">
        <button data-tab="colony">Colony</button>
        <button data-tab="depths">Depths<i class="dot" id="dot-depths"></i></button>
        <button data-tab="logbook">Logbook</button>
        <button data-tab="migrate">Migrate<i class="dot" id="dot-migrate"></i></button>
        <button data-tab="stats">Stats</button>
      </nav>
      <main id="panel"></main>
      <div id="toast"></div>
      <div id="modal" hidden></div>`;
    this.scene = new Scene($('#scene') as HTMLCanvasElement);
    const canvas = $('#scene');
    canvas.addEventListener('pointerdown', (e) => this.onTap(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
      this.tab = (b as HTMLElement).dataset.tab as Tab;
      this.panelKey = '';
      this.renderPanel();
    }));
    $('#gear').addEventListener('click', () => this.showSettings());
    $('#gift').addEventListener('click', () => this.showGift());
    $('#requests').addEventListener('click', () => this.showRequests());
    $('#subchip').addEventListener('click', () => { this.tab = 'depths'; this.panelKey = ''; this.renderPanel(); });
    $('#surge').addEventListener('click', () => this.showSurge());
    $('#geyser').addEventListener('click', () => {
      const now = Date.now();
      if (startGeyser(this.s, now)) {
        if (this.s.settings.sound) playWhale();
        this.vibrate(40);
        this.scene.announce('Geyser!', '#9ff7ff');
      } else if (!geyserActive(this.s, now)) {
        this.toast(`The geyser is building pressure: ready in ${fmtTime((this.s.geyser.readyAt - now) / 1000)}.`);
      }
    });
    $('#tide').addEventListener('click', () => this.toast(isHighTide(this.s, Date.now())
      ? 'High tide: taps x3. Tap while it lasts!' : 'Low tide: your colony produces +25%.'));
    this.renderPanel();
  }

  onTap(e: PointerEvent) {
    e.preventDefault();
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const now = Date.now();
    if (this.scene.hitVisitor(this.s, x, y, now)) {
      const res = catchVisitor(this.s, now, rng);
      if (res) {
        if (this.s.settings.sound) (res.kind === 'whale' ? playWhale : playChime)();
        this.vibrate(30);
        this.scene.announce(res.title, res.kind === 'whale' ? '#bfe3ff' : '#ffd84a');
        this.toast(`<b>${res.title}</b> ${res.text} +${res.kind === 'whale' ? 3 : 1} ❤`);
      }
      return;
    }
    const v = tap(this.s, now);
    const high = isHighTide(this.s, now);
    this.scene.tapAt(x, y, '+' + fmt(v, this.s.settings.sci), high ? '#9ff7ff' : '#ffffff');
    if (this.s.settings.sound) playBubble(1 + this.s.combo / 100);
    if (this.s.settings.sound && this.s.settings.ambience) startAmbient(this.s.zone);
    this.vibrate(8);
  }

  vibrate(ms: number) {
    if (this.s.settings.vibrate) hapticTap(ms);
  }

  // ---------- Loop ----------

  frame() {
    const t = performance.now();
    const dt = Math.min(0.25, (t - this.last) / 1000);
    this.last = t;
    const now = Date.now();
    rollDaily(this.s, localDay(now));
    rollAds(this.s, localDay(now));
    setAmbientDepth(this.s.zone);
    const auto = tick(this.s, now, dt * 1000, rng);
    auto.sprouted.forEach((id) => {
      const c = CORAL_BY_ID[id];
      this.scene.announce(c.name, c.color);
      this.toast(`<b>Reef garden:</b> two corals cross-bred into ${c.name}!`);
      if (this.s.settings.sound) playChime();
    });
    for (let k = 0; k < auto.autoTaps; k++) {
      const sc = this.scene;
      sc.tapAt(sc.clamX + (Math.random() - 0.5) * sc.clamR * 1.6, sc.clamY - sc.clamR * 0.3, '+' + fmt(auto.autoPearls / auto.autoTaps, this.s.settings.sci), '#9ff7ff');
    }
    this.scene.draw(this.s, now, dt);
    this.updateHud(now, dt);
    if (t - this.lastRefresh > 250) {
      this.lastRefresh = t;
      const got = checkAchievements(this.s);
      got.forEach((a) => this.toast(`<b>Logbook:</b> ${a.name}`));
      const ready = requestsReady(this.s);
      if (ready > this.readyRequests) this.toast('<b>Reef Request done!</b> Tap 📜 to claim it.');
      this.readyRequests = ready;
      this.refreshPanel();
    }
    requestAnimationFrame(() => this.frame());
  }

  updateHud(now: number, dt: number) {
    const s = this.s, sci = s.settings.sci;
    const diff = s.pearls - this.shownPearls;
    this.shownPearls = Math.abs(diff) < 1 ? s.pearls : this.shownPearls + diff * Math.min(1, dt * 10);
    $('#pearls').textContent = fmt(this.shownPearls, sci);
    $('#pps').textContent = fmt(pps(s, now), sci);
    const high = isHighTide(s, now);
    const tide = $('#tide');
    tide.className = 'chip ' + (high ? 'high' : 'low');
    tide.innerHTML = `${high ? '🌊 High tide' : '〰 Low tide'} <small>${fmtTime(tideTimeLeft(s, now) / 1000)}</small>`;
    const cap = comboCap(s);
    const fill = $('#combo .fill');
    fill.style.width = `${(s.combo / cap) * 100}%`;
    ($('#combo span') as HTMLElement).textContent = `Combo x${comboMult(s).toFixed(2)}`;
    $('#combo').classList.toggle('full', s.combo >= cap - 0.01);
    $('#combo').classList.toggle('idle', s.combo <= 0.01);
    const gift = $('#gift');
    const claimed = s.daily.claimedDay === s.daily.day;
    const giftHtml = claimed ? `🎁 Day ${s.daily.streak} claimed`
      : dailyReady(s) ? '🎁 Tide Gift ready!' : `🎁 Gift ${Math.min(s.daily.taps, DAILY_TAPS)}/${DAILY_TAPS} taps`;
    if (gift.innerHTML !== giftHtml) gift.innerHTML = giftHtml;
    gift.classList.toggle('ready', dailyReady(s));
    gift.classList.toggle('done', claimed);
    const rq = $('#requests');
    const ready = requestsReady(s);
    const rqHtml = ready > 0 ? `📜 ${ready} request${ready > 1 ? 's' : ''} done!` : `📜 Requests ${s.requests.done}`;
    if (rq.innerHTML !== rqHtml) rq.innerHTML = rqHtml;
    rq.classList.toggle('ready', ready > 0);
    const sc = $('#subchip');
    sc.hidden = !subUnlocked(s);
    const back = subBack(s, now);
    const scHtml = back ? '🚢 Sub is back!' : s.sub.dive >= 0 ? `🚢 Diving ${fmtTime((s.sub.until - now) / 1000)}` : '🚢 Sub docked';
    if (sc.innerHTML !== scHtml) sc.innerHTML = scHtml;
    sc.classList.toggle('ready', back);
    const su = $('#surge');
    su.hidden = !surgeUnlocked(s);
    const suHtml = surgesLeft(s) > 0 ? `<b>x2 ▶</b><small>${surgesLeft(s)} left today</small>` : '<b>x2</b><small>back tomorrow</small>';
    if (su.innerHTML !== suHtml) su.innerHTML = suHtml;
    su.classList.toggle('spent', surgesLeft(s) <= 0);
    const gy = $('#geyser');
    gy.hidden = !geyserUnlocked(s);
    const gActive = geyserActive(s, now), gReady = geyserReady(s, now);
    const gyHtml = gActive ? `<b>${Math.ceil((s.geyser.until - now) / 1000)}s</b><small>erupting</small>`
      : gReady ? '<b>Geyser</b><small>tap to erupt</small>' : `<b>${fmtTime((s.geyser.readyAt - now) / 1000)}</b><small>recharging</small>`;
    if (gy.innerHTML !== gyHtml) gy.innerHTML = gyHtml;
    gy.className = 'geyser' + (gActive ? ' active' : gReady ? ' ready' : '');
    $('#depth-tag').textContent = `${ZONES[s.zone].name} · ${ZONES[s.zone].depth.toLocaleString('en-US')} m`;
    const spawnPill = spawningActive(now) ? `<span class="boost spawn">🌕 Coral spawning · ${fmtTime((spawningEndsAt(now) - now) / 1000)}</span>` : '';
    const boosts = spawnPill + s.boosts.filter((b) => b.until > now).map((b) => {
      const name = b.kind === 'rush' ? 'Pearl Rush' : b.kind === 'burst' ? 'Bubble Burst' : b.kind === 'surge' ? 'Current Surge' : 'Whale Song';
      return `<span class="boost ${b.kind}">${name} x${b.mult} · ${fmtTime((b.until - now) / 1000)}</span>`;
    }).join('');
    const bx = $('#boosts');
    if (bx.innerHTML !== boosts) bx.innerHTML = boosts;
    if (now > this.newsAt) {
      this.newsAt = now + 12e3;
      const pool = NEWS.slice(0, Math.min(NEWS.length, 3 + s.owned.filter((n) => n > 0).length));
      $('#ticker').textContent = pool[this.newsIdx++ % pool.length];
    }
    ($('#dot-depths') as HTMLElement).hidden = !(s.pearls >= descendCost(s));
    ($('#dot-migrate') as HTMLElement).hidden = !canMigrate(s);
    document.querySelector('#tabs button[data-tab="migrate"]')!.classList.toggle('locked', s.earnedLife < 1e9 && s.stats.migrations === 0);
  }

  // ---------- Panels ----------

  renderPanel() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.tab));
    const p = $('#panel');
    p.innerHTML = '';
    if (this.tab === 'colony') this.renderColony(p);
    else if (this.tab === 'depths') this.renderDepths(p);
    else if (this.tab === 'logbook') this.renderLogbook(p);
    else if (this.tab === 'migrate') this.renderMigrate(p);
    else this.renderStats(p);
    this.refreshPanel();
  }

  colonyKey(): string {
    const s = this.s;
    const gens = GENS.map((_, i) => (genUnlocked(s, i) ? 1 : 0)).join('');
    const ups = visibleUpgrades(s).slice(0, 12).map((u) => u.id).join(',');
    return `colony|${gens}|${ups}|${s.zone}`;
  }

  renderColony(p: HTMLElement) {
    const s = this.s;
    const ups = visibleUpgrades(s).slice(0, 12);
    const strip = el('div', 'upgrades');
    if (ups.length === 0) strip.appendChild(el('div', 'empty', 'Upgrades appear here as you earn Pearls.'));
    ups.forEach((u) => {
      const b = el('button', 'up', `<span class="ui">${upgradeIcon(u)}</span><span class="uc">${fmt(u.cost)}</span>`);
      b.dataset.id = u.id;
      b.title = `${u.name}: ${u.desc}`;
      b.addEventListener('click', () => this.showUpgrade(u));
      strip.appendChild(b);
    });
    p.appendChild(strip);

    const buy = el('div', 'buyrow');
    [1, 10, 100, -1].forEach((n) => {
      const b = el('button', s.buyAmount === n ? 'on' : '', n === -1 ? 'Max' : 'x' + n);
      b.addEventListener('click', () => { s.buyAmount = n; this.panelKey = ''; this.renderPanel(); });
      buy.appendChild(b);
    });
    p.appendChild(buy);

    const list = el('div', 'gens');
    let shownLocked = false;
    GENS.forEach((g, i) => {
      if (!genUnlocked(s, i)) {
        if (shownLocked) return;
        shownLocked = true;
        const why = g.zone > s.zone ? `Descend to the ${ZONES[g.zone].name} to find more.` : `Buy a ${GENS[i - 1].name} to discover the next creature.`;
        list.appendChild(el('div', 'gen locked', `<span class="gi">?</span><div class="gt"><b>???</b><small>${why}</small></div>`));
        return;
      }
      const row = el('button', 'gen');
      row.dataset.gen = String(i);
      row.innerHTML = `<span class="gi">${GEN_ICONS[i]}</span>
        <div class="gt"><b>${g.name}</b><small class="gp"></small></div>
        <div class="gc"><span class="cost"></span><span class="count"></span></div>`;
      row.addEventListener('click', () => {
        if (buyGen(s, i)) { if (s.settings.sound) playBubble(0.7); this.refreshPanel(); }
      });
      list.appendChild(row);
    });
    p.appendChild(list);
    this.panelKey = this.colonyKey();
  }

  refreshPanel() {
    const s = this.s, sci = s.settings.sci;
    if (this.tab === 'colony') {
      if (this.colonyKey() !== this.panelKey) { this.renderPanel(); return; }
      document.querySelectorAll<HTMLElement>('#panel .gen[data-gen]').forEach((row) => {
        const i = Number(row.dataset.gen);
        const n = buyCount(s, i);
        const cost = genCost(s, i, n);
        const each = GENS[i].pps * genMult(s, i) * baseMult(s);
        row.querySelector('.cost')!.innerHTML = `${ICON_PEARL}${fmt(cost, sci)}${n > 1 ? ` <i>x${n}</i>` : ''}`;
        row.querySelector('.count')!.textContent = String(s.owned[i]);
        row.querySelector('.gp')!.textContent = s.owned[i] > 0
          ? `${fmt(genPPS(s, i) * baseMult(s), sci)}/s total · ${fmt(each, sci)}/s each`
          : GENS[i].flavor;
        row.classList.toggle('poor', s.pearls < cost);
        row.classList.toggle('hidden-gen', s.owned[i] === 0 && s.earnedRun < GENS[i].cost * 0.5);
      });
      document.querySelectorAll<HTMLElement>('#panel .up').forEach((b) => {
        const u = UPGRADE_BY_ID[b.dataset.id!];
        b.classList.toggle('poor', s.pearls < u.cost);
      });
    } else if (this.tab === 'depths' || this.tab === 'migrate') {
      const now = Date.now();
      const subKey = s.sub.dive < 0 ? 'docked' : subBack(s, now) ? 'back' : `diving${s.sub.until - now >= 5 * 60e3}`;
      const left = document.querySelector<HTMLElement>('#panel .subleft');
      if (left && s.sub.dive >= 0 && !subBack(s, now)) {
        left.textContent = fmtTime((s.sub.until - now) / 1000) + ' left';
        const bar = document.querySelector<HTMLElement>('#panel .subcard .bar i');
        if (bar) bar.style.width = `${Math.min(100, ((now - s.sub.startedAt) / (s.sub.until - s.sub.startedAt || 1)) * 100)}%`;
      }
      document.querySelectorAll<HTMLElement>('#panel .plot[data-i]').forEach((el2) => {
        const pl = s.garden.plots[+el2.dataset.i!];
        if (!pl.c || pl.grown) return;
        const c = CORAL_BY_ID[pl.c];
        const tl = el2.querySelector<HTMLElement>('.pt');
        if (tl) tl.textContent = fmtTime(Math.max(0, (pl.at + c.ms - now) / 1000));
        const bar = el2.querySelector<HTMLElement>('.bar i');
        if (bar) bar.style.width = `${Math.min(100, ((now - pl.at) / c.ms) * 100)}%`;
      });
      const gardenKey = gardenUnlocked(s) ? s.garden.plots.map((pl) => pl.c + (pl.grown ? '!' : '')).join(',') : 'locked';
      const key = `${this.tab}|${subKey}|${gardenKey}|${s.zone}|${s.pearls >= descendCost(s)}|${moonstonesOnMigrate(s)}|${s.moonstones - s.moonstonesSpent}|${Math.floor(s.earnedLife / nextMoonstoneAt(s) * 100)}`;
      if (key !== this.panelKey) { this.panelKey = key; this.renderPanel(); }
    } else if (this.tab === 'logbook') {
      const key = `logbook|${s.hearts}|${Object.keys(s.relics).length}|${Object.keys(s.rares).length}|${Object.keys(s.achievements).length}`;
      if (key !== this.panelKey) { this.panelKey = key; this.renderPanel(); }
    } else if (this.tab === 'stats') {
      const key = `stats|${Math.floor(Date.now() / 1000)}`;
      if (key !== this.panelKey) { const p = $('#panel'); p.innerHTML = ''; this.renderStats(p); this.panelKey = key; }
    }
  }

  renderSub(p: HTMLElement) {
    const s = this.s, now = Date.now();
    const card = el('div', 'subcard');
    if (!subUnlocked(s)) {
      card.innerHTML = '<b>🚢 Expedition submarine</b><small>Reach the Twilight Reef to launch dives.</small>';
      p.appendChild(card);
      return;
    }
    if (s.sub.dive < 0) {
      card.innerHTML = '<b>🚢 Expedition submarine</b><small>Send the sub on a dive. It keeps going while you are away and brings back Pearls and Hearts.</small>';
      const row = el('div', 'dives');
      DIVES.forEach((d, i) => {
        const r = diveReward(s, i);
        const len = d.ms < 3600e3 ? `${d.ms / 60e3} min` : `${d.ms / 3600e3} hour${d.ms > 3600e3 ? 's' : ''}`;
        const b = el('button', 'act dive', `${d.name}<span>${len}</span><span>${fmt(r.pearls)} · ${r.hearts} ❤</span>`);
        b.addEventListener('click', () => {
          if (launchDive(s, i, Date.now())) { if (s.settings.sound) playBubble(0.5); this.save(); this.panelKey = ''; this.renderPanel(); }
        });
        row.appendChild(b);
      });
      card.appendChild(row);
    } else {
      const d = DIVES[s.sub.dive];
      const back = subBack(s, now);
      const pct = Math.min(100, ((now - s.sub.startedAt) / (s.sub.until - s.sub.startedAt || 1)) * 100);
      card.innerHTML = `<b>🚢 ${d.name}</b><small class="subleft">${back ? 'Back at the colony!' : fmtTime((s.sub.until - now) / 1000) + ' left'}</small>
        <div class="bar"><i style="width:${back ? 100 : pct}%"></i></div>`;
      const row = el('div', 'dives');
      if (back) {
        const r = diveReward(s, s.sub.dive);
        const b = el('button', 'act dive', `Collect<span>${fmt(r.pearls)} + ${r.hearts} ❤</span>`);
        b.addEventListener('click', () => {
          const got = collectDive(s, Date.now(), Math.random);
          if (!got) return;
          if (s.settings.sound) playChime();
          this.toast(`<b>Submarine:</b> +${fmt(got.pearls)} Pearls and +${got.hearts} ❤.`);
          if (got.relic) {
            const rl = RELIC_BY_ID[got.relic];
            this.scene.announce(rl.name, '#ffd84a');
            this.modal(`<div class="relic-big">${rl.icon}</div><h2>${rl.name}</h2><p>The submarine found a sunken relic! ${rl.desc} It stays with you forever.</p>`, [['Wonderful', () => {}]]);
          } else this.scene.announce('Sub is back', '#ffd84a');
          this.save(); this.panelKey = ''; this.renderPanel();
        });
        row.appendChild(b);
      } else if (s.sub.until - now >= 5 * 60e3 && subSpeedsLeft(s, localDay(now)) > 0) {
        const b = el('button', 'act dive ghost', `▶ Ad: bring it back now<span>${subSpeedsLeft(s, localDay(now))} left today</span>`);
        b.addEventListener('click', async () => {
          if (await showRewardedAd() && speedUpDive(s, Date.now(), localDay(Date.now()))) { this.save(); this.panelKey = ''; this.renderPanel(); }
        });
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    const found = RELICS.filter((r) => s.relics[r.id]).length;
    const strip = el('div', 'relics');
    strip.innerHTML = `<small>Sunken relics ${found}/${RELICS.length}</small>` + RELICS.map((r) => `<span class="${s.relics[r.id] ? 'got' : ''}" title="${s.relics[r.id] ? r.name : '?'}">${s.relics[r.id] ? r.icon : '?'}</span>`).join('');
    card.appendChild(strip);
    p.appendChild(card);
  }

  renderGarden(p: HTMLElement) {
    const s = this.s, now = Date.now();
    const card = el('div', 'subcard garden');
    if (!gardenUnlocked(s)) {
      card.innerHTML = '<b>🪸 Reef garden</b><small>Reach the Midnight Trench to start a coral garden.</small>';
      p.appendChild(card);
      return;
    }
    const bonus = gardenBonus(s);
    card.innerHTML = `<b>🪸 Reef garden <span class="gbonus">${bonus > 0 ? `+${Math.round(bonus * 100)}% production` : ''}</span></b>
      <small>Grown corals boost all production. Harvest them for Pearls, or keep them standing. Two different grown corals beside an empty plot may cross-breed.</small>`;
    const grid = el('div', 'plots');
    s.garden.plots.forEach((pl, i) => {
      const c = pl.c ? CORAL_BY_ID[pl.c] : null;
      const b = el('button', 'plot' + (c ? (pl.grown ? ' grown' : ' growing') : ' empty'));
      b.dataset.i = String(i);
      if (!c) b.innerHTML = '<span class="plus">+</span><small>Plant</small>';
      else if (pl.grown) b.innerHTML = `${coralSvg(c.color, 46)}<small>${c.name.split(' ')[0]}</small><small class="ready">Harvest</small>`;
      else b.innerHTML = `${coralSvg(c.color, 26)}<small class="pt">${fmtTime(Math.max(0, (pl.at + c.ms - now) / 1000))}</small><div class="bar"><i style="width:${Math.min(100, ((now - pl.at) / c.ms) * 100)}%"></i></div>`;
      b.addEventListener('click', () => this.plotAction(i));
      grid.appendChild(b);
    });
    card.appendChild(grid);
    const hybrids = CORALS.filter((c) => c.parents);
    const strip = el('div', 'relics');
    strip.innerHTML = `<small>Cross-bred ${hybrids.filter((c) => s.garden.found[c.id]).length}/${hybrids.length}</small>` +
      hybrids.map((c) => `<span class="${s.garden.found[c.id] ? 'got' : ''}" title="${s.garden.found[c.id] ? c.name : '?'}">${s.garden.found[c.id] ? coralSvg(c.color, 22) : '?'}</span>`).join('');
    card.appendChild(strip);
    p.appendChild(card);
  }

  plotAction(i: number) {
    const s = this.s, pl = s.garden.plots[i], now = Date.now();
    const redraw = () => { this.save(); this.panelKey = ''; this.renderPanel(); };
    if (!pl.c) {
      const m = $('#modal');
      this.modal('<h2>Plant a coral</h2><p>A coral boosts production once it is fully grown.</p><div class="seeds"></div>', [['Cancel', () => {}, 'ghost']]);
      const list = m.querySelector<HTMLElement>('.seeds')!;
      CORALS.forEach((c) => {
        const known = coralKnown(s, c.id);
        const r = coralReward(s, c.id);
        const row = el('button', 'seed' + (known ? '' : ' locked'));
        row.innerHTML = known
          ? `${coralSvg(c.color, 34)}<div><b>${c.name}</b><small>${c.ms < 3600e3 ? `${c.ms / 60e3} min` : `${c.ms / 3600e3} h`} · +${Math.round(c.bonus * 100)}% while grown · harvest ${fmt(r.pearls)}${c.hearts ? `&nbsp;+&nbsp;${c.hearts}&nbsp;❤` : ''}</small></div>`
          : `<span class="ricon">?</span><div><b>Unknown coral</b><small>Grow ${CORAL_BY_ID[c.parents![0]].name} and ${CORAL_BY_ID[c.parents![1]].name} side by side.</small></div>`;
        if (known) row.addEventListener('click', () => {
          m.hidden = true;
          if (plantCoral(s, i, c.id, Date.now())) { if (s.settings.sound) playBubble(0.5); redraw(); }
        });
        list.appendChild(row);
      });
      return;
    }
    const c = CORAL_BY_ID[pl.c];
    if (!pl.grown) {
      this.modal(`<div class="relic-big">${coralSvg(c.color, 72)}</div><h2>${c.name}</h2><p>Fully grown in ${fmtTime(Math.max(0, (pl.at + c.ms - now) / 1000))}.</p>`,
        [['Uproot', () => { uprootCoral(s, i); redraw(); }, 'ghost'], ['Keep growing', () => {}]]);
      return;
    }
    const r = coralReward(s, c.id);
    this.modal(`<div class="relic-big">${coralSvg(c.color, 72)}</div><h2>${c.name}</h2><p>Adds +${Math.round(c.bonus * 100)}% production while it stands. Harvest it for ${fmt(r.pearls)} Pearls${c.hearts ? ` and ${c.hearts} ❤` : ''}?</p>`,
      [['Keep it', () => {}, 'ghost'], ['Harvest', () => {
        const got = harvestCoral(s, i, Date.now());
        if (!got) return;
        if (s.settings.sound) playChime();
        this.toast(`<b>${c.name}:</b> +${fmt(got.pearls)} Pearls${got.hearts ? ` and +${got.hearts} ❤` : ''}.`);
        redraw();
      }]]);
  }

  renderDepths(p: HTMLElement) {
    const s = this.s;
    this.renderSub(p);
    this.renderGarden(p);
    p.appendChild(el('p', 'lead', 'Each zone you reach unlocks new creatures and multiplies all production by x1.5 for this migration.'));
    const list = el('div', 'zones');
    ZONES.forEach((z, i) => {
      const reached = i <= s.zone, next = i === s.zone + 1;
      const row = el('div', 'zone' + (reached ? ' reached' : '') + (next ? ' next' : ''));
      const gens = GENS.filter((g) => g.zone === i).map((g) => g.name).join(', ');
      row.innerHTML = `<div class="zd">${z.depth.toLocaleString('en-US')} m</div>
        <div class="zt"><b>${z.name}</b><small>${z.flavor}</small><small class="zg">${gens}</small></div>`;
      if (next) {
        const b = el('button', 'act' + (s.pearls >= z.cost ? '' : ' poor'), `Descend<br><span>${fmt(z.cost)}</span>`);
        b.addEventListener('click', () => {
          if (descend(s)) {
            if (s.settings.sound) playChime();
            this.scene.announce(z.name, '#9ff7ff');
            this.toast(`<b>${z.name}</b> reached. Production x1.5.`);
            this.panelKey = '';
            this.renderPanel();
          }
        });
        row.appendChild(b);
      } else if (reached) row.appendChild(el('div', 'tick', '✓'));
      list.appendChild(row);
    });
    p.appendChild(list);
  }

  renderLogbook(p: HTMLElement) {
    const s = this.s;
    p.appendChild(el('h3', 'rare-head', `Rare creatures <span>${s.hearts} ❤</span>`));
    p.appendChild(el('p', 'lead', 'Golden fish leave a Heart when you catch them, whales leave three. Spend Hearts to adopt rare creatures. They stay with you forever, even through migrations.'));
    const rares = el('div', 'rares');
    RARES.forEach((r) => {
      const got = !!s.rares[r.id];
      const card = el('div', 'rare' + (got ? ' got' : ''));
      card.innerHTML = `<span class="rdot" style="--c:${r.color}"></span><div class="gt"><b>${r.name}</b><small>${r.desc}</small></div>`;
      if (got) card.appendChild(el('div', 'tick', '✓'));
      else {
        const b = el('button', 'act' + (s.hearts >= r.hearts ? '' : ' poor'), `${r.hearts} ❤`);
        b.addEventListener('click', () => {
          if (adoptRare(s, r.id)) {
            if (s.settings.sound) playChime();
            this.scene.announce(r.name, r.color);
            this.toast(`<b>${r.name}</b> joined your colony. ${r.desc}`);
            this.save();
          }
        });
        card.appendChild(b);
      }
      rares.appendChild(card);
    });
    p.appendChild(rares);
    p.appendChild(el('h3', '', `Sunken relics <span class="muted">${RELICS.filter((r) => s.relics[r.id]).length}/${RELICS.length}</span>`));
    p.appendChild(el('p', 'lead', 'The expedition submarine sometimes finds a relic, more often on long dives. Relics stay forever.'));
    const relics = el('div', 'rares');
    RELICS.forEach((r) => {
      const got = !!s.relics[r.id];
      relics.appendChild(el('div', 'rare' + (got ? ' got' : ''), `<span class="ricon">${got ? r.icon : '?'}</span><div class="gt"><b>${got ? r.name : 'Undiscovered relic'}</b><small>${got ? r.desc : 'Still somewhere in the deep.'}</small></div>`));
    });
    p.appendChild(relics);
    p.appendChild(el('h3', '', 'Logbook'));
    const n = Object.keys(s.achievements).length;
    p.appendChild(el('p', 'lead', `${n} of ${ACHIEVEMENTS.length} entries. Each one gives +1% production (now +${n}%).`));
    const grid = el('div', 'logbook');
    ACHIEVEMENTS.forEach((a) => {
      const got = !!s.achievements[a.id];
      const c = el('button', 'ach' + (got ? ' got' : ''), got ? '🐚' : '·');
      c.addEventListener('click', () => this.toast(`<b>${got ? a.name : '???'}</b> ${a.desc}`));
      grid.appendChild(c);
    });
    p.appendChild(grid);
  }

  renderMigrate(p: HTMLElement) {
    const s = this.s;
    const gain = moonstonesOnMigrate(s);
    const free = s.moonstones - s.moonstonesSpent;
    if (s.earnedLife < 1e9 && s.stats.migrations === 0) {
      p.appendChild(el('p', 'lead', `When your colony has earned 100B Pearls in total, it can set off on the Great Migration: start again in fresh waters with Moonstones that boost everything forever. Earned so far: ${fmt(s.earnedLife)}.`));
      return;
    }
    const head = el('div', 'mig');
    const pct = Math.min(100, (s.earnedLife / nextMoonstoneAt(s)) * 100);
    head.innerHTML = `<div class="moon">${ICON_MOON}</div>
      <div><b>${fmt(s.moonstones)} Moonstones</b> · +${fmt(s.moonstones * 2)}% production<br>
      <small>${fmt(free)} free to spend on Heritage</small></div>`;
    p.appendChild(head);
    const box = el('div', 'migbox');
    box.innerHTML = `<p>Migrating now grants <b>${fmt(gain)}</b> Moonstone${gain === 1 ? '' : 's'}. Pearls, creatures, upgrades and depth reset; the Logbook, Moonstones and Heritage stay.</p>
      <div class="bar"><div style="width:${pct}%"></div></div><small>Next Moonstone at ${fmt(nextMoonstoneAt(s))} lifetime Pearls</small>`;
    const b = el('button', 'act big' + (gain > 0 ? '' : ' poor'), 'Begin the Great Migration');
    b.addEventListener('click', () => {
      if (gain <= 0) return;
      this.confirm('Begin the Great Migration?', `Your colony leaves for fresh waters with ${fmt(gain)} new Moonstone${gain === 1 ? '' : 's'}.`, () => {
        migrate(s, Date.now());
        this.shownPearls = s.pearls;
        this.save();
        if (s.settings.sound) playWhale();
        this.scene.announce('A new beginning', '#cfe3ff');
        this.panelKey = '';
        this.renderPanel();
      });
    });
    box.appendChild(b);
    p.appendChild(box);
    p.appendChild(el('h3', '', 'Heritage'));
    const list = el('div', 'perks');
    PERKS.forEach((pk) => {
      const lvl = s.perks[pk.id] || 0;
      const cost = perkCost(s, pk.id);
      const row = el('div', 'perk');
      row.innerHTML = `<div class="gt"><b>${pk.name} <i>${lvl}/${pk.costs.length}</i></b><small>${pk.desc}</small></div>`;
      if (cost === Infinity) row.appendChild(el('div', 'tick', '✓'));
      else {
        const bb = el('button', 'act' + (free >= cost ? '' : ' poor'), `${fmt(cost)} 🌙`);
        bb.addEventListener('click', () => { if (buyPerk(s, pk.id)) { if (s.settings.sound) playChime(); this.panelKey = ''; this.renderPanel(); } });
        row.appendChild(bb);
      }
      list.appendChild(row);
    });
    p.appendChild(list);
  }

  renderStats(p: HTMLElement) {
    const s = this.s, now = Date.now();
    const rows: [string, string][] = [
      ['Pearls in bank', fmt(s.pearls)],
      ['Pearls this migration', fmt(s.earnedRun)],
      ['Pearls all time', fmt(s.earnedLife)],
      ['Per second', fmt(pps(s, now))],
      ['Per tap now', fmt(tapValue(s, now))],
      ['Taps', fmt(s.stats.taps)],
      ['Pearls from taps', fmt(s.stats.tapEarned)],
      ['Best combo', 'x' + (1 + s.stats.bestCombo * 0.02).toFixed(2)],
      ['Creatures', fmt(totalOwned(s))],
      ['Upgrades bought', String(Object.keys(s.upgrades).length)],
      ['Golden fish caught', String(s.stats.fish)],
      ['Whales greeted', String(s.stats.whales)],
      ['Coral spawning', spawningActive(now) ? `now, ${fmtTime((spawningEndsAt(now) - now) / 1000)} left` : `in ${fmtTime((nextSpawningAt(now) - now) / 1000)}`],
      ['Deepest zone', ZONES[s.zone].name],
      ['Migrations', String(s.stats.migrations)],
      ['This migration', fmtTime((now - s.stats.runStartedAt) / 1000)],
      ['Offline rate', Math.round(offlineRate(s) * 100) + '%'],
    ];
    const t = el('div', 'stats');
    rows.forEach(([k, v]) => t.appendChild(el('div', 'srow', `<span>${k}</span><b>${v}</b>`)));
    p.appendChild(t);
  }

  // ---------- Popups ----------

  toast(html: string) {
    const t = el('div', 'toast-item', html);
    $('#toast').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
    const box = $('#toast');
    while (box.children.length > 3) box.firstChild!.remove();
  }

  modal(html: string, buttons: [string, () => void, string?][]) {
    const m = $('#modal');
    m.hidden = false;
    m.innerHTML = '';
    const card = el('div', 'card', html);
    const row = el('div', 'btns');
    buttons.forEach(([label, fn, cls]) => {
      const b = el('button', 'act ' + (cls || ''), label);
      b.addEventListener('click', () => { m.hidden = true; fn(); });
      row.appendChild(b);
    });
    card.appendChild(row);
    m.appendChild(card);
  }

  confirm(title: string, text: string, ok: () => void) {
    this.modal(`<h2>${title}</h2><p>${text}</p>`, [['Cancel', () => {}, 'ghost'], ['Yes', ok]]);
  }

  showIntro() {
    this.modal(`<h2>Welcome to Fathom</h2>
      <p>Tap the giant clam to gather <b>Pearls</b>. Tap quickly to build a <b>combo</b>.</p>
      <p>Spend Pearls on creatures that gather for you, then <b>descend</b> into deeper, stranger waters.</p>
      <p>Watch the <b>tide</b>: high tide triples your taps. And catch any golden fish that swims by.</p>`,
    [['Dive in', () => {}]]);
  }

  showRequests() {
    const s = this.s, sci = s.settings.sci;
    fillRequests(s, Date.now(), Math.random);
    const rows = s.requests.list.map((r, i) => {
      const done = requestDone(s, r);
      const prog = Math.min(r.target, Math.max(0, requestProgress(s, r)));
      const shown = r.kind === 'combo' ? '' : `<small>${fmt(prog, sci)} / ${fmt(r.target, sci)}</small>`;
      return `<div class="req${done ? ' done' : ''}"><div class="rt"><b>${requestText(r)}</b>${shown}
        <div class="bar"><i style="width:${done ? 100 : (prog / r.target) * 100}%"></i></div></div>
        ${done ? `<button class="act claim" data-i="${i}">Claim</button>` : '<span class="rw">❤ +1</span>'}</div>`;
    }).join('');
    this.modal(`<h2>Reef Requests</h2><p>Your neighbours need a hand. Each request pays about ${fmt(requestReward(s), sci)} Pearls and a Heart ❤. New ones come in five minutes after you claim.</p>
      <div class="reqs">${rows}${s.requests.list.length < 3 ? `<div class="req wait">New requests arrive in ${fmtTime(Math.max(0, s.requests.nextAt - Date.now()) / 1000)}.</div>` : ''}</div>
      <p class="note">Finished so far: ${s.requests.done}</p>`, [['Close', () => {}]]);
    document.querySelectorAll<HTMLElement>('#modal .claim').forEach((b) => b.addEventListener('click', () => {
      const r = claimRequest(s, Number(b.dataset.i), Date.now(), Math.random);
      if (!r) return;
      if (s.settings.sound) playChime();
      this.scene.announce('Request done', '#ffd84a');
      this.toast(`<b>Reef Request:</b> +${fmt(r.pearls, sci)} Pearls and +1 ❤.`);
      this.readyRequests = requestsReady(s);
      this.save();
      this.showRequests();
    }));
  }

  showGift() {
    const s = this.s;
    const streak = s.daily.claimedDay === s.daily.day ? s.daily.streak : nextStreak(s);
    const days = DAILY_MINUTES.map((m, i) => {
      const n = i + 1;
      const cls = n < streak || (n === streak && dailyClaimed(s)) ? 'got' : n === streak ? 'today' : '';
      return `<div class="gday ${cls}"><b>Day ${n}</b><small>${n === 7 ? m + ' min + whale' : m + ' min'}</small></div>`;
    }).join('');
    const head = `<h2>Daily Tide Gift</h2><p>Tap the clam ${DAILY_TAPS} times each day to earn a gift worth minutes of production. Come back on the next day to grow your streak.</p><div class="gdays">${days}</div>`;
    if (dailyClaimed(s)) {
      if (canDoubleGift(s)) this.offerGiftDouble();
      else this.modal(head + `<p>Today's gift is claimed. The next one opens tomorrow.</p>`, [['Close', () => {}]]);
    } else if (dailyReady(s)) {
      this.modal(head + `<p class="big-num">${ICON_PEARL}${fmt(dailyReward(s, streak))}</p>`, [['Claim', () => {
        const r = claimDaily(s, Date.now());
        if (!r) return;
        if (s.settings.sound) (r.whale ? playWhale : playChime)();
        this.scene.announce(`Day ${r.streak} gift`, '#ffd84a');
        this.toast(`<b>Tide Gift:</b> +${fmt(r.pearls)} Pearls${r.whale ? ' and Whale Song' : ''}.`);
        if (s.settings.reminders) askReminderPermission();
        this.save();
        this.offerGiftDouble();
      }]]);
    } else {
      this.modal(head + `<p>Today: ${s.daily.taps} of ${DAILY_TAPS} taps.</p>`, [['Keep tapping', () => {}]]);
    }
  }

  offerGiftDouble() {
    const s = this.s;
    if (!canDoubleGift(s)) return;
    this.modal(`<h2>Double your gift?</h2><p>Watch a short ad to get today's Tide Gift again.</p>
      <p class="big-num">+${ICON_PEARL}${fmt(dailyReward(s, s.daily.streak))}</p>`,
    [['No thanks', () => {}, 'ghost'], ['▶ Watch ad', async () => {
      if (await showRewardedAd()) {
        const got = rewardGift(s);
        if (got > 0) { if (s.settings.sound) playChime(); this.toast(`<b>Gift doubled:</b> +${fmt(got)} Pearls.`); this.save(); }
      }
    }]]);
  }

  showSurge() {
    const s = this.s;
    const left = surgesLeft(s);
    if (left <= 0) { this.toast('No more Current Surges today. They come back tomorrow.'); return; }
    this.modal(`<h2>Current Surge</h2><p>Watch a short ad to ride a strong current: all production x2 for 10 minutes. Each extra ad adds another 10 minutes.</p>
      <p><small>${left} of 4 left today. Ads are always optional.</small></p>`,
    [['Not now', () => {}, 'ghost'], ['▶ Watch ad', async () => {
      if (await showRewardedAd() && rewardSurge(s, Date.now())) {
        if (s.settings.sound) playWhale();
        this.scene.announce('Current Surge x2', '#5ad1ff');
        this.save();
      }
    }]]);
  }

  showOffline(off: { seconds: number; pearls: number }) {
    this.shownPearls = this.s.pearls;
    this.modal(`<h2>Welcome back</h2><p>While you were away for ${fmtTime(off.seconds)}, your colony gathered</p>
      <p class="big-num">${ICON_PEARL}${fmt(off.pearls)}</p><small>Offline rate ${Math.round(offlineRate(this.s) * 100)}%, up to 8 hours.</small>`,
    [['Collect', () => {}, 'ghost'], ['▶ Ad: collect x2', async () => {
      if (await showRewardedAd()) {
        const got = rewardOffline(this.s, off.pearls);
        if (this.s.settings.sound) playChime();
        this.toast(`<b>Doubled:</b> +${fmt(got)} more Pearls.`);
        this.save();
      }
    }]]);
  }

  showUpgrade(u: UpgradeDef) {
    const s = this.s;
    const ok = s.pearls >= u.cost;
    this.modal(`<div class="uphead"><span class="ui">${upgradeIcon(u)}</span><div><h2>${u.name}</h2><p>${u.desc}</p></div></div>
      <p class="big-num">${ICON_PEARL}${fmt(u.cost)}</p>`,
    [['Close', () => {}, 'ghost'], [ok ? 'Buy' : 'Not enough Pearls', () => {
      if (buyUpgrade(s, u.id)) { if (s.settings.sound) playChime(); this.panelKey = ''; this.renderPanel(); }
    }, ok ? '' : 'poor']]);
  }

  showSettings() {
    const s = this.s;
    const on = (b: boolean) => (b ? 'On' : 'Off');
    this.modal(`<h2>Settings</h2>
      <div class="setting"><span>Sound</span><button data-k="sound">${on(s.settings.sound)}</button></div>
      <div class="setting"><span>Ocean ambience</span><button data-k="ambience">${on(s.settings.ambience)}</button></div>
      <div class="setting"><span>Vibration</span><button data-k="vibrate">${on(s.settings.vibrate)}</button></div>
      <div class="setting"><span>Reminders</span><button data-k="reminders">${on(s.settings.reminders)}</button></div>
      <div class="setting"><span>Scientific numbers</span><button data-k="sci">${on(s.settings.sci)}</button></div>
      <div class="setting"><span>Save</span><button data-a="export">Export</button><button data-a="import">Import</button></div>
      <div class="setting"><span>Start over</span><button data-a="reset" class="danger">Reset</button></div>
      <small>Fathom 0.4 · progress saves on this device.</small>`, [['Done', () => this.save()]]);
    document.querySelectorAll<HTMLElement>('#modal .setting button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k as keyof State['settings'] | undefined;
      if (k) {
        s.settings[k] = !s.settings[k]; b.textContent = on(s.settings[k]);
        if (k === 'reminders' && s.settings.reminders) askReminderPermission();
        if (s.settings.sound && s.settings.ambience) startAmbient(s.zone); else stopAmbient();
        return;
      }
      if (b.dataset.a === 'export') {
        const code = btoa(unescape(encodeURIComponent(serialize(s))));
        try { navigator.clipboard.writeText(code); this.toast('Save copied to the clipboard.'); } catch { prompt('Your save:', code); }
      } else if (b.dataset.a === 'import') {
        const code = prompt('Paste a save:');
        if (!code) return;
        try {
          this.s = deserialize(decodeURIComponent(escape(atob(code.trim()))), Date.now());
          this.shownPearls = this.s.pearls; this.save(); this.panelKey = ''; this.renderPanel(); $('#modal').hidden = true;
          this.toast('Save loaded.');
        } catch { this.toast('That save could not be read.'); }
      } else if (b.dataset.a === 'reset') {
        this.confirm('Start over?', 'Everything is erased, including Moonstones and the Logbook.', () => {
          this.s = newState(Date.now()); this.shownPearls = 0; this.save(); this.panelKey = ''; this.renderPanel(); this.showIntro();
        });
      }
    }));
  }
}

// Exposed for tools/screens.mjs.
(window as any).__fathom = new App();
