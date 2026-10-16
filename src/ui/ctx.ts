// The shared context the screens use to read and change the game.

import type { Derived } from '../core/economy.js';
import type { GameState } from '../core/state.js';
import type { Sky } from './sky.js';

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface Ctx {
  s: GameState;
  d: Derived;
  sky: Sky;
  buyAmount: BuyAmount;
  /** Recompute derived numbers after a purchase or state change. */
  recalc(): void;
  save(): void;
  /** Swap in a new state (import, hard reset). */
  replaceState(s: GameState): void;
  /** Force every panel to rebuild on the next refresh. */
  dirty(): void;
  showTab(id: string): void;
}

export interface Panel {
  /** Called a few times a second while the tab is visible. */
  refresh(ctx: Ctx): void;
}
