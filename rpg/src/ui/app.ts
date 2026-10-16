// Screens and input. Reads and changes the GameState through src/core; battles are animated
// by playing back the events the battle rules return.

const SAVE_KEY = 'emberdeep.save';

type Tab = 'map' | 'heroes' | 'forge';
interface Choice { skill: string; target: string | null }

const app = {
  s: loadGame(),
  tab: 'map' as Tab,
  forgeTab: 'shop' as 'shop' | 'bag',
  b: null as Battle | null,
  sel: null as string | null,
  pending: null as ((c: Choice | null) => void) | null,
  paused: false,
  save,
  render,
};
(window as unknown as { __emberdeep: typeof app }).__emberdeep = app;

const root = document.getElementById('app')!;
root.innerHTML = '<div id="screen"></div><div id="modal" class="modal hidden"></div><div id="toast" class="toast"></div>';
const screenEl = document.getElementById('screen')!;
const modalEl = document.getElementById('modal')!;
const toastEl = document.getElementById('toast')!;

function loadGame(): GameState {
  try { return deserialize(localStorage.getItem(SAVE_KEY)) ?? newState(); } catch { return newState(); }
}

function save(): void {
  try { localStorage.setItem(SAVE_KEY, serialize(app.s)); } catch { /* private mode: play without saving */ }
}

// ---- Small helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dur = (ms: number) => (app.s.settings.fast ? ms * 0.45 : ms);
const pct = (v: number) => Math.round(v * 100) + '%';

function sprite(key: string, cls = '', tint?: string): string {
  return `<img class="px ${cls}" src="${ART[key] ?? ''}" alt="" draggable="false"${tint ? ` style="filter:${tint}"` : ''}>`;
}

const coin = () => sprite('resources/gold', 'coin');

function starStr(n: number | undefined, max = 3): string {
  let out = '';
  for (let i = 0; i < max; i++) out += `<i class="${n !== undefined && i < n ? 'on' : ''}">★</i>`;
  return `<span class="stars">${out}</span>`;
}

function statLine(st: Partial<Stats>): string {
  const parts: string[] = [];
  if (st.atk) parts.push(`ATK ${st.atk > 0 ? '+' : ''}${st.atk}`);
  if (st.def) parts.push(`DEF ${st.def > 0 ? '+' : ''}${st.def}`);
  if (st.hp) parts.push(`HP +${st.hp}`);
  if (st.spd) parts.push(`SPD ${st.spd > 0 ? '+' : ''}${st.spd}`);
  if (st.crit) parts.push(`CRIT +${Math.round(st.crit * 100)}%`);
  return parts.join(' · ');
}

function whoCanUse(d: ItemDef): string {
  if (!d.only.length) return 'Anyone';
  return d.only.map((id) => heroDef(id).cls).join(', ');
}

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout((toastEl as unknown as { t?: number }).t);
  (toastEl as unknown as { t?: number }).t = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function openModal(html: string, cls = ''): void {
  modalEl.className = 'modal ' + cls;
  modalEl.innerHTML = `<div class="sheet">${html}</div>`;
}

function closeModal(): void {
  app.paused = false;
  modalEl.className = 'modal hidden';
  modalEl.innerHTML = '';
}

// ---- Screens outside battle

function render(): void {
  if (app.b) { renderBattle(); return; }
  playMusic('town');
  const main = document.getElementById('main');
  const scroll = main ? main.scrollTop : -1;
  const body = app.tab === 'map' ? mapView() : app.tab === 'heroes' ? heroesView() : forgeView();
  screenEl.innerHTML = `
    <div class="shell">
      <header class="top">
        <h1>Emberdeep</h1>
        <div class="gold">${coin()}<b>${app.s.gold.toLocaleString()}</b></div>
        <button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button>
      </header>
      <main id="main" class="main">${body}</main>
      <nav class="tabs">
        ${tabBtn('map', 'Dungeon', '⛏')}${tabBtn('heroes', 'Heroes', '⚔')}${tabBtn('forge', 'Forge', '⚒')}
      </nav>
    </div>`;
  const m = document.getElementById('main')!;
  if (scroll >= 0 && app.tab === lastTab) m.scrollTop = scroll;
  else if (app.tab === 'map') {
    // Show the Daily Trial first while today's is still open; otherwise jump to the next stage.
    const next = m.querySelector('.trial:not(.done):not(.locked)') ? null : m.querySelector('.stage.next') as HTMLElement | null;
    if (next) m.scrollTop = Math.max(0, next.offsetTop - m.clientHeight * 0.45);
  }
  lastTab = app.tab;
}
let lastTab: Tab | null = null;

function tabBtn(t: Tab, label: string, icon: string): string {
  const badge = t === 'heroes' && hasUpgradeHint() ? '<i class="dot"></i>' : '';
  return `<button class="${app.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}"><span>${icon}</span>${label}${badge}</button>`;
}

/** True when an unworn item could fill an empty slot. */
function hasUpgradeHint(): boolean {
  if (HEROES.some((d) => canRecruit(app.s, d.id) && app.s.gold >= d.recruit!.cost)) return true;
  return app.s.heroes.some((h) => app.s.party.includes(h.id) && SLOTS.some((slot) => h.gear[slot] === null &&
    app.s.items.some((i) => ITEMS[i.id].slot === slot && canEquip(h.id, i.id) && !wornBy(app.s, i.uid))));
}

function uniqueFoes(st: StageDef): string[] {
  const keys: string[] = [];
  for (const w of st.waves) for (const [k] of w) if (!keys.includes(k)) keys.push(k);
  return keys.sort((a, c) => Number(!!ENEMIES[c].boss) - Number(!!ENEMIES[a].boss));
}

function partyLevel(): number {
  return Math.round(app.s.party.reduce((a, id) => a + heroState(app.s, id).level, 0) / app.s.party.length);
}

function mapView(): string {
  const fr = frontier(app.s);
  const done = STAGES.every((st) => app.s.stars[st.id] !== undefined);
  const regions = REGIONS.map((r, ri) => {
    const open = regionUnlocked(app.s, r.id);
    const stars = r.stages.reduce((a, st) => a + (app.s.stars[st.id] ?? 0), 0);
    const rows = r.stages.map((st) => {
      const unlocked = stageUnlocked(app.s, st.id);
      const isNext = !done && st.id === fr.id;
      return `<button class="stage ${unlocked ? '' : 'locked'} ${isNext ? 'next' : ''} ${st.boss ? 'boss' : ''}" data-act="stage" data-id="${st.id}">
        <span class="sid">${unlocked ? st.id : '🔒'}</span>
        <span class="sname">${st.name}${st.boss ? ' <em>BOSS</em>' : ''}<small>Enemy Lv ${Math.max(...st.waves.flat().map(([, l]) => l))}</small></span>
        <span class="sfoes">${uniqueFoes(st).slice(0, 3).map((k) => sprite(ENEMIES[k].art, 'mini', ENEMIES[k].tint)).join('')}</span>
        ${starStr(app.s.stars[st.id])}
      </button>`;
    }).join('');
    return `<section class="region ${open ? '' : 'locked'}">
      <div class="rhead" style="background-image:url(${ART[r.art]})">
        <div class="rtitle"><small>Depth ${ri + 1}</small><h2>${r.name}</h2></div>
        <span class="rstars">★ ${stars}/15</span>
      </div>
      <p class="rblurb">${open ? r.blurb : `Defeat ${REGIONS[ri - 1].stages[4].name.replace(/^The /, 'the ')} to go deeper.`}</p>
      <div class="stages">${rows}</div>
    </section>`;
  }).join('');
  const trial = trialCard() + towerCard();
  const end = done ? `<div class="banner">You sealed the Ember Gate. Replay stages for three stars, gold and better gear. More depths are coming.</div>` : '';
  return trial + end + regions;
}

