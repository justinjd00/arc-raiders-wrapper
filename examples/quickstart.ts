/**
 * Run with: npx tsx examples/quickstart.ts
 */
import { ATTRIBUTION, createArcRaidersClient, isArcRaidersError, rankByStat } from '../src';

const client = createArcRaidersClient();

try {
  // Everything legendary, regardless of how you spell it.
  const legendary = await client.items.all({ rarity: 'legendary' });
  console.log(`${legendary.length} legendary items`);

  // Strongest shotguns by damage.
  const shotguns = await client.weapons.all({ weaponClass: 'Shotgun' });
  for (const { item, value } of rankByStat(shotguns, 'damage', { limit: 3 })) {
    console.log(`${item.name}: ${value} damage`);
  }

  // What is running right now?
  for (const event of await client.events.active()) {
    console.log(`Live: ${event.name} on ${event.map}`);
  }

  // Typo tolerant search.
  const [hit] = await client.search('matriach reactor');
  console.log(`Best match: ${hit?.name}`);

  // Should I keep it?
  const usage = await client.itemUsage('matriarch-reactor');
  console.log(usage.keep ? 'Keep it.' : 'Recycle it.');
} catch (error) {
  if (isArcRaidersError(error)) console.error(`${error.code}: ${error.message}`);
  else throw error;
}

console.log(ATTRIBUTION.text, ATTRIBUTION.url);
