import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ArcRaidersClient, ATTRIBUTION } from '../arc-raiders/client';
import type { Item } from '../arc-raiders/types';
import { isArcRaidersError } from '../core/errors';
import {
  rankByStat,
  rarityDistribution,
  statSummary,
  typeDistribution,
  valuePerWeight,
} from '../helpers/analytics';
import { msUntil } from '../helpers/events';
import { toCSV, toJSON } from '../helpers/export';
import { VERSION } from '../version';
import { FileCache } from './file-cache';

const HELP = `arc-raiders ${VERSION}, ARC Raiders game data from the terminal

Usage
  arc-raiders <command> [args] [options]

Data
  items                     List items           --rarity --type --search
  weapons                   List weapons         --rarity --class --search
  item <id>                 Item details with stats
  quests                    List quests
  quest <id>                Quest details        --chain  (all prerequisites in order)
  arcs                      List ARC enemies     --loot
  traders [name]            Trader inventories
  ermal                     Ermal's current offers and services
  events                    Running and upcoming events   --map

Tools
  search <query>            Fuzzy search over items, quests and ARCs
  usage <item-id>           Keep or recycle? Quests, ARCs, traders and Ermal using an item
  rank <stat>               Rank weapons by a stat, e.g. damage, fireRate, range   --asc
  value                     Best coins per weight, to decide what to carry out
  stats                     Distributions and stat summaries
  export <items|weapons|quests|arcs>   --format json|csv  --out <file>  --delimiter ";"
  cache clear               Delete the local cache

Options
  --json          Raw JSON output
  --limit <n>     Max rows (default 25, 0 = all)
  --no-cache      Skip the local cache for this call
  -v, --version   Print version
  -h, --help      Show this help

${ATTRIBUTION.text}: ${ATTRIBUTION.url}
`;

const options = {
  json: { type: 'boolean' },
  limit: { type: 'string' },
  'no-cache': { type: 'boolean' },
  rarity: { type: 'string' },
  type: { type: 'string' },
  class: { type: 'string' },
  search: { type: 'string' },
  map: { type: 'string' },
  loot: { type: 'boolean' },
  chain: { type: 'boolean' },
  asc: { type: 'boolean' },
  format: { type: 'string' },
  out: { type: 'string', short: 'o' },
  delimiter: { type: 'string' },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
} as const;

type Flags = ReturnType<typeof parse>['values'];

