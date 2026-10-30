/**
 * Plan your next quests and know what to bring.
 * Run with: npx tsx examples/quest-planner.ts
 */
import { createArcRaidersClient } from '../src';

const client = createArcRaidersClient();

// The quests you already finished, e.g. from your own save tracker.
const completed = ['picking-up-the-pieces', 'clearer-skies'];

const graph = await client.quests.graph();
const available = graph.available(completed);
console.log('You can start now:');
for (const quest of available.slice(0, 10)) console.log(`  ${quest.name} (${quest.trader_name})`);

const list = await client.quests.shoppingList(available.map((q) => q.id));
console.log('\nStash these before your next raid:');
for (const entry of list.slice(0, 10)) {
  console.log(
    `  ${entry.quantity}x ${entry.item.name}  for ${entry.neededFor.map((n) => n.questName).join(', ')}`
  );
}

console.log('\nPath to "A Bad Feeling":');
for (const [i, quest] of graph.chain('a-bad-feeling').entries())
  console.log(`  ${i + 1}. ${quest.name}`);