function trialCard(): string {
  const s = app.s;
  if (!trialUnlocked(s)) return `<div class="trial locked"><b>Daily Trial</b><small>Clear ${TRIAL_UNLOCK} to unlock a new challenge every day.</small></div>`;
  const day = today();
  const t = trialFor(s, day);
  const won = trialWonToday(s, day);
  const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400e3);
  const hours = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 3600e3));
  return `<button class="trial ${won ? 'done' : ''}" data-act="trial">
    <div><small>Daily Trial · ${t.region.name}</small><b>${TRIAL_MODS[t.mod].name}</b><span>${TRIAL_MODS[t.mod].desc}</span></div>
    <div class="tside">${won ? `<em>✓ Done</em><small>new in ${hours}h</small>` : `<em>${coin()}${t.stage.gold}</em><small>+ gear</small>`}${s.trial.streak && (won || s.trial.lastWon === prevDay(day)) ? `<small>🔥 ${s.trial.streak}</small>` : ''}</div>
  </button>`;
}

function towerCard(): string {
  const s = app.s;
  if (!towerUnlocked(s)) return `<div class="trial tower locked"><b>The Ember Spire</b><small>Clear ${TOWER_UNLOCK} to open an endless climb.</small></div>`;
  const f = towerNext(s);
  const t = towerFloor(f);
  return `<button class="trial tower" data-act="tower">
    <div><small>The Ember Spire · endless</small><b>Floor ${f}${t.stage.boss ? ' <em>BOSS</em>' : ''}</b><span>${s.tower.best ? `Your best: floor ${s.tower.best}` : 'Climb as high as you can. Every floor pays once.'}</span></div>
    <div class="tside"><em>${coin()}${t.stage.gold}</em><small>enemy Lv ${towerLevel(f)}</small>${titheReady(s, Date.now()) >= 10 ? `<small class="tithe-ready">💰 ${titheReady(s, Date.now())} tithe</small>` : ''}</div>
  </button>`;
}

function titheHtml(): string {
  const s = app.s;
  if (!s.tower.best) return '';
  const now = Date.now();
  const ready = titheReady(s, now);
  const full = titheFullIn(s, now);
  return `<div class="item tithe"><div><b>Spire tithe</b><small>${titheRate(s.tower.best)} gold an hour from floor ${s.tower.best}, up to ${TITHE_CAP_HOURS} hours. ${full > 0 ? `Full in ${Math.ceil(full)}h.` : 'Full!'}</small></div>
    <button class="primary sm" data-act="tithe" ${ready < 1 ? 'disabled' : ''}>${coin()}${ready}</button></div>`;
}

function openTower(): void {
  const s = app.s;
  const f = towerNext(s);
  const t = towerFloor(f);
  const foes = uniqueFoes(t.stage).map((k) => `<div class="foe ${ENEMIES[k].boss ? 'boss' : ''}">${sprite(ENEMIES[k].art, '', ENEMIES[k].tint)}<span>${ENEMIES[k].name}</span></div>`).join('');
  const nextBoss = Math.ceil(f / 5) * 5;
  openModal(`
    <h3><small>The Ember Spire · ${t.region.name}</small>Floor ${f}${t.stage.boss ? ' · Boss' : ''}</h3>
    <div class="foes">${foes}</div>
    <p class="muted">${t.stage.waves.length} waves · enemy level ${towerLevel(f)} · ${s.tower.best ? `best: floor ${s.tower.best}` : 'no floors cleared yet'}</p>
    ${towerLevel(f) > partyLevel() + 1 ? `<p class="warn">Your heroes are level ${partyLevel()}. This floor will be tough.</p>` : ''}
    ${s.heroes.length > PARTY_SIZE ? partyStrip('tower') : ''}
    <div class="rewards"><span class="chip">${coin()}${t.stage.gold}</span><span class="chip">✦ ${t.stage.xp} XP</span>${t.stage.boss ? '<span class="chip">🎁 gear</span>' : ''}</div>
    ${titheHtml()}
    <p class="muted center">${t.stage.boss ? 'A boss guards this floor. Beat it for a piece of gear.' : `Boss on floor ${nextBoss} guards a piece of gear.`} Losing costs nothing.</p>
    <div class="btns"><button data-act="close">Back</button><button class="primary" data-act="fight" data-id="tower">Climb</button></div>`);
}

function openTrial(): void {
  const s = app.s;
  const day = today();
  const t = trialFor(s, day);
  const won = trialWonToday(s, day);
  const foes = uniqueFoes(t.stage).map((k) => `<div class="foe">${sprite(ENEMIES[k].art, '', ENEMIES[k].tint)}<span>${ENEMIES[k].name}</span></div>`).join('');
  const streak = trialNextStreak(s, day);
  openModal(`
    <h3><small>Daily Trial · ${t.region.name}</small>${TRIAL_MODS[t.mod].name}</h3>
    <p>${TRIAL_MODS[t.mod].desc}</p>
    <div class="foes">${foes}</div>
    <p class="muted">3 waves · enemy level ${t.stage.waves[0][0][1]} · a new trial every day at midnight UTC</p>
    ${won ? '<p class="warn">You already won today\'s trial. You can fight it again for practice, but there are no rewards until tomorrow.</p>'
      : `<div class="rewards"><span class="chip">${coin()}${t.stage.gold}</span><span class="chip">✦ ${t.stage.xp} XP</span><span class="chip">🎁 gear</span></div>
         <p class="muted center">${streak > 1 ? `Day ${streak} of your streak: +${Math.min(streak - 1, 5) * 10}% gold.` : 'Win on consecutive days for up to +50% gold.'}</p>`}
    <div class="btns"><button data-act="close">Back</button><button class="primary" data-act="fight" data-id="trial">${won ? 'Practice' : 'Fight'}</button></div>`);
}

function openStage(id: string): void {
  const st = stageDef(id);
  if (!stageUnlocked(app.s, id)) { toast('Clear the stage before this one first.'); return; }
  const first = app.s.stars[id] === undefined;
  const lv = st.waves.flat().map(([, l]) => l);
  const foes = uniqueFoes(st).map((k) => `<div class="foe ${ENEMIES[k].boss ? 'boss' : ''}">${sprite(ENEMIES[k].art, '', ENEMIES[k].tint)}<span>${ENEMIES[k].name}</span></div>`).join('');
  const pl = partyLevel();
  const warn = pl < suggestedLevel(st) ? `<p class="warn">Your heroes are level ${pl}. Level ${suggestedLevel(st)} or better gear is recommended.</p>` : '';
  const drop = first && st.drop ? `<span class="chip">${sprite(ITEMS[st.drop].art, 'ico')}${ITEMS[st.drop].name}</span>` : '';
  openModal(`
    <h3><small>${regionOf(id).name} · ${st.id}</small>${st.name}</h3>
    <div class="foes">${foes}</div>
    <p class="muted">${st.waves.length} ${st.waves.length > 1 ? 'waves' : 'wave'} · enemy level ${Math.min(...lv)}${Math.max(...lv) > Math.min(...lv) ? '–' + Math.max(...lv) : ''}</p>
    ${warn}
    ${app.s.heroes.length > PARTY_SIZE ? partyStrip(id) : ''}
    <div class="rewards"><span class="chip">${coin()}${st.gold * (first ? 2 : 1)}${first ? ' <small>first clear</small>' : ''}</span><span class="chip">✦ ${st.xp} XP</span>${drop}</div>
    <ul class="goals">
      <li>${starStr(1, 1)} Win</li>
      <li>${starStr(1, 1)} No hero falls</li>
      <li>${starStr(1, 1)} Win in ${parFor(st)} hero turns or fewer</li>
    </ul>
    <div class="btns"><button data-act="close">Back</button><button class="primary" data-act="fight" data-id="${id}">Fight</button></div>`);
}

