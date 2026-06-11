import type { PieceType } from './types';
import { PIECE_TYPES } from './constants';
import { createRng } from './rng';

export interface Bag {
  next(): PieceType;
  peek(count: number): PieceType[];
  /** 丟棄目前佇列（道具 reroll 用）；之後的 next/peek 由同一 rng 續抽新袋，確定性不變。 */
  discard(): void;
}

/** 7-bag：每袋含 7 種各一，洗牌後依序發出，袋空再補新袋。 */
export function createBag(seed: number): Bag {
  const rng = createRng(seed);
  let queue: PieceType[] = [];

  function refill(): void {
    const bag = [...PIECE_TYPES];
    // Fisher–Yates 洗牌
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    queue.push(...bag);
  }

  function ensure(count: number): void {
    while (queue.length < count) refill();
  }

  return {
    next(): PieceType {
      ensure(1);
      return queue.shift()!;
    },
    peek(count: number): PieceType[] {
      ensure(count);
      return queue.slice(0, count);
    },
    discard(): void {
      queue = [];
    },
  };
}
