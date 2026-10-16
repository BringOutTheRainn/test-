// The buildings that produce Stardust per second. Order matters: each one is
// revealed after the previous one has been bought.

export interface GeneratorDef {
  id: string;
  name: string;
  baseCost: number;
  baseSps: number;
  flavor: string;
}

export const COST_GROWTH = 1.15;

export const GENERATORS: GeneratorDef[] = [
  { id: 'drone', name: 'Mining Drone', baseCost: 15, baseSps: 0.1, flavor: 'A tiny robot that chips at the rock while you sleep.' },
  { id: 'harvester', name: 'Asteroid Harvester', baseCost: 100, baseSps: 1, flavor: 'Swallows small asteroids whole and spits out dust.' },
  { id: 'lunar', name: 'Lunar Base', baseCost: 1100, baseSps: 8, flavor: 'Low gravity, high yield. The coffee is terrible.' },
  { id: 'station', name: 'Orbital Station', baseCost: 12000, baseSps: 47, flavor: 'Sorts and refines dust in perfect free fall.' },
  { id: 'siphon', name: 'Gas Giant Siphon', baseCost: 130000, baseSps: 260, flavor: 'A very long straw dipped into a very large planet.' },
  { id: 'reactor', name: 'Fusion Reactor', baseCost: 1.4e6, baseSps: 1400, flavor: 'Squeezes hydrogen until it gives up its stardust.' },
  { id: 'dyson', name: 'Dyson Swarm', baseCost: 2e7, baseSps: 7800, flavor: 'Millions of mirrors politely asking a star for its light.' },
  { id: 'warp', name: 'Warp Gate', baseCost: 3.3e8, baseSps: 44000, flavor: 'Imports stardust from places that never noticed it was gone.' },
  { id: 'nebula', name: 'Nebula Refinery', baseCost: 5.1e9, baseSps: 260000, flavor: 'Filters a whole nebula through a cosmic coffee filter.' },
  { id: 'forge', name: 'Star Forge', baseCost: 7.5e10, baseSps: 1.6e6, flavor: 'Builds new stars purely to mine them.' },
  { id: 'quasar', name: 'Quasar Tap', baseCost: 1e12, baseSps: 1e7, flavor: 'Plugs into the brightest objects in the universe.' },
  { id: 'wormhole', name: 'Wormhole Network', baseCost: 1.4e13, baseSps: 6.5e7, flavor: 'Every shortcut in spacetime, and a few that should not exist.' },
  { id: 'galaxy', name: 'Galaxy Engine', baseCost: 1.7e14, baseSps: 4.3e8, flavor: 'Spins whole galaxies like turbines.' },
  { id: 'compiler', name: 'Universe Compiler', baseCost: 2.1e15, baseSps: 2.9e9, flavor: 'Rewrites physics so that stardust is the default state of matter.' },
];

export const GEN_INDEX: Record<string, number> = Object.fromEntries(GENERATORS.map((g, i) => [g.id, i]));
