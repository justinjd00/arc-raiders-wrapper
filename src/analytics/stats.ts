import type { Weapon, Armor, ArcRaidersItem } from '../arc-raiders/types';

export interface Stats {
  count: number;
  average: number;
  min: number;
  max: number;
  sum: number;
}

export function calculateStats(values: number[]): Stats {
  if (values.length === 0) {
    return {
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      sum: 0,
    };
  }

  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    count: values.length,
    average: Number(average.toFixed(2)),
    min,
    max,
    sum,
  };
}

export function getWeaponStats(weapons: Weapon[]): {
  damage?: Stats;
  fireRate?: Stats;
  range?: Stats;
} {
  const damage = weapons
    .map(w => w.damage)
    .filter((d): d is number => typeof d === 'number');
  
  const fireRate = weapons
    .map(w => w.fireRate)
    .filter((fr): fr is number => typeof fr === 'number');
  
  const range = weapons
    .map(w => w.range)
    .filter((r): r is number => typeof r === 'number');

  return {
    damage: damage.length > 0 ? calculateStats(damage) : undefined,
    fireRate: fireRate.length > 0 ? calculateStats(fireRate) : undefined,
    range: range.length > 0 ? calculateStats(range) : undefined,
  };
}

export function getArmorStats(armor: Armor[]): {
  armor?: Stats;
} {
  const armorValues = armor
    .map(a => a.armorValue)
    .filter((a): a is number => typeof a === 'number');

  return {
    armor: armorValues.length > 0 ? calculateStats(armorValues) : undefined,
  };
}

export function getRarityDistribution(items: ArcRaidersItem[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  
  items.forEach(item => {
    const rarity = item.rarity || 'unknown';
    distribution[rarity] = (distribution[rarity] || 0) + 1;
  });
  
  return distribution;
}

export function findBestWeapon(weapons: Weapon[], criteria: 'damage' | 'fireRate' | 'range' = 'damage'): Weapon | null {
  if (weapons.length === 0) {
    return null;
  }

  const getValue = (weapon: Weapon): number => {
    switch (criteria) {
      case 'damage':
        return weapon.damage || 0;
      case 'fireRate':
        return weapon.fireRate || 0;
      case 'range':
        return weapon.range || 0;
      default:
        return 0;
    }
  };

  return weapons.reduce((best, current) => {
    return getValue(current) > getValue(best) ? current : best;
  });
}

export function findBestArmor(armor: Armor[], criteria: 'armor' = 'armor'): Armor | null {
  if (armor.length === 0) {
    return null;
  }

  const getValue = (a: Armor): number => {
    switch (criteria) {
      case 'armor':
        return a.armorValue || 0;
      default:
        return 0;
    }
  };

  return armor.reduce((best, current) => {
    return getValue(current) > getValue(best) ? current : best;
  });
}

