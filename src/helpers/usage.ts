import type { Arc, Ermal, Quest, TraderItem, TraderName } from '../arc-raiders/types';

export interface ItemUsage {
  itemId: string;
  /** Quests that ask you to hand this item in. */
  requiredBy: Array<{ quest: Quest; quantity: number }>;
  /** Quests that give it as a reward. */
  rewardedBy: Array<{ quest: Quest; quantity: number }>;
  /** ARCs that drop it. Needs ARCs loaded with loot. */
  droppedBy: Arc[];
  /** Traders that sell it, with price. */
  soldBy: Array<{ trader: TraderName; price: number | null }>;
  /**
   * Ermal offers and services that accept it as payment. `amount` is missing
   * for permanent services, the API does not publish it there.
   */
  acceptedByErmal: Array<{
    id: string;
    title: string;
    amount: number | undefined;
    kind: 'offer' | 'service';
  }>;
  /**
   * `true` when some quest or Ermal deal still wants this item, i.e. think
   * twice before recycling or selling it.
   */
  keep: boolean;
}

export interface ItemUsageSources {
  quests?: readonly Quest[];
  arcs?: readonly Arc[];
  traders?: Partial<Record<TraderName, TraderItem[]>>;
  ermal?: Ermal;
}

/** Answers the classic loot question: what is this item good for? */
export function findItemUsage(itemId: string, sources: ItemUsageSources): ItemUsage {
  const requiredBy: ItemUsage['requiredBy'] = [];
  const rewardedBy: ItemUsage['rewardedBy'] = [];

  for (const quest of sources.quests ?? []) {
    const req = sumFor(itemId, quest.required_items);
    if (req) requiredBy.push({ quest, quantity: req });
    const rew = sumFor(itemId, quest.rewards) + sumFor(itemId, quest.granted_items);
    if (rew) rewardedBy.push({ quest, quantity: rew });
  }

  const droppedBy = (sources.arcs ?? []).filter((arc) =>
    (arc.loot ?? []).some((l) => l.item_id === itemId)
  );

  const soldBy: ItemUsage['soldBy'] = [];
  for (const [trader, stock] of Object.entries(sources.traders ?? {})) {
    const hit = (stock ?? []).find((i) => i.id === itemId);
    if (hit) soldBy.push({ trader, price: hit.trader_price });
  }

  const acceptedByErmal: ItemUsage['acceptedByErmal'] = [];
  for (const offer of sources.ermal?.offers ?? []) {
    const hit = offer.accepted_items.find((i) => i.id === itemId);
    if (hit)
      acceptedByErmal.push({
        id: offer.id,
        title: offer.offer_title,
        amount: hit.amount,
        kind: 'offer',
      });
  }
  for (const service of sources.ermal?.permanent_services ?? []) {
    const hit = service.accepted_items.find((i) => i.id === itemId);
    if (hit)
      acceptedByErmal.push({
        id: service.id,
        title: service.name,
        amount: hit.amount,
        kind: 'service',
      });
  }

  return {
    itemId,
    requiredBy,
    rewardedBy,
    droppedBy,
    soldBy,
    acceptedByErmal,
    keep: requiredBy.length > 0 || acceptedByErmal.length > 0,
  };
}

function sumFor(itemId: string, entries: Quest['required_items'] | undefined): number {
  return (entries ?? []).reduce((sum, e) => (e.item_id === itemId ? sum + e.quantity : sum), 0);
}