function partyStrip(stageId = ''): string {
  const compact = !!stageId;
  const slots = app.s.party.map((id, i) => {
    const d = heroDef(id);
    return `<button class="pslot" data-act="pslot" data-slot="${i}" data-id="${stageId}">${sprite(d.art)}<b>${d.name}</b><small>Lv ${heroState(app.s, id).level}</small></button>`;
  }).join('');
  const bench = app.s.heroes.length - PARTY_SIZE;
  return `<div class="party ${compact ? 'compact' : ''}">${compact ? '' : `<h4>Party <small>${bench > 0 ? 'tap a hero to swap them' : 'recruit more heroes to swap them'}</small></h4>`}<div class="pslots">${slots}</div></div>`;
}

function openPartySlot(slot: number, stageId = ''): void {
  const cur = app.s.party[slot];
  const rows = app.s.heroes.filter((h) => h.id !== cur).map((h) => {
    const d = heroDef(h.id);
    const at = app.s.party.indexOf(h.id);
    return `<div class="item">${sprite(d.art, 'ico')}
      <div><b>${d.name} <small>${d.cls} · Lv ${h.level}</small></b><small class="muted">${at >= 0 ? `In the party, will swap with ${heroDef(cur).name}` : d.blurb}</small></div>
      <button class="primary sm" data-act="setparty" data-slot="${slot}" data-hero="${h.id}" data-id="${stageId}">${at >= 0 ? 'Swap' : 'Pick'}</button></div>`;
  }).join('');
  openModal(`<h3><small>Party slot ${slot + 1}</small>Replace ${heroDef(cur).name}</h3>
    ${rows || '<p class="muted">No other heroes yet. Recruits join at the Tavern below the party.</p>'}
    <div class="btns">${stageId ? `<button data-act="${stageId === 'tower' ? 'tower' : 'stage'}" data-id="${stageId}">Back</button>` : '<button data-act="close">Back</button>'}</div>`);
}

function tavernView(): string {
  const recruits = HEROES.filter((d) => d.recruit && !app.s.heroes.some((h) => h.id === d.id));
  if (!recruits.length) return '';
  const rows = recruits.map((d) => {
    const open = canRecruit(app.s, d.id);
    const cost = d.recruit!.cost;
    return `<div class="item recruit ${open ? '' : 'locked'}">${sprite(d.art, 'ico')}
      <div><b>${open ? d.name : '???'} <small>${d.cls}</small></b><small class="muted">${open ? d.blurb : `Clear stage ${d.recruit!.after} to meet them.`}</small></div>
      ${open ? `<button class="primary sm" data-act="recruit" data-hero="${d.id}" ${app.s.gold < cost ? 'disabled' : ''}>${coin()}${cost}</button>` : '<span class="muted sm">Locked</span>'}
    </div>`;
  }).join('');
  return `<section class="tavern"><h4>Tavern <small>recruits join at your party's level</small></h4>${rows}</section>`;
}

function heroesView(): string {
  const order = [...app.s.party, ...app.s.heroes.map((h) => h.id).filter((id) => !app.s.party.includes(id))];
  return partyStrip() + tavernView() + order.map((id) => heroState(app.s, id)).map((h) => {
    const benched = !app.s.party.includes(h.id);
    const d = heroDef(h.id);
    const st = heroStats(app.s, h.id);
    const max = h.level >= MAX_LEVEL;
    const slots = SLOTS.map((slot) => {
      const inst = itemInst(app.s, h.gear[slot]);
      return `<button class="slot ${inst ? '' : 'empty'}" data-act="slot" data-hero="${h.id}" data-slot="${slot}">
        ${inst ? sprite(ITEMS[inst.id].art, 'ico') + (inst.plus ? `<b>+${inst.plus}</b>` : '') : `<span>${slot}</span>`}
      </button>`;
    }).join('');
    const skills = d.skills.map((k) => `<li><b>${SKILLS[k].name}</b>${SKILLS[k].cd ? `<i>${SKILLS[k].cd} turn cooldown</i>` : '<i>basic</i>'}<span>${SKILLS[k].desc}</span></li>`).join('');
    return `<section class="hero-card">
      <div class="hhead">
        <div class="portrait">${sprite(d.art)}</div>
        <div class="hinfo">
          <h2>${d.name} <small>${d.cls}</small>${benched ? '<em class="bench">Bench</em>' : ''}</h2>
          <div class="lvl">Level ${h.level}<span>Power ${power(st)}</span></div>
          <div class="xpbar"><i style="width:${max ? 100 : pct(h.xp / xpToNext(h.level))}"></i><span>${max ? 'Max level' : `${h.xp} / ${xpToNext(h.level)} XP`}</span></div>
          <p class="muted">${d.blurb}</p>
        </div>
      </div>
      <div class="stats">
        <div><small>HP</small>${st.hp}</div><div><small>ATK</small>${Math.round(st.atk)}</div><div><small>DEF</small>${st.def}</div>
        <div><small>SPD</small>${st.spd}</div><div><small>CRIT</small>${Math.round(st.crit * 100)}%</div>
      </div>
      <div class="slots">${slots}</div>
      <details class="skills"><summary>Skills</summary><ul>${skills}</ul></details>
    </section>`;
  }).join('');
}

function openSlot(heroId: string, slot: Slot): void {
  const h = heroState(app.s, heroId);
  const cur = itemInst(app.s, h.gear[slot]);
  const options = app.s.items.filter((i) => ITEMS[i.id].slot === slot && canEquip(heroId, i.id) && i.uid !== h.gear[slot])
    .sort((a, c) => ITEMS[c.id].price * (1 + c.plus) - ITEMS[a.id].price * (1 + a.plus));
  const row = (i: ItemInst, act: string, label: string) => {
    const w = wornBy(app.s, i.uid);
    return `<div class="item">
      ${sprite(ITEMS[i.id].art, 'ico')}
      <div><b>${ITEMS[i.id].name}${i.plus ? ` +${i.plus}` : ''}</b><small>${statLine(itemStats(i))}</small>${w && w !== heroId ? `<small class="muted">Worn by ${heroDef(w).name}</small>` : ''}</div>
      <button class="${act === 'unequip' ? '' : 'primary'} sm" data-act="${act}" data-hero="${heroId}" data-slot="${slot}" data-uid="${i.uid}">${label}</button>
    </div>`;
  };
  openModal(`
    <h3><small>${heroDef(heroId).name}</small>${slot[0].toUpperCase() + slot.slice(1)}</h3>
    ${cur ? row(cur, 'unequip', 'Remove') : '<p class="muted">Nothing equipped.</p>'}
    ${options.length ? '<h4>Your gear</h4>' + options.map((i) => row(i, 'equip', 'Equip')).join('') : '<p class="muted">No other gear for this slot. Buy some at the Forge or win it in the dungeon.</p>'}
    <div class="btns"><button data-act="close">Done</button><button data-act="goforge">Forge</button></div>`);
}

