// Small inline SVG icons for generators, upgrades and currencies (64x64 viewBox).

function svg(body: string): string {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

const ICON_PEARL = svg(`<defs><radialGradient id="pg" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#f3ecff"/><stop offset="1" stop-color="#b9a6d8"/></radialGradient></defs><circle cx="32" cy="32" r="22" fill="url(#pg)"/><circle cx="24" cy="23" r="6" fill="#fff" opacity=".9"/>`);

const ICON_MOON = svg(`<circle cx="32" cy="32" r="22" fill="#cfe3ff"/><circle cx="40" cy="26" r="20" fill="#0b2340"/><circle cx="22" cy="38" r="3" fill="#9fbde6"/><circle cx="28" cy="46" r="2" fill="#9fbde6"/>`);

const GEN_ICONS: string[] = [
  // Hermit crab
  svg(`<path d="M18 40c0-12 10-22 22-22 8 0 12 6 12 12 0 10-10 14-20 14z" fill="#e7b46a"/><path d="M24 36c4-8 12-12 20-10" stroke="#b07a35" stroke-width="3" fill="none"/><ellipse cx="22" cy="46" rx="12" ry="7" fill="#ff6b4a"/><circle cx="16" cy="38" r="3" fill="#222"/><circle cx="24" cy="37" r="3" fill="#222"/><path d="M10 48l-5 4M12 51l-3 6M32 50l4 6M34 46l6 3" stroke="#ff6b4a" stroke-width="3" stroke-linecap="round"/><circle cx="8" cy="42" r="4" fill="#ff6b4a"/>`),
  // Seahorse
  svg(`<path d="M30 10c8 0 12 6 10 12l-6 4c6 4 8 12 4 18-3 5-1 9 3 9 3 0 4-3 2-5" stroke="#ffb547" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M38 14l12-2-10 8z" fill="#ffb547"/><circle cx="33" cy="15" r="2.5" fill="#222"/><path d="M28 30l-6 4 6 3" fill="#ffd37f"/>`),
  // Kelp
  svg(`<path d="M20 60C14 44 26 36 20 18 18 12 22 6 22 6" stroke="#3fae6a" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M36 60c6-14-6-24 2-38 3-5 2-10 2-10" stroke="#55c97f" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M48 60c-4-10 4-18 0-28" stroke="#2f8f56" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="28" cy="58" rx="8" ry="4" fill="#f3ecff"/>`),
  // Lanternfish
  svg(`<ellipse cx="30" cy="34" rx="18" ry="10" fill="#4a7fd6"/><path d="M46 34l12-9v18z" fill="#3a66b3"/><circle cx="20" cy="32" r="3" fill="#fff"/><circle cx="26" cy="40" r="2" fill="#9ff7ff"/><circle cx="33" cy="41" r="2" fill="#9ff7ff"/><circle cx="40" cy="39" r="2" fill="#9ff7ff"/><circle cx="12" cy="18" r="4" fill="#9ff7ff" opacity=".8"/><path d="M14 22c2 4 4 6 6 8" stroke="#4a7fd6" stroke-width="2" fill="none"/>`),
  // Octopus
  svg(`<ellipse cx="32" cy="24" rx="16" ry="15" fill="#c95bd6"/><path d="M18 34c-4 10-10 12-12 18M24 36c-2 10-4 14-8 20M32 38v20M40 36c2 10 4 14 8 20M46 34c4 10 10 12 12 18" stroke="#c95bd6" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="26" cy="24" r="4" fill="#fff"/><circle cx="38" cy="24" r="4" fill="#fff"/><circle cx="27" cy="25" r="2" fill="#222"/><circle cx="39" cy="25" r="2" fill="#222"/>`),
  // Jellyfish
  svg(`<path d="M12 30c0-12 9-20 20-20s20 8 20 20c-6 3-34 3-40 0z" fill="#ff8fd8" opacity=".9"/><path d="M18 32c0 8-4 12-2 20M26 33c2 10-2 14 0 22M38 33c-2 10 2 14 0 22M46 32c0 8 4 12 2 20" stroke="#ffc2ec" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="26" cy="20" rx="5" ry="3" fill="#fff" opacity=".6"/>`),
  // Anglerfish
  svg(`<path d="M10 38c0-12 12-20 26-18 10 2 18 10 18 18s-8 14-20 14c-12 0-24-4-24-14z" fill="#3b3456"/><path d="M12 40l10 2-8 4z" fill="#fff"/><path d="M14 38l4 4 4-4 4 4 4-4" stroke="#fff" stroke-width="2" fill="none"/><path d="M30 20c-2-10 6-14 10-12" stroke="#5c5480" stroke-width="2.5" fill="none"/><circle cx="41" cy="9" r="5" fill="#fff6a1"/><circle cx="28" cy="30" r="3" fill="#ffe14a"/><path d="M52 36l8-6v14z" fill="#2c2742"/>`),
  // Giant squid
  svg(`<path d="M32 4c10 6 12 18 10 28H22C20 22 22 10 32 4z" fill="#e2463f"/><path d="M24 32c-6 8-10 16-14 26M28 32c-2 10-4 18-6 26M32 32v26M36 32c2 10 4 18 6 26M40 32c6 8 10 16 14 26" stroke="#e2463f" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="27" cy="24" r="3.5" fill="#fff"/><circle cx="37" cy="24" r="3.5" fill="#fff"/><circle cx="27" cy="24" r="1.6" fill="#222"/><circle cx="37" cy="24" r="1.6" fill="#222"/>`),
  // Hydrothermal vent
  svg(`<path d="M18 60l6-26h16l6 26z" fill="#5a4a44"/><path d="M24 34l2-6h12l2 6z" fill="#7a645a"/><path d="M32 28c-6-6 4-10-2-16s4-8 0-10" stroke="#ff9a3d" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/><circle cx="20" cy="14" r="5" fill="#9b8d86" opacity=".6"/><circle cx="44" cy="10" r="6" fill="#9b8d86" opacity=".5"/><circle cx="32" cy="46" r="3" fill="#ffcf6b"/>`),
  // Sunken galleon
  svg(`<path d="M6 40h52l-8 14H14z" fill="#7a4a2a"/><path d="M14 40l2-6h30l4 6" fill="#93603a"/><path d="M30 8v32M44 14v26" stroke="#5a3a20" stroke-width="3"/><path d="M30 10l-14 22h14zM44 16l-10 16h10z" fill="#d9cfb8" opacity=".7"/><circle cx="20" cy="47" r="2.5" fill="#222"/><circle cx="30" cy="47" r="2.5" fill="#222"/><circle cx="40" cy="47" r="2.5" fill="#222"/><rect x="40" y="52" width="14" height="8" rx="2" fill="#c08a2c"/><circle cx="47" cy="52" r="3" fill="#ffe08a"/>`),
  // Leviathan
  svg(`<path d="M4 42c8-14 22-24 38-22 10 1 18 8 18 16-10-4-16 0-22 6s-18 10-34 0z" fill="#2b8a8a"/><path d="M14 40c10 4 20 2 28-6" stroke="#5fd1c4" stroke-width="2" fill="none"/><circle cx="48" cy="28" r="3" fill="#ffe14a"/><path d="M30 22l4-10 4 9M38 21l5-9 3 10" fill="#1f6b6b"/><path d="M6 42l-4 8 10-4" fill="#1f6b6b"/>`),
  // Trench forge
  svg(`<path d="M10 58l8-34h28l8 34z" fill="#2d2f3a"/><rect x="22" y="34" width="20" height="16" rx="3" fill="#ff7a2a"/><rect x="25" y="38" width="14" height="9" rx="2" fill="#ffd36b"/><path d="M14 24h36l-4-8H18z" fill="#40434f"/><path d="M24 14c0-6 6-6 6-12M38 14c0-5 4-6 4-10" stroke="#8fa3c0" stroke-width="3" fill="none" opacity=".7"/>`),
  // Abyssal cathedral
  svg(`<path d="M12 60V30l8-10 8 10v30zM36 60V30l8-10 8 10v30z" fill="#3a2f63"/><path d="M24 60V22l8-16 8 16v38z" fill="#4b3d80"/><path d="M28 60V44a4 4 0 018 0v16z" fill="#c9b8ff"/><circle cx="32" cy="26" r="4" fill="#a9f0ff"/><circle cx="20" cy="36" r="2.5" fill="#a9f0ff"/><circle cx="44" cy="36" r="2.5" fill="#a9f0ff"/>`),
];

const KIND_ICONS: Record<string, string> = {
  tap: svg(`<path d="M24 58V30a5 5 0 0110 0v12l14 3c4 1 6 4 5 8l-2 5z" fill="#ffd9b8"/><path d="M29 8v10M16 14l6 6M42 14l-6 6" stroke="#9ff7ff" stroke-width="3" stroke-linecap="round"/>`),
  mop: svg(`<path d="M8 36c8-18 40-18 48 0-8 14-40 14-48 0z" fill="#d7c9f2"/><path d="M14 36c6-10 30-10 36 0" stroke="#a48fd0" stroke-width="2" fill="none"/><circle cx="32" cy="38" r="9" fill="#fff"/>`),
  rhythm: svg(`<path d="M4 34c8-12 14-12 20 0s14 12 20 0 12-12 16-4" stroke="#5ad1ff" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M4 48c8-12 14-12 20 0s14 12 20 0 12-12 16-4" stroke="#2e86c1" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  slack: svg(`<path d="M6 32h52" stroke="#5ad1ff" stroke-width="5" stroke-linecap="round"/><path d="M6 44c10-4 42-4 52 0" stroke="#2e86c1" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="32" cy="18" r="8" fill="#ffe08a"/>`),
  lure: svg(`<path d="M30 6v26" stroke="#ccc" stroke-width="2"/><path d="M16 40c8-12 24-12 32 0-8 12-24 12-32 0z" fill="#ffc93c"/><path d="M48 40l8-6v12z" fill="#ffb000"/><circle cx="24" cy="38" r="2.5" fill="#222"/>`),
  slow: svg(`<path d="M10 40c8-12 24-12 32 0-8 12-24 12-32 0z" fill="#ffc93c"/><path d="M42 40l8-6v12z" fill="#ffb000"/><circle cx="32" cy="18" r="10" fill="none" stroke="#9ff7ff" stroke-width="3"/><path d="M32 12v6l4 3" stroke="#9ff7ff" stroke-width="3" fill="none"/>`),
  research: svg(`<path d="M24 6h16M28 6v18L14 52c-2 4 0 6 4 6h28c4 0 6-2 4-6L36 24V6" stroke="#bfe9ff" stroke-width="3" fill="#0d2a44"/><path d="M18 46h28l4 6c0 2-2 3-4 3H18c-2 0-4-1-4-3z" fill="#4be0c0"/><circle cx="28" cy="42" r="3" fill="#4be0c0"/>`),
  crab: '',
};
KIND_ICONS.crab = GEN_ICONS[0];

function upgradeIcon(u: UpgradeDef): string {
  if (u.kind === 'tier' && u.gen !== undefined) return GEN_ICONS[u.gen];
  return KIND_ICONS[u.kind] || ICON_PEARL;
}

// A branching coral in the given color, drawn at a fixed pixel size.
function coralSvg(color: string, size: number): string {
  return `<svg class="coral" style="width:${size}px;height:${size}px;flex:none" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round">
    <path d="M32 60V34M32 40L18 26V12M18 26L10 20M32 34L46 22V8M46 22L54 16M32 46L44 40V30"/></g>
    <g fill="${color}"><circle cx="18" cy="11" r="4"/><circle cx="10" cy="19" r="4"/><circle cx="46" cy="7" r="4"/><circle cx="54" cy="15" r="4"/><circle cx="44" cy="29" r="4"/></g>
    <ellipse cx="32" cy="60" rx="12" ry="3" fill="#000" opacity=".25"/></svg>`;
}
