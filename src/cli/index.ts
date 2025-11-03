#!/usr/bin/env node

import { createArcRaidersClient } from '../arc-raiders/client';
import { exportToJSON, exportToJSONString } from '../export/json';
import { exportToCSV, exportToCSVString } from '../export/csv';
import { getWeaponStats, getRarityDistribution, findBestWeapon } from '../analytics/stats';

const client = createArcRaidersClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Arc Raiders API CLI

Usage:
  arc-raiders <command> [options]

Commands:
  items          List all items
  weapons        List all weapons
  quests         List all quests
  arcs           List all ARCs
  traders        List all traders
  export <type>  Export data (json|csv)
  stats          Show statistics
  help           Show this help message

Examples:
  arc-raiders items
  arc-raiders weapons --rarity legendary
  arc-raiders export json --output data.json
  arc-raiders stats
    `);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'items': {
        const items = await client.getItems();
        console.log(JSON.stringify(items, null, 2));
        break;
      }

      case 'weapons': {
        const rarityIndex = args.indexOf('--rarity');
        const rarity = rarityIndex !== -1 ? args[rarityIndex + 1] : undefined;
        const weapons = await client.getWeapons(rarity ? { rarity: rarity as any } : undefined);
        console.log(JSON.stringify(weapons, null, 2));
        break;
      }

      case 'quests': {
        const quests = await client.getQuests();
        console.log(JSON.stringify(quests, null, 2));
        break;
      }

      case 'arcs': {
        const arcs = await client.getARCs();
        console.log(JSON.stringify(arcs, null, 2));
        break;
      }

      case 'traders': {
        const traders = await client.getTraders();
        console.log(JSON.stringify(traders, null, 2));
        break;
      }

      case 'export': {
        const type = args[1];
        const outputIndex = args.indexOf('--output');
        const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
        
        if (!type || !['json', 'csv'].includes(type)) {
          console.error('Invalid export type. Use "json" or "csv"');
          process.exit(1);
        }

        const items = await client.getItems();
        
        if (type === 'json') {
          if (output) {
            await exportToJSON(items, output);
            console.log(`Exported ${items.length} items to ${output}`);
          } else {
            console.log(exportToJSONString(items));
          }
        } else if (type === 'csv') {
          if (output) {
            await exportToCSV(items, output);
            console.log(`Exported ${items.length} items to ${output}`);
          } else {
            console.log(exportToCSVString(items));
          }
        }
        break;
      }

      case 'stats': {
        const weapons = await client.getWeapons();
        const items = await client.getItems();
        
        const weaponStats = getWeaponStats(weapons);
        const rarityDist = getRarityDistribution(items);
        const bestWeapon = findBestWeapon(weapons);

        console.log(JSON.stringify({
          weapons: {
            total: weapons.length,
            stats: weaponStats,
            best: bestWeapon ? {
              name: bestWeapon.name,
              damage: bestWeapon.damage,
            } : null,
          },
          items: {
            total: items.length,
            rarityDistribution: rarityDist,
          },
        }, null, 2));
        break;
      }

      case 'help':
      default: {
        console.log(`
Arc Raiders API CLI

Usage:
  arc-raiders <command> [options]

Commands:
  items          List all items
  weapons        List all weapons
  quests         List all quests
  arcs           List all ARCs
  traders        List all traders
  export <type>  Export data (json|csv)
  stats          Show statistics
  help           Show this help message

Examples:
  arc-raiders items
  arc-raiders weapons --rarity legendary
  arc-raiders export json --output data.json
  arc-raiders stats
        `);
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();