function forgeView(): string {
  const seg = `<div class="seg"><button class="${app.forgeTab === 'shop' ? 'on' : ''}" data-act="forgetab" data-t="shop">Shop</button><button class="${app.forgeTab === 'bag' ? 'on' : ''}" data-act="forgetab" data-t="bag">Your gear (${app.s.items.length})</button></div>`;
  if (app.forgeTab === 'shop') {
    const tier = shopTier(app.s);
    const rows = shopStock(app.s).map((d) => `<div class="item">
      ${sprite(d.art, 'ico')}
      <div><b>${d.name}</b><small>${statLine(d.stats)}</small><small class="muted">${d.slot} · ${whoCanUse(d)}</small></div>
      <button class="primary sm" data-act="buy" data-id="${d.id}" ${app.s.gold < d.price ? 'disabled' : ''}>${coin()}${d.price}</button>
    </div>`).join('');
    const more = tier < REGIONS.length ? `<p class="muted center">Reach ${REGIONS[tier].name} for better stock.</p>` : '';
    return seg + `<p class="muted">Brunhild the smith sells what she can scrounge. Deeper dungeons, better steel.</p>` + rows + more;
  }
  if (!app.s.items.length) return seg + '<p class="muted center">No gear yet. Buy some in the Shop or win it in the dungeon.</p>';
  const rows = app.s.items.slice().sort((a, c) => SLOTS.indexOf(ITEMS[a.id].slot) - SLOTS.indexOf(ITEMS[c.id].slot) || ITEMS[c.id].price - ITEMS[a.id].price).map((i) => {
    const w = wornBy(app.s, i.uid);
    const cost = upgradeCost(i);
    return `<div class="item">
      ${sprite(ITEMS[i.id].art, 'ico')}
      <div><b>${ITEMS[i.id].name}${i.plus ? ` +${i.plus}` : ''}</b><small>${statLine(itemStats(i))}</small><small class="muted">${w ? `Worn by ${heroDef(w).name}` : `${ITEMS[i.id].slot} · ${whoCanUse(ITEMS[i.id])}`}</small></div>
      <div class="col">
        ${cost === null ? '<span class="muted sm">Max</span>' : `<button class="primary sm" data-act="upgrade" data-uid="${i.uid}" ${app.s.gold < cost ? 'disabled' : ''}>▲ ${coin()}${cost}</button>`}
        <button class="sm ghost" data-act="sell" data-uid="${i.uid}">Sell ${sellPrice(i)}</button>
      </div>
    </div>`;
  }).join('');
  return seg + `<p class="muted">Upgrading adds 15% to an item's stats per level, up to +${MAX_PLUS}.</p>` + rows;
}

function openSettings(): void {
  const s = app.s.settings;
  openModal(`
    <h3>Settings</h3>
    <div class="item"><div><b>Sound</b></div><button class="sm ${s.sound ? 'primary' : ''}" data-act="sound">${s.sound ? 'On' : 'Off'}</button></div>
    <div class="item"><div><b>Music</b><small>${s.sound ? '' : 'Needs sound on.'}</small></div><button class="sm ${s.music ? 'primary' : ''}" data-act="music">${s.music ? 'On' : 'Off'}</button></div>
    <div class="item"><div><b>Battles fought</b><small>${app.s.battles} fought, ${app.s.wins} won</small></div></div>
    <div class="item"><div><b>Start over</b><small>Erases your heroes, gear and progress.</small></div><button class="sm danger" data-act="reset">Reset</button></div>
    <p class="muted center">Emberdeep v0.1 · a first playable build</p>
    <div class="btns"><button data-act="close">Close</button></div>`);
}

function showIntro(): void {
  openModal(`
    <div class="intro">
      <div class="trio">${HEROES.filter((d) => !d.recruit).map((d) => sprite(d.art)).join('')}</div>
      <h3>Emberdeep</h3>
      <p>Something has been knocking under the old keep. Last night the cellar floor split open and a warm red glow came up through the crack.</p>
      <p>Aldric, Wren and Mira are going down to find the Ember Gate and seal it.</p>
      <ul class="tips">
        <li>Heroes and monsters take turns by speed. The strip at the top shows who is next.</li>
        <li>Pick a skill, then tap a target. Enemies show what they will do next, so plan around it.</li>
        <li>Win gold and gear, then visit the Forge and your Heroes between fights.</li>
      </ul>
      <button class="primary wide" data-act="intro">Into the cellar</button>
    </div>`, 'center');
}

// ---- Battle screen

function startFight(stageId: string): void {
  closeModal();
  app.b = stageId === 'trial' ? beginTrial(app.s, today()) : stageId === 'tower' ? beginTower(app.s) : beginBattle(app.s, stageId);
  app.sel = null;
  renderBattle();
  playSfx('wave');
  void battleLoop(app.b);
}

function unitHtml(b: Battle, u: Unit): string {
  const dead = u.hp <= 0;
  const sh = statusOf(u, 'shield');
  const statuses = u.statuses.map((s) => `<i class="st ${STATUS_INFO[s.kind].good ? 'good' : 'bad'}" title="${STATUS_INFO[s.kind].name}">${STATUS_INFO[s.kind].icon}<sub>${s.turns}</sub></i>`).join('');
  const targeted = u.side === 'hero' && !dead && alive(b.enemies).some((e) => e.intent && (e.intent.target === u.uid));
  return `<div class="unit ${u.side} ${u.boss ? 'big' : ''} ${dead ? 'dead' : ''} ${targeted ? 'targeted' : ''}" data-act="unit" data-uid="${u.uid}">
    ${u.side === 'enemy' ? `<div class="intent-slot">${dead ? '' : intentHtml(b, u)}</div>` : ''}
    <div class="sp">${sprite(u.art, 'body', u.tint)}</div>
    <div class="hpbar"><i style="width:${pct(u.hp / u.maxHp)}"></i>${sh ? `<s style="width:${pct(Math.min(1, sh.value / u.maxHp))}"></s>` : ''}<span>${u.hp}</span></div>
    <div class="sts">${statuses}</div>
    <div class="uname">${u.name}${u.enraged ? ' <em>Enraged</em>' : ''}</div>
  </div>`;
}

function estimate(src: Unit, tgt: Unit, mult: number): number {
  let v = src.atk * (has(src, 'atkUp') ? 1.35 : 1) * mult * (60 / (60 + tgt.def));
  if (has(tgt, 'defDown')) v *= 1.35;
  if (has(tgt, 'guard')) v *= 0.6;
  return Math.max(1, Math.round(v));
}

function intentHtml(b: Battle, e: Unit): string {
  if (!e.intent) return '';
  const sk = SKILLS[e.intent.skill];
  const dmg = sk.effects.find((x) => x.t === 'dmg') as { t: 'dmg'; mult: number } | undefined;
  const t = findUnit(b, e.intent.target);
  if (dmg) {
    const ref = t ?? alive(b.heroes)[0];
    const n = ref ? estimate(e, ref, dmg.mult) : 0;
    const extra = sk.effects.some((x) => x.t === 'status' && x.kind === 'stun') ? '💫' : sk.effects.some((x) => x.t === 'status' && (x.kind === 'poison' || x.kind === 'burn')) ? '☠' : '';
    const who = sk.target === 'enemies' ? 'All' : t ? t.name : '';
    return `<div class="intent atk ${sk.target === 'enemies' ? 'aoe' : ''}">🗡${n}${extra}<span>${who}</span></div>`;
  }
  const icon = sk.effects.some((x) => x.t === 'heal') ? '✚' : sk.effects.some((x) => x.t === 'summon') ? '✦' : '🛡';
  return `<div class="intent other">${icon}<span>${sk.name}</span></div>`;
}

