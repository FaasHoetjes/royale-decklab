import type { Side } from './types';

/**
 * Snake draft order. With two picks per round and the leader alternating each
 * round, a player-first 16-pick draft yields the classic pattern:
 *
 *   P C C P P C C P  P C C P P C C P
 *
 * so neither side gets every first-of-round advantage. The order is generated
 * from `firstPicker` rather than hard-coded so we can randomize who starts later.
 */
export function snakeOrder(firstPicker: Side, totalPicks = 16): Side[] {
  const second: Side = firstPicker === 'player' ? 'computer' : 'player';
  const order: Side[] = [];
  let round = 0;
  while (order.length < totalPicks) {
    const pair: Side[] = round % 2 === 0 ? [firstPicker, second] : [second, firstPicker];
    order.push(...pair);
    round++;
  }
  return order.slice(0, totalPicks);
}
