/**
 * Small typo tolerant search that runs fully offline on data you already
 * fetched. Knows a bit about ARC Raiders naming, e.g. "ferro 2" finds
 * "Ferro II" and "anvil" finds "Amplified Anvil".
 */

export interface SearchDocument<T> {
  id: string;
  name: string;
  /** Extra text that should match with lower weight (type, rarity, ...). */
  keywords?: string[];
  value: T;
}

export interface SearchHit<T> {
  id: string;
  name: string;
  score: number;
  value: T;
}

export interface SearchOptions {
  /** Max results. Default 10. */
  limit?: number;
  /** Drop hits below this score (0..1). Default 0.35. */
  threshold?: number;
}

export interface SearchIndex<T> {
  search(query: string, options?: SearchOptions): SearchHit<T>[];
  readonly size: number;
}

const ROMAN: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v' };

export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map((t) => ROMAN[t] ?? t);
}

/** Damerau-Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

function tokenScore(q: string, t: string): number {
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.85;
  if (q.length >= 3 && t.includes(q)) return 0.6;
  // Allow 1 typo for short tokens, 2 for longer ones.
  const allowed = q.length <= 4 ? 1 : 2;
  if (q.length < 3) return 0;
  const dist = editDistance(q, t.slice(0, Math.max(q.length, t.length)), allowed);
  if (dist <= allowed) return 0.7 - dist * 0.15;
  return 0;
}

interface Prepared<T> {
  doc: SearchDocument<T>;
  full: string;
  nameTokens: string[];
  keywordTokens: string[];
}

export function createSearchIndex<T>(documents: Iterable<SearchDocument<T>>): SearchIndex<T> {
  const prepared: Prepared<T>[] = [];
  for (const doc of documents) {
    const nameTokens = tokenize(doc.name);
    prepared.push({
      doc,
      full: nameTokens.join(' '),
      nameTokens,
      keywordTokens: (doc.keywords ?? []).flatMap(tokenize),
    });
  }

  return {
    size: prepared.length,
    search(query, options = {}) {
      const limit = options.limit ?? 10;
      const threshold = options.threshold ?? 0.35;
      const qTokens = tokenize(query);
      if (qTokens.length === 0) return [];
      const qFull = qTokens.join(' ');

      const hits: SearchHit<T>[] = [];
      for (const p of prepared) {
        let score: number;
        if (p.full === qFull) {
          score = 1.2;
        } else if (p.full.startsWith(qFull)) {
          score = 1.05;
        } else {
          let sum = 0;
          for (const q of qTokens) {
            let best = 0;
            for (const t of p.nameTokens) best = Math.max(best, tokenScore(q, t));
            for (const t of p.keywordTokens) best = Math.max(best, tokenScore(q, t) * 0.5);
            sum += best;
          }
          score = sum / qTokens.length;
          // Prefer short names when the match quality is the same.
          score -= Math.min(0.1, Math.max(0, p.nameTokens.length - qTokens.length) * 0.02);
        }
        if (score >= threshold) {
          hits.push({
            id: p.doc.id,
            name: p.doc.name,
            score: Math.round(score * 1000) / 1000,
            value: p.doc.value,
          });
        }
      }

      return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
    },
  };
}
