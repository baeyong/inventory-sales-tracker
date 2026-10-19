// Each category gets a colour bar beside its items, as in the mocks. The common
// categories have fixed hues; anything else is hashed onto the same palette so
// a category always comes out the same colour.
const FIXED: Record<string, string> = {
  "pokémon cards": "#1660bf",
  "pokemon cards": "#1660bf",
  "sports cards": "#0e7490",
  sneakers: "#6d28d9",
  "tcg sealed": "#64748b",
  "funko pops": "#a15c07",
  clothing: "#be185d",
  electronics: "#4338ca",
  toys: "#15803d",
  collectibles: "#b45309",
  general: "#64748b",
};

const PALETTE = [
  "#1660bf",
  "#0e7490",
  "#6d28d9",
  "#a15c07",
  "#be185d",
  "#15803d",
  "#4338ca",
  "#64748b",
];

export function categoryHue(category: string): string {
  const key = category.trim().toLowerCase();
  if (FIXED[key]) return FIXED[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
