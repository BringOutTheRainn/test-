// The app: DOM panels, input, saving and the main loop.

const SAVE_KEY = 'fathom.save';
const rng = () => Math.random();

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
      if (document.hidden) this.save();
      else {
        const off = applyOffline(this.s, Date.now());
        if (off.pearls > 0) this.showOffline(off);
      }
    });
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('resize', () => this.scene.resize());
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
        this.toast(`<b>${res.title}</b> ${res.text}`);
      }
      return;
    }
    const v = tap(this.s, now);
    const high = isHighTide(this.s, now);
    this.scene.tapAt(x, y, '+' + fmt(v, this.s.settings.sci), high ? '#9ff7ff' : '#ffffff');
    if (this.s.settings.sound) playBubble(1 + this.s.combo / 100);
    this.vibrate(8);
  }

  vibrate(ms: number) {
    if (this.s.settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* ignore */ }
  }

  // ---------- Loop ----------

  frame() {
    const t = performance.now();
    const dt = Math.min(0.25, (t - this.last) / 1000);
    this.last = t;
    const now = Date.now();
    tick(this.s, now, dt * 1000, rng);
    this.scene.draw(this.s, now, dt);
    this.updateHud(now, dt);
    if (t - this.lastRefresh > 250) {
      this.lastRefresh = t;
      const got = checkAchievements(this.s);
      got.forEach((a) => this.toast(`<b>Logbook:</b> ${a.name}`));
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
    $('#depth-tag').textContent = `${ZONES[s.zone].name} · ${ZONES[s.zone].depth.toLocaleString('en-US')} m`;
    const boosts = s.boosts.filter((b) => b.until > now).map((b) => {
      const name = b.kind === 'rush' ? 'Pearl Rush' : b.kind === 'burst' ? 'Bubble Burst' : 'Whale Song';
      return `<span class="boost ${b.kind}">${name} x${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`;
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
      const key = `${this.tab}|${s.zone}|${s.pearls >= descendCost(s)}|${moonstonesOnMigrate(s)}|${s.moonstones - s.moonstonesSpent}|${Math.floor(s.earnedLife / nextMoonstoneAt(s) * 100)}`;
      if (key !== this.panelKey) { this.panelKey = key; this.renderPanel(); }
    } else if (this.tab === 'stats') {
      const key = `stats|${Math.floor(Date.now() / 1000)}`;
      if (key !== this.panelKey) { const p = $('#panel'); p.innerHTML = ''; this.renderStats(p); this.panelKey = key; }
    }
  }

  renderDepths(p: HTMLElement) {
    const s = this.s;
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

  showOffline(off: { seconds: number; pearls: number }) {
    this.shownPearls = this.s.pearls;
    this.modal(`<h2>Welcome back</h2><p>While you were away for ${fmtTime(off.seconds)}, your colony gathered</p>
      <p class="big-num">${ICON_PEARL}${fmt(off.pearls)}</p><small>Offline rate ${Math.round(offlineRate(this.s) * 100)}%, up to 8 hours.</small>`,
    [['Collect', () => {}]]);
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
      <div class="setting"><span>Vibration</span><button data-k="vibrate">${on(s.settings.vibrate)}</button></div>
      <div class="setting"><span>Scientific numbers</span><button data-k="sci">${on(s.settings.sci)}</button></div>
      <div class="setting"><span>Save</span><button data-a="export">Export</button><button data-a="import">Import</button></div>
      <div class="setting"><span>Start over</span><button data-a="reset" class="danger">Reset</button></div>
      <small>Fathom 0.1 · progress saves on this device.</small>`, [['Done', () => this.save()]]);
    document.querySelectorAll<HTMLElement>('#modal .setting button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k as keyof State['settings'] | undefined;
      if (k) { s.settings[k] = !s.settings[k]; b.textContent = on(s.settings[k]); return; }
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
