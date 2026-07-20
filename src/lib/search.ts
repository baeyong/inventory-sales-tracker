import { similarity } from "./importMapping";
import type { Item } from "./types";

/** Live fuzzy search: every query token must appear as a substring of the
 * item's text, or closely match one of its words (typo tolerance). */
export function matchesSearch(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const hay = [
    item.name,
    item.category,
    item.purchase_platform,
    item.sale_platform,
    item.card_set,
    item.card_number,
    item.player,
    item.grade_company,
    item.grade,
    item.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const words = hay.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

  return q.split(/\s+/).every((token) => {
    if (hay.includes(token)) return true;
    if (token.length < 3) return false;
    // Bigram similarity punishes short words hard, so the typo bar scales
    // with token length.
    const bar = token.length >= 5 ? 0.65 : 0.78;
    return words.some((w) => similarity(w, token) >= bar);
  });
}
