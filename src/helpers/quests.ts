import type { ItemRef, Quest } from '../arc-raiders/types';

export interface QuestGraph {
  /** Quest by id. */
  readonly byId: ReadonlyMap<string, Quest>;
  /** Direct prerequisites of a quest (ids). */
  prerequisitesOf(questId: string): string[];
  /** Quests that directly require this one (ids). */
  unlocks(questId: string): string[];
  /**
   * Every quest you must finish before `questId`, in a valid play order,
   * followed by the quest itself.
   */
  chain(questId: string): Quest[];
  /**
   * Quests you can pick up right now, given the ones you finished.
   * A quest is available when all its prerequisites are completed and it is
   * not completed itself.
   */
  available(completed: Iterable<string>): Quest[];
}

/** Builds a dependency graph from `manifest.prerequisites`. */
export function buildQuestGraph(quests: readonly Quest[]): QuestGraph {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const prereqs = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const quest of quests) {
    const ids = (quest.manifest?.prerequisites ?? [])
      .map((p) => p.quest_id)
      .filter((id) => id && id !== quest.id);
    prereqs.set(quest.id, [...new Set(ids)]);
    for (const id of ids) {
      const list = children.get(id) ?? [];
      list.push(quest.id);
      children.set(id, list);
    }
  }

  const chain = (questId: string): Quest[] => {
    const ordered: Quest[] = [];
    const done = new Set<string>();
    const visiting = new Set<string>();

    // Iterative DFS post-order, so deep chains cannot blow the stack and
    // cycles in community data cannot hang us.
    const stack: Array<{ id: string; expanded: boolean }> = [{ id: questId, expanded: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (done.has(frame.id)) continue;
      if (frame.expanded) {
        visiting.delete(frame.id);
        done.add(frame.id);
        const quest = byId.get(frame.id);
        if (quest) ordered.push(quest);
        continue;
      }
      if (visiting.has(frame.id)) continue;
      visiting.add(frame.id);
      stack.push({ id: frame.id, expanded: true });
      const deps = prereqs.get(frame.id) ?? [];
      for (let i = deps.length - 1; i >= 0; i--) {
        const dep = deps[i]!;
        if (!done.has(dep) && !visiting.has(dep)) stack.push({ id: dep, expanded: false });
      }
    }
    return ordered;
  };

  return {
    byId,
    prerequisitesOf: (id) => [...(prereqs.get(id) ?? [])],
    unlocks: (id) => [...(children.get(id) ?? [])],
    chain,
    available(completed) {
      const doneSet = new Set(completed);
      return quests.filter(
        (q) => !doneSet.has(q.id) && (prereqs.get(q.id) ?? []).every((id) => doneSet.has(id))
      );
    },
  };
}

export interface ShoppingListEntry {
  item: ItemRef;
  quantity: number;
  /** Which of the given quests need it, and how many each. */
  neededFor: Array<{ questId: string; questName: string; quantity: number }>;
}

/**
 * Sums up `required_items` over several quests, so you know what to stash
 * before heading topside. Sorted by quantity, largest first.
 */
export function questShoppingList(quests: readonly Quest[]): ShoppingListEntry[] {
  const map = new Map<string, ShoppingListEntry>();
  for (const quest of quests) {
    for (const req of quest.required_items ?? []) {
      const entry = map.get(req.item_id) ?? { item: req.item, quantity: 0, neededFor: [] };
      entry.quantity += req.quantity;
      entry.neededFor.push({ questId: quest.id, questName: quest.name, quantity: req.quantity });
      map.set(req.item_id, entry);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.quantity - a.quantity || a.item.name.localeCompare(b.item.name)
  );
}