function queueHtml(b: Battle): string {
  return turnQueue(b, 9).map((uid, i) => {
    const u = findUnit(b, uid);
    if (!u) return '';
    return `<div class="q ${u.side} ${i === 0 ? 'now' : ''}">${sprite(u.art, '', u.tint)}</div>`;
  }).join('');
}

function cmdHtml(b: Battle): string {
  const u = current(b);
  if (b.over) return '<div class="who">…</div>';
  if (!u || u.side === 'enemy' || app.s.settings.auto || !app.pending) {
    const label = u && u.side === 'enemy' ? `${u.name} is acting…` : app.s.settings.auto ? 'Auto battle is on. Tap Auto to take over.' : '…';
    return `<div class="who dim">${label}</div>${u && u.side === 'hero' ? skillButtons(b, u, true) : '<div class="skills placeholder"></div>'}`;
  }
  const sk = app.sel ? SKILLS[app.sel] : null;
  let hint = '';
  if (sk) hint = needsTarget(sk.id) ? (sk.target === 'enemy' ? 'Tap an enemy' : sk.target === 'fallen' ? 'Tap a fallen hero' : 'Tap a hero') : 'Tap again to use';
  return `<div class="who"><b>${u.name}'s turn</b><span>${hint}</span></div>${skillButtons(b, u, false)}`;
}

function skillButtons(b: Battle, u: Unit, disabled: boolean): string {
  return `<div class="skills">${u.skills.map((k) => {
    const sk = SKILLS[k];
    const cd = u.cds[k] ?? 0;
    const usable = canUse(b, u, k);
    const why = cd > 0 ? `<em class="cd">${cd}</em>` : '';
    return `<button class="skill ${app.sel === k && !disabled ? 'on' : ''}" data-act="skill" data-skill="${k}" ${disabled || !usable ? 'disabled' : ''}>
      ${why}<b>${sk.name}</b><small>${sk.desc}</small>
    </button>`;
  }).join('')}</div>`;
}

const today = () => dayKey(Date.now());
const regionArt = (b: Battle) => ART[REGIONS.find((r) => r.id === b.region)!.art];

function battleSubtitle(b: Battle): string {
  const wave = `Wave ${b.wave + 1}/${b.waves.length}`;
  if (b.stageId === 'tower') return `${wave} · Ember Spire`;
  return b.mod ? `${wave} · ${TRIAL_MODS[b.mod].name}` : `${wave} · Turn ${b.heroActions}/${parFor(b.stage)}`;
}

function battleMusic(b: Battle): void {
  playMusic(b.enemies.some((e) => e.boss && e.hp > 0) ? 'boss' : 'battle');
}

function renderBattle(): void {
  const b = app.b!;
  battleMusic(b);
  const st = b.stage;
  const s = app.s.settings;
  screenEl.innerHTML = `
    <div class="battle">
      <div class="bhead">
        <button class="icon-btn" data-act="pause" aria-label="Menu">❚❚</button>
        <div class="btitle"><b>${b.mod || st.id === 'tower' ? '' : st.id + ' '}${st.name}</b><small>${battleSubtitle(b)}</small></div>
        <button class="tog ${s.fast ? 'on' : ''}" data-act="fast">2×</button>
        <button class="tog ${s.auto ? 'on' : ''}" data-act="auto">Auto</button>
      </div>
      <div class="queue" id="queue">${queueHtml(b)}</div>
      <div class="field" id="field" style="background-image:url(${regionArt(b)})">
        <div class="row enemies" id="enemies">${b.enemies.map((u) => unitHtml(b, u)).join('')}</div>
        <div class="row heroes" id="heroes">${b.heroes.map((u) => unitHtml(b, u)).join('')}</div>
        <div class="fx" id="fx"></div>
      </div>
      <div class="cmd" id="cmd">${cmdHtml(b)}</div>
    </div>`;
  markTargets();
}

/** Refreshes everything except the field's layout, so running animations are not cut off. */
function refreshBattle(): void {
  const b = app.b;
  if (!b) return;
  const field = document.getElementById('field');
  if (!field) { renderBattle(); return; }
  document.getElementById('enemies')!.innerHTML = b.enemies.map((u) => unitHtml(b, u)).join('');
  document.getElementById('heroes')!.innerHTML = b.heroes.map((u) => unitHtml(b, u)).join('');
  document.getElementById('queue')!.innerHTML = queueHtml(b);
  document.getElementById('cmd')!.innerHTML = cmdHtml(b);
  const small = screenEl.querySelector('.btitle small');
  if (small) small.textContent = battleSubtitle(b);
  const cur = current(b);
  if (cur) unitEl(cur.uid)?.classList.add('active');
  markTargets();
}

function markTargets(): void {
  const b = app.b;
  if (!b) return;
  const u = current(b);
  if (u) unitEl(u.uid)?.classList.add('active');
  if (!u || u.side !== 'hero' || !app.sel || !app.pending) return;
  const sk = SKILLS[app.sel];
  const ids = needsTarget(app.sel) ? validTargets(b, u, app.sel).map((x) => x.uid)
    : sk.target === 'self' ? [u.uid] : sk.target === 'allies' ? alive(b.heroes).map((x) => x.uid) : alive(b.enemies).map((x) => x.uid);
  for (const id of ids) unitEl(id)?.classList.add(needsTarget(app.sel) ? 'pickable' : 'affected');
}

function unitEl(uid: string): HTMLElement | null {
  return screenEl.querySelector(`.unit[data-uid="${uid}"]`);
}

function floatText(uid: string, text: string, cls: string): void {
  const el = unitEl(uid);
  const fx = document.getElementById('fx');
  const field = document.getElementById('field');
  if (!el || !fx || !field) return;
  const r = el.querySelector('.sp')!.getBoundingClientRect();
  const f = field.getBoundingClientRect();
  const n = document.createElement('div');
  n.className = 'float ' + cls;
  n.textContent = text;
  const jitter = (Math.random() - 0.5) * 24;
  n.style.left = `${r.left - f.left + r.width / 2 + jitter}px`;
  n.style.top = `${r.top - f.top + r.height * 0.3}px`;
  n.style.animationDuration = `${dur(900)}ms`;
  fx.appendChild(n);
  setTimeout(() => n.remove(), dur(950));
}