function parse(argv: string[]) {
  return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[22m` : s);

function table(rows: Array<Record<string, unknown>>, flags: Flags): void {
  const limit = flags.limit === undefined ? 25 : Number(flags.limit);
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  if (shown.length === 0) {
    console.log(dim('No results.'));
    return;
  }
  const cols = Object.keys(shown[0]!);
  const text = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.length > 60 ? `${s.slice(0, 57)}...` : s;
  };
  const widths = cols.map((c) => Math.max(c.length, ...shown.map((r) => text(r[c]).length)));
  console.log(bold(cols.map((c, i) => c.padEnd(widths[i]!)).join('  ')));
  for (const row of shown)
    console.log(cols.map((c, i) => text(row[c]).padEnd(widths[i]!)).join('  '));
  if (shown.length < rows.length)
    console.log(dim(`... ${rows.length - shown.length} more, use --limit 0 to show all`));
}

function out(data: unknown, rows: () => Array<Record<string, unknown>>, flags: Flags): void {
  if (flags.json) console.log(toJSON(data));
  else table(rows(), flags);
}

const itemRow = (i: Item) => ({
  id: i.id,
  name: i.name,
  type: i.item_type,
  rarity: i.rarity ?? '',
  value: i.value ?? '',
});

function duration(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function need(value: string | undefined, what: string): string {
  if (!value) throw new UsageError(`Missing ${what}.`);
  return value;
}

class UsageError extends Error {}

export async function run(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error((error as Error).message);
    console.error(dim('Run "arc-raiders --help" for usage.'));
    return 2;
  }
  const { values: flags, positionals } = parsed;
  const [command, arg] = positionals;

  if (flags.version) {
    console.log(VERSION);
    return 0;
  }
  if (flags.help || !command || command === 'help') {
    console.log(HELP);
    return 0;
  }

  const fileCache = new FileCache();
  const client = new ArcRaidersClient({ cache: { store: fileCache } });
  const call = { fresh: flags['no-cache'] === true };

  try {
    switch (command) {
      case 'items': {
        const items = await client.items.all(
          { rarity: flags.rarity, itemType: flags.type, search: flags.search },
          call
        );
        out(items, () => items.map(itemRow), flags);
        break;
      }
      case 'weapons': {
        const weapons = await client.weapons.all(
          { rarity: flags.rarity, weaponClass: flags.class?.split(','), search: flags.search },
          call
        );
        out(
          weapons,
          () =>
            weapons.map((w) => ({
              id: w.id,
              name: w.name,
              class: w.subcategory ?? '',
              rarity: w.rarity ?? '',
              damage: w.stat_block?.damage ?? '',
              fireRate: w.stat_block?.fireRate ?? '',
              range: w.stat_block?.range ?? '',
            })),
          flags
        );
        break;
      }
      case 'item': {
        const item = await client.items.get(need(arg, 'item id'), call);
        if (!item) throw new UsageError(`No item "${arg}". Try "arc-raiders search ${arg}".`);
        if (flags.json) {
          console.log(toJSON(item));
          break;
        }
        console.log(`${bold(item.name)}  ${dim(`${item.rarity ?? ''} ${item.item_type}`.trim())}`);
        if (item.description) console.log(item.description);
        console.log(
          `Value: ${item.value ?? 'n/a'}${item.workbench ? `   Crafted at: ${item.workbench}` : ''}`
        );
        const stats = Object.entries(item.stat_block ?? {}).filter(
          ([, v]) => v !== 0 && v !== '' && v !== null
        );
        if (stats.length)
          table(
            stats.map(([stat, value]) => ({ stat, value })),
            { ...flags, limit: '0' }
          );
        break;
      }
      case 'quests': {
        const quests = await client.quests.all(call);
        out(
          quests,
          () =>
            quests.map((q) => ({
              id: q.id,
              name: q.name,
              trader: q.trader_name,
              requires: q.manifest?.prerequisites.map((p) => p.name).join(', ') ?? '',
            })),
          flags
        );
        break;
      }
      case 'quest': {
        const id = need(arg, 'quest id');
        if (flags.chain) {
          const chain = await client.quests.chain(id, call);
          if (chain.length === 0) throw new UsageError(`No quest "${id}".`);
          out(
            chain,
            () =>
              chain.map((q, i) => ({ step: i + 1, id: q.id, name: q.name, trader: q.trader_name })),
            { ...flags, limit: '0' }
          );
          break;
        }
        const quest = await client.quests.get(id, call);
        if (!quest) throw new UsageError(`No quest "${id}".`);
        if (flags.json) {
          console.log(toJSON(quest));
          break;
        }
        console.log(`${bold(quest.name)}  ${dim(quest.trader_name)}`);
        if (quest.description) console.log(quest.description.trim());
        for (const o of quest.objectives) console.log(`  - ${o}`);
        if (quest.required_items.length)
          console.log(
            `Hand in: ${quest.required_items.map((r) => `${r.quantity}x ${r.item.name}`).join(', ')}`
          );
        const rewards = [
          ...quest.rewards.map((r) => `${r.quantity}x ${r.item.name}`),
          ...(quest.additional_rewards ?? []).map((r) => `${r.quantity} ${r.name}`),
        ];
        if (rewards.length) console.log(`Rewards: ${rewards.join(', ')}`);
        break;
      }
      case 'arcs': {
        const arcs = await client.arcs.all({ includeLoot: flags.loot }, call);
        out(
          arcs,
          () =>
            arcs.map((a) => ({
              id: a.id,
              name: a.name,
              ...(flags.loot ? { loot: (a.loot ?? []).map((l) => l.item.name).join(', ') } : {}),
            })),
          flags
        );
        break;
      }
      case 'traders': {
        if (arg) {
          const stock = await client.traders.get(arg, call);
          if (!stock) throw new UsageError(`No trader "${arg}".`);
          out(
            stock,
            () =>
              stock.map((i) => ({
                id: i.id,
                name: i.name,
                rarity: i.rarity ?? '',
                price: i.trader_price ?? '',
              })),
            flags
          );
        } else {
          const inv = await client.traders.inventories(call);
          out(
            inv,
            () => Object.entries(inv).map(([trader, stock]) => ({ trader, items: stock.length })),
            flags
          );
        }
        break;
      }
      case 'ermal': {
        const ermal = await client.traders.ermal(call);
        if (!ermal) throw new UsageError('No Ermal data right now.');
        out(
          ermal,
          () => [
            ...ermal.offers.map((o) => ({
              kind: 'offer',
              name: o.offer_title,
              coins: o.coin_cost,
              ends: o.offer_end.slice(0, 16).replace('T', ' '),
            })),
            ...ermal.permanent_services.map((s) => ({
              kind: 'service',
              name: s.name,
              coins: s.coin_cost,
              ends: '',
            })),
          ],
          flags
        );
        break;
      }
      case 'events': {
        const now = Date.now();
        const [active, upcoming] = await Promise.all([
          client.events.active({ map: flags.map }, call),
          client.events.upcoming({ map: flags.map, limit: 15 }, call),
        ]);
        if (flags.json) {
          console.log(toJSON({ active, upcoming }));
          break;
        }
        console.log(bold('Running now'));
        table(
          active.map((e) => ({
            event: e.name,
            map: e.map,
            ends: `in ${duration(e.endTime - now)}`,
          })),
          { ...flags, limit: '0' }
        );
        console.log(`\n${bold('Coming up')}`);
        table(
          upcoming.map((e) => ({
            event: e.name,
            map: e.map,
            starts: `in ${duration(msUntil(e, now))}`,
          })),
          { ...flags, limit: '0' }
        );
        break;
      }
      case 'search': {
        const query = positionals.slice(1).join(' ');
        const hits = await client.search(need(query, 'search query'), {
          ...call,
          limit: Number(flags.limit ?? 15) || 15,
        });
        out(
          hits,
          () => hits.map((h) => ({ type: h.value.type, id: h.id, name: h.name, score: h.score })),
          flags
        );
        break;
      }
      case 'usage': {
        const id = need(arg, 'item id');
        const usage = await client.itemUsage(id, call);
        if (flags.json) {
          console.log(
            toJSON({
              ...usage,
              requiredBy: usage.requiredBy.map((r) => ({
                quest: r.quest.id,
                quantity: r.quantity,
              })),
              rewardedBy: usage.rewardedBy.map((r) => ({
                quest: r.quest.id,
                quantity: r.quantity,
              })),
              droppedBy: usage.droppedBy.map((a) => a.id),
            })
          );
          break;
        }
        console.log(usage.keep ? bold(`KEEP ${id}`) : bold(`Safe to recycle or sell: ${id}`));
        for (const r of usage.requiredBy)
          console.log(`  quest   ${r.quest.name} (${r.quest.trader_name}) needs ${r.quantity}`);
        for (const e of usage.acceptedByErmal)
          console.log(
            `  ermal   ${e.title} ${e.amount !== undefined ? `takes ${e.amount}` : `(${e.kind})`}`
          );
        for (const r of usage.rewardedBy)
          console.log(`  reward  from ${r.quest.name} (${r.quantity})`);
        for (const a of usage.droppedBy) console.log(`  drop    ${a.name}`);
        for (const s of usage.soldBy) console.log(`  sold    by ${s.trader} for ${s.price ?? '?'}`);
        break;
      }
      case 'rank': {
        const stat = need(arg, 'stat name, e.g. damage');
        const ranked = rankByStat(
          await client.weapons.all(
            { rarity: flags.rarity, weaponClass: flags.class?.split(',') },
            call
          ),
          stat,
          {
            order: flags.asc ? 'asc' : 'desc',
          }
        );
        out(
          ranked,
          () =>
            ranked.map((r, i) => ({
              '#': i + 1,
              name: r.item.name,
              class: r.item.subcategory ?? '',
              [stat]: r.value,
            })),
          flags
        );
        break;
      }
      case 'value': {
        const ranked = valuePerWeight(
          await client.items.all({ rarity: flags.rarity, itemType: flags.type }, call)
        );
        out(
          ranked,
          () =>
            ranked.map((r, i) => ({
              '#': i + 1,
              name: r.item.name,
              type: r.item.item_type,
              value: r.item.value,
              perWeight: r.value,
            })),
          flags
        );
        break;
      }
      case 'stats': {
        const items = await client.items.all({}, call);
        const weapons = items.filter((i) => i.item_type === 'Weapon');
        const data = {
          items: items.length,
          rarity: rarityDistribution(items),
          types: typeDistribution(items),
          weaponDamage: statSummary(weapons, 'damage'),
          weaponFireRate: statSummary(weapons, 'fireRate'),
        };
        if (flags.json) {
          console.log(toJSON(data));
          break;
        }
        console.log(`${bold('Items')}: ${data.items}`);
        console.log(`\n${bold('By rarity')}`);
        table(
          Object.entries(data.rarity)
            .sort((a, b) => b[1] - a[1])
            .map(([rarity, count]) => ({ rarity, count })),
          { ...flags, limit: '0' }
        );
        console.log(`\n${bold('Weapon stats')}`);
        table(
          [
            { stat: 'damage', ...data.weaponDamage },
            { stat: 'fireRate', ...data.weaponFireRate },
          ],
          flags
        );
        break;
      }
      case 'export': {
        const what = need(arg, 'what to export (items|weapons|quests|arcs)');
        const loaders: Record<string, () => Promise<object[]>> = {
          items: () => client.items.all({}, call),
          weapons: () => client.weapons.all({}, call),
          quests: () => client.quests.all(call),
          arcs: () => client.arcs.all({ includeLoot: true }, call),
        };
        const load = loaders[what];
        if (!load) throw new UsageError(`Cannot export "${what}".`);
        const rows = await load();
        const format = flags.format ?? (flags.out?.endsWith('.csv') ? 'csv' : 'json');
        const content =
          format === 'csv' ? toCSV(rows, { delimiter: flags.delimiter }) : toJSON(rows);
        if (flags.out) {
          await writeFile(flags.out, content);
          console.error(`Wrote ${rows.length} ${what} to ${flags.out}`);
        } else {
          console.log(content);
        }
        break;
      }
      case 'cache': {
        if (arg !== 'clear') throw new UsageError('Usage: arc-raiders cache clear');
        await fileCache.clear();
        console.log(`Cleared ${fileCache.dir}`);
        break;
      }
      default:
        throw new UsageError(`Unknown command "${command}".`);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      console.error(dim('Run "arc-raiders --help" for usage.'));
      return 2;
    }
    if (isArcRaidersError(error)) {
      console.error(
        `Error (${error.code}${error.status ? ` ${error.status}` : ''}): ${error.message}`
      );
      return 1;
    }
    throw error;
  }
}
