// Headlines for the news ticker. Each shows once its condition is met.

import type { GameState } from '../core/state.js';

export interface Headline {
  text: string;
  when?: (s: GameState) => boolean;
}

const owns = (gen: number, n = 1) => (s: GameState) => s.generators[gen] >= n;
const earned = (n: number) => (s: GameState) => s.earnedRun >= n;

export const NEWS: Headline[] = [
  { text: 'Local asteroid reports being tapped repeatedly. "It tickles," says rock.' },
  { text: 'Astronomers baffled by sparkly dust cloud forming in empty sector.' },
  { text: 'Stardust declared "probably not edible" by Galactic Food Authority.' },
  { text: 'Survey: 9 out of 10 space miners prefer tapping to paperwork.' },
  { text: 'Mining Drones unionize, demand more lubricant and fewer collisions.', when: owns(0, 5) },
  { text: 'Drone swarm spells "HI MOM" across asteroid surface.', when: owns(0, 20) },
  { text: 'Asteroid Harvester eats its own instruction manual. Production unaffected.', when: owns(1) },
  { text: 'Belt residents complain asteroids are going missing. Harvesters say nothing.', when: owns(1, 10) },
  { text: 'Lunar Base opens first gift shop. Best seller: a jar of regular dust.', when: owns(2) },
  { text: 'Moon tourism booms as Lunar Base adds a second, slightly larger window.', when: owns(2, 10) },
  { text: 'Orbital Station crew celebrates 1,000th sunrise today. And yesterday. And earlier today.', when: owns(3) },
  { text: 'Gas Giant files formal complaint about "the straw."', when: owns(4) },
  { text: 'Gas Giant noticeably smaller. Scientists: "it was always that size."', when: owns(4, 25) },
  { text: 'Fusion Reactor achieves net positive vibes.', when: owns(5) },
  { text: 'Star asks Dyson Swarm for "a little personal space."', when: owns(6) },
  { text: 'Warp Gate accidentally imports a small, confused cow.', when: owns(7) },
  { text: 'Nebula Refinery reports nebula is "about 40% coffee grounds."', when: owns(8) },
  { text: 'Star Forge produces first artisanal, hand-crafted star.', when: owns(9) },
  { text: 'Quasar Tap blamed for brightest night in 12 billion years.', when: owns(10) },
  { text: 'Wormhole Network adds express lane; arrival now before departure.', when: owns(11) },
  { text: 'Galaxy Engine spins up. Several civilizations report mild dizziness.', when: owns(12) },
  { text: 'Universe Compiler throws warning: "physics deprecated, use stardust instead."', when: owns(13) },
  { text: 'Economists warn of stardust inflation. Nobody listens. Number goes up.', when: earned(1e6) },
  { text: 'Your empire now visible from neighbouring galaxies as "the sparkly one."', when: earned(1e9) },
  { text: 'Philosophers ask: if a stardust falls in the void, does it still count? (Yes.)', when: earned(1e10) },
  { text: 'Celestial body promoted. Former colleagues say it "has changed."', when: earned(1e5) },
  { text: 'Comet spotted! Experts advise tapping it immediately.', when: (s) => s.cometsAll >= 1 },
  { text: 'Black comets sighted. Insurance companies refuse to comment.', when: (s) => !!s.cosmic.black },
  { text: 'Scientists warn universe is "getting a bit full."', when: earned(1e12) },
  { text: 'Universe collapses, restarts. Most residents did not notice.', when: (s) => s.collapses >= 1 },
  { text: 'Dark Matter found in your pocket. Again.', when: (s) => s.darkMatter >= 10 },
  { text: 'Probe returns from expedition with souvenirs and a strange rash.', when: (s) => s.expeditionsDone >= 1 },
  { text: 'Breaking: thing in space is still in space.' },
  { text: 'Weather report: 100% chance of stardust, with scattered comets.' },
];

export function availableNews(s: GameState): string[] {
  return NEWS.filter((n) => !n.when || n.when(s)).map((n) => n.text);
}