function pulse(uid: string, cls: string, ms: number): void {
  const el = unitEl(uid);
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function setHp(uid: string, hp: number): void {
  const b = app.b;
  const u = b ? findUnit(b, uid) : null;
  const el = unitEl(uid);
  if (!u || !el) return;
  const bar = el.querySelector('.hpbar i') as HTMLElement | null;
  const num = el.querySelector('.hpbar span');
  if (bar) bar.style.width = pct(hp / u.maxHp);
  if (num) num.textContent = String(hp);
}

function banner(text: string, cls = ''): void {
  const fx = document.getElementById('fx');
  if (!fx) return;
  const n = document.createElement('div');
  n.className = 'banner-fx ' + cls;
  n.textContent = text;
  fx.appendChild(n);
  setTimeout(() => n.remove(), dur(1100));
}

async function play(evs: Ev[]): Promise<void> {
  const b = app.b;
  if (!b) return;
  for (const e of evs) {
    if (app.b !== b) return;
    switch (e.k) {
      case 'turn':
        screenEl.querySelectorAll('.unit.active').forEach((x) => x.classList.remove('active'));
        unitEl(e.who)?.classList.add('active');
        break;
      case 'act': {
        const u = findUnit(b, e.who)!;
        const sk = SKILLS[e.skill];
        const hostile = sk.effects.some((x) => x.t === 'dmg');
        floatText(e.who, sk.name, 'skillname');
        if (hostile) {
          pulse(e.who, u.side === 'hero' ? 'lunge-up' : 'lunge-down', dur(320));
          await sleep(dur(170));
        } else {
          pulse(e.who, 'cast', dur(400));
          playSfx(sk.effects.some((x) => x.t === 'heal' || x.t === 'revive') ? 'heal' : 'buff');
          await sleep(dur(260));
        }
        break;
      }
      case 'dmg':
        setHp(e.who, e.hp);
        if (e.dot) {
          floatText(e.who, `-${e.amount}`, e.dot === 'burn' ? 'burn' : 'poison');
          pulse(e.who, 'hurt', dur(260));
          playSfx('debuff');
        } else {
          if (e.absorbed) floatText(e.who, `🛡${e.absorbed}`, 'absorb');
          if (e.amount > 0 || !e.absorbed) floatText(e.who, e.crit ? `${e.amount}!` : `${e.amount}`, e.crit ? 'crit' : 'dmg');
          pulse(e.who, 'hurt', dur(300));
          playSfx(e.absorbed && !e.amount ? 'block' : e.crit ? 'crit' : 'hit');
          if (e.crit && findUnit(b, e.who)?.side === 'hero' && navigator.vibrate) navigator.vibrate(20);
        }
        await sleep(dur(e.dot ? 300 : 200));
        break;
      case 'heal':
        setHp(e.who, e.hp);
        if (e.amount > 0) floatText(e.who, `+${e.amount}`, 'heal');
        await sleep(dur(150));
        break;
      case 'status': {
        const info = STATUS_INFO[e.kind];
        floatText(e.who, `${info.icon} ${info.name}`, info.good ? 'good' : 'bad');
        if (!info.good) playSfx('debuff');
        await sleep(dur(130));
        break;
      }
      case 'cleanse': floatText(e.who, 'Cured', 'good'); await sleep(dur(120)); break;
      case 'resist': floatText(e.who, 'Resisted', 'muted'); await sleep(dur(150)); break;
      case 'stunned':
        floatText(e.who, '💫 Stunned', 'bad');
        pulse(e.who, 'cast', dur(300));
        await sleep(dur(450));
        break;
      case 'death':
        unitEl(e.who)?.classList.add('dying');
        playSfx('death');
        await sleep(dur(420));
        break;
      case 'revive':
        refreshBattle();
        floatText(e.who, 'Revived!', 'heal');
        await sleep(dur(300));
        break;
      case 'summon':
        refreshBattle();
        pulse(e.who, 'appear', dur(500));
        await sleep(dur(350));
        break;
      case 'enrage':
        floatText(e.who, 'ENRAGED', 'crit');
        await sleep(dur(350));
        break;
      case 'wave':
        await sleep(dur(300));
        refreshBattle();
        battleMusic(b);
        banner(`Wave ${e.n + 1}`);
        playSfx('wave');
        await sleep(dur(900));
        break;
      case 'end':
        await sleep(dur(500));
        break;
    }
  }
}

function waitForChoice(): Promise<Choice | null> {
  return new Promise((resolve) => { app.pending = resolve; });
}

function choose(c: Choice | null): void {
  const p = app.pending;
  app.pending = null;
  if (p) p(c);
}

async function battleLoop(b: Battle): Promise<void> {
  while (app.b === b && !b.over) {
    while (app.paused && app.b === b) await sleep(150);
    if (!b.turn) {
      const ev = advance(b);
      refreshBattle();
      await play(ev);
      if (app.b !== b || b.over) break;
    }
    const u = current(b);
    if (!u) break;
    let ev: Ev[];
    if (u.side === 'enemy') {
      refreshBattle();
      await sleep(dur(380));
      if (app.b !== b) return;
      ev = enemyAct(b);
    } else if (app.s.settings.auto) {
      refreshBattle();
      await sleep(dur(300));
      if (app.b !== b) return;
      if (!app.s.settings.auto) continue;
      const c = autoChoice(b, u);
      ev = heroAct(b, c.skill, c.target);
    } else {
      app.sel = u.skills.find((k) => canUse(b, u, k)) ?? null;
      const wait = waitForChoice();
      refreshBattle();
      const c = await wait;
      if (app.b !== b) return;
      if (!c) continue;
      ev = heroAct(b, c.skill, c.target);
      if (!ev.length) continue;
    }
    app.sel = null;
    refreshBattle();
    await play(ev);
    if (app.b === b) refreshBattle();
  }
  if (app.b === b && b.over) await showResult(b);
}

/** The optional "watch an ad to double your gold" button for a win. */
function adButton(gold: number): string {
  const left = adsLeft(app.s, today());
  if (gold <= 0 || left <= 0) return '';
  return `<button class="adbtn" data-act="ad" data-gold="${gold}">▶ Watch an ad: +${gold} gold <small>${left} left today</small></button>`;
}

/** Stand-in for a real rewarded ad (AdMob on Android later): a short countdown the player can't skip. */
async function playRewardedAd(): Promise<boolean> {
  const layer = document.createElement('div');
  layer.className = 'adlayer';
  layer.innerHTML = '<div><small>Advertisement</small><b>Your ad here</b><span class="count">5</span></div>';
  document.body.appendChild(layer);
  for (let i = 5; i > 0; i--) { layer.querySelector('.count')!.textContent = String(i); await sleep(1000); }
  layer.remove();
  return true;
}

function showTrialResult(b: Battle, r: Rewards): void {
  const ups = levelUpsHtml(r);
  const mod = TRIAL_MODS[b.mod!];
  if (r.result === 'win') {
    playSfx('win');
    const item = r.item ? `<div class="loot">${sprite(ITEMS[r.item.id].art, 'ico')}<div><small>Trial reward</small><b>${ITEMS[r.item.id].name}</b><small>${statLine(itemStats(r.item))}</small></div></div>` : '';
    openModal(`
      <div class="result win">
        <h3>Trial complete</h3>
        <p class="muted">${mod.name} · ${r.trial!.repeat ? 'already won today, so no rewards this time' : `streak: ${r.trial!.streak} day${r.trial!.streak > 1 ? 's' : ''} 🔥`}</p>
        ${r.trial!.repeat ? '' : `<div class="rewards"><span class="chip">${coin()}+${r.gold}</span><span class="chip">✦ +${r.xp} XP</span></div>`}
        ${item}${ups}
        ${adButton(r.gold)}
        <p class="muted">A new trial opens at midnight UTC. Win on consecutive days for up to +50% gold.</p>
        <div class="btns"><button class="primary" data-act="leave">Map</button></div>
      </div>`, 'center');
  } else {
    playSfx('lose');
    openModal(`
      <div class="result lose">
        <h3>Trial failed</h3>
        <p class="muted">You can try again as many times as you like today.</p>
        ${r.xp ? `<div class="rewards"><span class="chip">✦ +${r.xp} XP</span></div>` : ''}${ups}
        <div class="btns"><button data-act="leave">Map</button><button class="primary" data-act="fight" data-id="trial">Retry</button></div>
      </div>`, 'center');
  }
}

function showTowerResult(b: Battle, r: Rewards): void {
  const ups = levelUpsHtml(r);
  const floor = r.tower!.floor;
  if (r.result === 'win') {
    playSfx('win');
    if (r.levelUps.length) setTimeout(() => playSfx('level'), 700);
    const item = r.item ? `<div class="loot">${sprite(ITEMS[r.item.id].art, 'ico')}<div><small>Spire boss reward</small><b>${ITEMS[r.item.id].name}</b><small>${statLine(itemStats(r.item))}</small></div></div>` : '';
    const next = towerFloor(floor + 1);
    openModal(`
      <div class="result win">
        <h3>Floor ${floor} cleared</h3>
        <p class="muted">New best: floor ${floor}. Next up: floor ${floor + 1}${next.stage.boss ? ', a boss floor' : ''}, enemy level ${towerLevel(floor + 1)}.</p>
        <div class="rewards"><span class="chip">${coin()}+${r.gold}</span><span class="chip">✦ +${r.xp} XP</span></div>
        ${item}${ups}
        ${adButton(r.gold)}
        <div class="btns"><button data-act="leave">Map</button><button class="primary" data-act="fight" data-id="tower">Climb on</button></div>
      </div>`, 'center');
  } else {
    playSfx('lose');
    openModal(`
      <div class="result lose">
        <h3>Thrown back from floor ${floor}</h3>
        <p class="muted">Your best is still floor ${app.s.tower.best}. Level up, upgrade gear or try another party, then climb again.</p>
        ${r.xp ? `<div class="rewards"><span class="chip">✦ +${r.xp} XP</span></div>` : ''}${ups}
        <div class="btns"><button data-act="leave">Map</button><button data-act="goheroes">Heroes</button><button class="primary" data-act="fight" data-id="tower">Retry</button></div>
      </div>`, 'center');
  }
}

function levelUpsHtml(r: Rewards): string {
  return r.levelUps.length
    ? `<div class="ups">${[...new Set(r.levelUps.map((x) => x.id))].map((id) => `<span>${heroDef(id).name} reached level ${heroState(app.s, id).level}!</span>`).join('')}</div>` : '';
}

async function showResult(b: Battle): Promise<void> {
  const r = finishBattle(app.s, b);
  save();
  if (b.mod) { showTrialResult(b, r); return; }
  if (r.tower) { showTowerResult(b, r); return; }
  const st = b.stage;
  const idx = STAGES.indexOf(st);
  const next = STAGES[idx + 1];
  const ups = levelUpsHtml(r);
  if (r.result === 'win') {
    playSfx('win');
    if (r.levelUps.length) setTimeout(() => playSfx('level'), 700);
    const item = r.item ? `<div class="loot">${sprite(ITEMS[r.item.id].art, 'ico')}<div><small>${r.first && st.drop === r.item.id ? 'Boss reward' : 'Found'}</small><b>${ITEMS[r.item.id].name}</b><small>${statLine(itemStats(r.item))}</small></div></div>` : '';
    const lastStage = idx === STAGES.length - 1 && r.first;
    openModal(`
      <div class="result win">
        <h3>${lastStage ? 'The Ember Gate is sealed!' : 'Victory'}</h3>
        <div class="bigstars">${starStr(r.stars)}</div>
        <ul class="goals small">
          <li class="ok">Won</li>
          <li class="${b.fallen ? 'no' : 'ok'}">No hero fell</li>
          <li class="${b.heroActions <= parFor(st) ? 'ok' : 'no'}">${b.heroActions} of ${parFor(st)} hero turns</li>
        </ul>
        <div class="rewards"><span class="chip">${coin()}+${r.gold}</span><span class="chip">✦ +${r.xp} XP</span></div>
        ${item}${ups}
        ${r.first ? HEROES.filter((d) => d.recruit && d.recruit.after === st.id).map((d) => `<div class="loot newhero">${sprite(d.art, 'ico')}<div><small>New recruit at the Tavern</small><b>${d.name} the ${d.cls}</b><small>${d.blurb}</small></div></div>`).join('') : ''}
        ${adButton(r.gold)}
        ${lastStage ? '<p class="muted">You beat the first version of Emberdeep. Thank you for playing! Replay stages for stars and loot.</p>' : ''}
        <div class="btns">
          <button data-act="leave">Map</button>
          <button data-act="fight" data-id="${b.stageId}">Replay</button>
          ${next && stageUnlocked(app.s, next.id) && !lastStage ? `<button class="primary" data-act="fight" data-id="${next.id}">Next</button>` : ''}
        </div>
      </div>`, 'center');
  } else {
    playSfx('lose');
    openModal(`
      <div class="result lose">
        <h3>Defeated</h3>
        <p class="muted">Your heroes limp back to the keep.</p>
        <div class="rewards"><span class="chip">✦ +${r.xp} XP</span></div>
        ${ups}
        <ul class="tips">
          <li>Replay earlier stages for gold and experience.</li>
          <li>Buy or upgrade gear at the Forge.</li>
          ${app.s.heroes.length > PARTY_SIZE ? '<li>Try a different party on the Heroes tab.</li>' : ''}
          <li>Use a taunt or shield when a big hit is aimed at a fragile hero.</li>
        </ul>
        <div class="btns"><button data-act="leave">Map</button><button data-act="goheroes">Heroes</button><button class="primary" data-act="fight" data-id="${b.stageId}">Retry</button></div>
      </div>`, 'center');
  }
}

function leaveBattle(): void {
  const b = app.b;
  app.b = null;
  app.sel = null;
  if (b) choose(null);
  closeModal();
  render();
}

// ---- Input

function onUnitTap(uid: string): void {
  const b = app.b;
  if (!b) return;
  const u = current(b);
  const tapped = findUnit(b, uid);
  if (!tapped) return;
  if (app.pending && u && u.side === 'hero' && app.sel) {
    const sk = SKILLS[app.sel];
    if (needsTarget(app.sel)) {
      if (validTargets(b, u, app.sel).includes(tapped)) { playSfx('tap'); choose({ skill: app.sel, target: uid }); return; }
      // Tapping an enemy while a hero-targeted skill is picked switches back to the basic attack.
      if (tapped.side === 'enemy' && tapped.hp > 0 && sk.target !== 'enemy' && validTargets(b, u, u.skills[0]).includes(tapped)) {
        playSfx('tap'); choose({ skill: u.skills[0], target: uid }); return;
      }
    } else {
      const affected = sk.target === 'self' ? [u] : sk.target === 'allies' ? alive(b.heroes) : alive(b.enemies);
      if (affected.includes(tapped)) { playSfx('tap'); choose({ skill: app.sel, target: null }); return; }
    }
  }
  showUnitInfo(tapped);
}

function showUnitInfo(u: Unit): void {
  const statuses = u.statuses.length
    ? u.statuses.map((s) => `<li><b>${STATUS_INFO[s.kind].icon} ${STATUS_INFO[s.kind].name}</b> ${s.turns} turn${s.turns > 1 ? 's' : ''}${s.kind === 'shield' ? ` · ${s.value} left` : ''}<span>${STATUS_INFO[s.kind].desc}</span></li>`).join('')
    : '<li class="muted">No effects.</li>';
  const skills = u.skills.map((k) => `<li><b>${SKILLS[k].name}</b>${SKILLS[k].cd ? `<i>${SKILLS[k].cd} turn cooldown</i>` : ''}<span>${SKILLS[k].desc}</span></li>`).join('');
  openModal(`
    <h3><small>${u.side === 'hero' ? heroDef(u.key).cls : u.boss ? 'Boss' : 'Enemy'} · Level ${u.level}</small>${u.name}</h3>
    <div class="info-sprite">${sprite(u.art, '', u.tint)}</div>
    <div class="stats"><div><small>HP</small>${u.hp}/${u.maxHp}</div><div><small>ATK</small>${Math.round(u.atk)}</div><div><small>DEF</small>${u.def}</div><div><small>SPD</small>${u.spd}</div></div>
    <h4>Effects</h4><ul class="list">${statuses}</ul>
    <h4>Skills</h4><ul class="list">${skills}</ul>
    <div class="btns"><button data-act="close">Close</button></div>`);
}

function onSkillTap(k: string): void {
  const b = app.b;
  if (!b || !app.pending) return;
  const u = current(b);
  if (!u || u.side !== 'hero' || !canUse(b, u, k)) return;
  playSfx('tap');
  if (app.sel === k && !needsTarget(k)) { choose({ skill: k, target: null }); return; }
  if (app.sel === k && needsTarget(k)) {
    // A second tap uses the skill on the only possible target.
    const v = validTargets(b, u, k);
    if (v.length === 1) { choose({ skill: k, target: v[0].uid }); return; }
  }
  app.sel = k;
  refreshBattle();
}

root.addEventListener('click', (ev) => {
  unlockAudio();
  const el = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el) {
    if (ev.target === modalEl && !modalEl.classList.contains('center')) closeModal();
    return;
  }
  const d = el.dataset;
  const s = app.s;
  switch (d.act) {
    case 'tab': app.tab = d.tab as Tab; playSfx('tap'); render(); break;
    case 'stage': playSfx('tap'); openStage(d.id!); break;
    case 'close': closeModal(); break;
    case 'fight': {
      if (d.id === 'trial') { if (trialUnlocked(s)) { app.b = null; startFight('trial'); } break; }
      if (d.id === 'tower') { if (towerUnlocked(s)) { app.b = null; startFight('tower'); } break; }
      const st = stageDef(d.id!);
      if (!stageUnlocked(s, st.id)) break;
      app.b = null;
      startFight(st.id);
      break;
    }
    case 'leave': leaveBattle(); break;
    case 'trial': playSfx('tap'); openTrial(); break;
    case 'tower': playSfx('tap'); openTower(); break;
    case 'tithe': {
      const got = claimTithe(s, Date.now());
      if (!got) break;
      save(); playSfx('coin'); render();
      openModal(`<div class="result win"><h3>Tithe collected</h3>
        <div class="rewards"><span class="chip">${coin()}+${got}</span></div>
        <p class="muted">The spire keeps paying while you're away, more the higher you climb.</p>
        ${adButton(got)}
        <div class="btns"><button data-act="tower">Spire</button><button class="primary" data-act="close">Done</button></div></div>`, 'center');
      break;
    }
    case 'ad': {
      const gold = Number(d.gold);
      el.setAttribute('disabled', '');
      void playRewardedAd().then((ok) => {
        if (ok && claimAdBonus(s, gold, today())) { save(); playSfx('coin'); toast(`+${gold} gold!`); el.remove(); }
        else el.removeAttribute('disabled');
      });
      break;
    }
    case 'goheroes': app.tab = 'heroes'; leaveBattle(); break;
    case 'goforge': app.tab = 'forge'; app.forgeTab = 'shop'; closeModal(); render(); break;
    case 'slot': openSlot(d.hero!, d.slot as Slot); break;
    case 'pslot': openPartySlot(Number(d.slot), d.id); break;
    case 'setparty':
      if (setPartySlot(s, Number(d.slot), d.hero!)) { save(); playSfx('buff'); }
      render();
      if (d.id === 'tower') openTower(); else if (d.id) openStage(d.id); else closeModal();
      break;
    case 'recruit':
      if (recruitHero(s, d.hero!)) {
        save(); playSfx('level');
        toast(`${heroDef(d.hero!).name} joins at level ${heroState(s, d.hero!).level}! Tap a party slot to bring them along.`);
      }
      render();
      break;
    case 'equip':
      equip(s, d.hero!, d.slot as Slot, Number(d.uid));
      save(); playSfx('buff'); closeModal(); render();
      break;
    case 'unequip': equip(s, d.hero!, d.slot as Slot, null); save(); closeModal(); render(); break;
    case 'forgetab': app.forgeTab = d.t as 'shop' | 'bag'; render(); break;
    case 'buy': {
      const inst = buyItem(s, d.id!);
      if (!inst) break;
      playSfx('coin');
      // Put it straight on a hero whose slot is empty.
      const d2 = ITEMS[inst.id];
      const h = s.heroes.find((x) => canEquip(x.id, d2.id) && x.gear[d2.slot] === null);
      if (h) { equip(s, h.id, d2.slot, inst.uid); toast(`${heroDef(h.id).name} equipped the ${d2.name}.`); }
      else toast(`Bought the ${d2.name}. Equip it from Heroes.`);
      save(); render();
      break;
    }
    case 'upgrade': if (upgradeItem(s, Number(d.uid))) { playSfx('level'); save(); render(); } break;
    case 'sell': {
      const inst = itemInst(s, Number(d.uid));
      if (!inst) break;
      const w = wornBy(s, inst.uid);
      if (w && !el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Sure?'; break; }
      const got = sellItem(s, inst.uid);
      playSfx('coin'); toast(`Sold for ${got} gold.`); save(); render();
      break;
    }
    case 'settings': openSettings(); break;
    case 'sound': s.settings.sound = !s.settings.sound; setSound(s.settings.sound); save(); openSettings(); break;
    case 'music': s.settings.music = !s.settings.music; setMusic(s.settings.music); save(); openSettings(); break;
    case 'reset':
      if (!el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Really?'; break; }
      app.s = newState(); save(); closeModal(); app.tab = 'map'; render(); showIntro();
      break;
    case 'intro': s.seenIntro = true; save(); closeModal(); break;
    case 'unit': onUnitTap(d.uid!); break;
    case 'skill': onSkillTap(d.skill!); break;
    case 'fast': s.settings.fast = !s.settings.fast; save(); el.classList.toggle('on', s.settings.fast); break;
    case 'auto':
      s.settings.auto = !s.settings.auto; save();
      el.classList.toggle('on', s.settings.auto);
      if (s.settings.auto && app.pending) choose(null); else refreshBattle();
      break;
    case 'pause':
      app.paused = true;
      openModal(`<h3>Paused</h3>
        <div class="item"><div><b>Sound</b></div><button class="sm ${s.settings.sound ? 'primary' : ''}" data-act="psound">${s.settings.sound ? 'On' : 'Off'}</button></div>
        <div class="btns"><button class="danger" data-act="retreat">Retreat</button><button class="primary" data-act="close">Resume</button></div>`);
      break;
    case 'psound': s.settings.sound = !s.settings.sound; setSound(s.settings.sound); save(); el.textContent = s.settings.sound ? 'On' : 'Off'; el.classList.toggle('primary', s.settings.sound); break;
    case 'retreat': leaveBattle(); break;
  }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

setSound(app.s.settings.sound);
setMusic(app.s.settings.music);
render();
if (!app.s.seenIntro) showIntro();
