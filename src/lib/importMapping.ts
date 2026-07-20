// Spreadsheet import: fuzzy header→field mapping, header-row detection, and
// row building. Pure functions only (no React, no server imports), so the
// whole pipeline can be exercised from a plain node script.

export const IMPORT_FIELDS = [
  "name",
  "category",
  "description",
  "purchase_price",
  "purchase_date",
  "purchase_platform",
  "quantity",
  "card_set",
  "card_number",
  "player",
  "condition",
  "grade_company",
  "grade",
  "sale_date",
  "sale_platform",
  "sale_payout",
  "payment_received",
  "shipped",
  "listed",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Fields offered in the mapping UI. `status` is import-only: it never lands
 * in the database, it just decides whether a row is inventory or skipped. */
export const MAPPABLE_FIELDS = [...IMPORT_FIELDS, "status"] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export const FIELD_LABELS: Record<MappableField, string> = {
  name: "Name",
  category: "Category",
  description: "Description / notes",
  purchase_price: "Purchase price",
  purchase_date: "Purchase date",
  purchase_platform: "Bought at (store/platform)",
  quantity: "Quantity",
  card_set: "Card set",
  card_number: "Card number",
  player: "Player / character",
  condition: "Condition (raw/graded)",
  grade_company: "Grading company",
  grade: "Grade",
  sale_date: "Sale date",
  sale_platform: "Sale platform",
  sale_payout: "Sale payout (net)",
  payment_received: "Payment received (yes/no)",
  shipped: "Shipped (yes/no)",
  listed: "Listed for sale (yes/no)",
  status: "Status (skips sold/returned)",
};

const ALIASES: Record<MappableField, string[]> = {
  name: ["name", "item", "item name", "card name", "title", "product", "card"],
  category: ["type", "category", "item type", "kind"],
  description: ["description", "notes", "note", "comments", "details", "memo"],
  purchase_price: [
    "purchase price",
    "price",
    "cost",
    "paid",
    "what i paid",
    "buy price",
    "bought price",
    "bought for",
    "price paid",
    "cost basis",
    "purchase amount",
    "my cost",
    "invested",
  ],
  purchase_date: [
    "purchase date",
    "date purchased",
    "bought",
    "buy date",
    "date bought",
    "bought date",
    "acquired",
    "date acquired",
    "purchased",
  ],
  purchase_platform: [
    "bought at",
    "bought from",
    "purchased at",
    "purchased from",
    "purchase platform",
    "vendor",
    "seller",
  ],
  quantity: ["quantity", "qty", "count", "amount owned", "lot size"],
  card_set: ["set", "card set", "series", "product line", "set name"],
  card_number: ["card number", "card no", "number", "card #", "no", "num"],
  player: ["player", "character", "athlete", "player name", "subject"],
  condition: ["condition", "raw or graded", "graded"],
  grade_company: [
    "grade company",
    "grading company",
    "grader",
    "graded by",
    "company",
    "slab",
  ],
  grade: ["grade", "grade value", "psa grade", "rating"],
  sale_date: [
    "sale date",
    "date sold",
    "sold date",
    "sold",
    "date of sale",
    "sell date",
    "sold on date",
  ],
  sale_platform: [
    "sale platform",
    "platform",
    "sold on",
    "marketplace",
    "where sold",
    "sold via",
    "venue",
    "site",
  ],
  sale_payout: [
    "sale payout",
    "payout",
    "sale price",
    "sold for",
    "sold price",
    "net payout",
    "received",
    "sale amount",
    "net",
    "proceeds",
    "sold amount",
    "final price",
  ],
  payment_received: [
    "payment",
    "payment received",
    "payment status",
    "payment in",
    "payment complete",
  ],
  shipped: ["shipped", "shipping", "shipping status", "sent", "dispatched"],
  listed: ["listed", "listed?", "is listed", "listing", "live", "posted"],
  status: [
    "status",
    "item status",
    "card status",
    "product status",
    "state",
    "sold status",
    "inventory status",
  ],
};

/** Headers that are recognized but never imported — confidently "Ignore"
 * rather than a fuzzy near-miss (e.g. "Card Used" must not become a card
 * field). Matched on normalized text. */
const IGNORE_ALIASES = [
  "card used",
  "payment card",
  "payment method",
  "buyer",
  "buyer name",
  "p/l",
  "profit",
  "profit loss",
  "email",
  "url",
  "link",
  "image",
  "photo",
  "sku",
  "tracking",
  "order",
  "order number",
];

export function normalize(header: string): string {
  return header
    .toLowerCase()
    .replace(/#/g, "number")
    .replace(/[^a-z0-9]/g, "");
}

function bigrams(s: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice coefficient on character bigrams of the normalized strings, 0..1. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, count] of ga) {
    overlap += Math.min(count, gb.get(g) ?? 0);
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1);
}

export type Confidence = "exact" | "high" | "low";

export interface FieldGuess {
  field: MappableField | null; // null = ignore
  confidence: Confidence; // null + "exact" = confidently ignored
}

export type ValueKind = "date" | "money" | "other";

/** Classify a sample cell value, used to nudge ambiguous header guesses. */
export function classifyValue(v: unknown): ValueKind {
  if (v instanceof Date) return "date";
  if (typeof v === "number") return "money";
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\$?\s*-?[\d,]+(\.\d+)?$/.test(s)) return "money";
    if (!isNaN(new Date(s).getTime()) && /\d/.test(s) && /[-/., ]/.test(s)) {
      return "date";
    }
  }
  return "other";
}

const DATE_FIELDS: MappableField[] = ["purchase_date", "sale_date"];
const MONEY_FIELDS: MappableField[] = [
  "purchase_price",
  "sale_payout",
  "quantity",
  "grade",
];

/** Score every field for one header, best first. */
export function rankFields(
  header: string,
  samples: unknown[] = []
): { field: MappableField; score: number }[] {
  const kinds = samples.map(classifyValue).filter((k) => k !== "other");
  const dateish =
    kinds.length > 0 &&
    kinds.filter((k) => k === "date").length > kinds.length / 2;

  return MAPPABLE_FIELDS.map((field) => {
    let best = 0;
    for (const alias of ALIASES[field]) {
      let score = similarity(header, alias);
      if (kinds.length > 0) {
        if (dateish && DATE_FIELDS.includes(field)) score += 0.1;
        if (!dateish && MONEY_FIELDS.includes(field)) score += 0.05;
        if (dateish && MONEY_FIELDS.includes(field)) score -= 0.1;
        if (!dateish && DATE_FIELDS.includes(field)) score -= 0.1;
      }
      if (score > best) best = score;
    }
    return { field, score: best };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Guess a field for each header. `samples[i]` are example cell values from
 * column i; when a header is ambiguous, columns full of dates lean toward the
 * date fields and numeric columns toward the money fields.
 */
export function guessMapping(
  headers: string[],
  samples: unknown[][] = []
): FieldGuess[] {
  const guesses: FieldGuess[] = headers.map((header, i) => {
    const norm = normalize(header);
    if (!norm) return { field: null, confidence: "low" as const };

    if (
      IGNORE_ALIASES.some((a) => normalize(a) === norm) ||
      /(url|link|image|photo)$/.test(norm)
    ) {
      return { field: null, confidence: "exact" as const };
    }

    for (const field of MAPPABLE_FIELDS) {
      if (ALIASES[field].some((a) => normalize(a) === norm)) {
        return { field, confidence: "exact" as const };
      }
    }

    const best = rankFields(header, samples[i] ?? [])[0];
    if (!best || best.score < 0.5)
      return { field: null, confidence: "low" as const };
    return {
      field: best.field,
      confidence: best.score >= 0.75 ? ("high" as const) : ("low" as const),
    };
  });

  // A field may win only one column: keep the highest-confidence claim.
  const rank: Record<Confidence, number> = { exact: 2, high: 1, low: 0 };
  const claimed = new Map<MappableField, number>();
  guesses.forEach((g, i) => {
    if (!g.field) return;
    const prev = claimed.get(g.field);
    if (prev === undefined) {
      claimed.set(g.field, i);
    } else if (rank[g.confidence] > rank[guesses[prev].confidence]) {
      guesses[prev] = { field: null, confidence: "low" };
      claimed.set(g.field, i);
    } else {
      guesses[i] = { field: null, confidence: "low" };
    }
  });

  return guesses;
}

/**
 * Find the header row: real sheets often have title/summary rows above the
 * headers. Scores each of the first `scan` rows by how many cells the guesser
 * recognizes confidently; the best row with at least 2 recognized cells wins.
 */
export function detectHeaderRow(grid: unknown[][], scan = 10): number {
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(scan, grid.length); i++) {
    const cells = (grid[i] ?? []).map((c) =>
      c === null || c === undefined ? "" : String(c).trim()
    );
    const nonEmpty = cells.filter(Boolean).length;
    if (nonEmpty < 2) continue;
    const hits = guessMapping(cells).filter(
      (g) =>
        g.confidence === "exact" || (g.field !== null && g.confidence === "high")
    ).length;
    const score = hits * 2 + nonEmpty * 0.1;
    if (hits >= 2 && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Stable key for remembering a confirmed mapping for this sheet shape. */
export function headerSignature(headers: string[]): string {
  return headers.map(normalize).join("|");
}

// ---------------------------------------------------------------------------
// Clarifying questions for ambiguous columns
// ---------------------------------------------------------------------------

export interface MappingQuestion {
  colIdx: number;
  question: string;
  options: { label: string; field: MappableField | null }[];
}

// Headers where even an exact word match hides a real ambiguity: "Platform"
// can mean where an item was bought OR sold, "Price" what was paid OR
// received, a bare "Date" either date. These always earn a question.
const GENERIC_PLATFORM = new Set(
  ["platform", "store", "site", "venue", "marketplace", "shop", "retailer", "source"].map(normalize)
);
const GENERIC_PRICE = new Set(
  ["price", "amount", "value", "total"].map(normalize)
);
const GENERIC_DATE = new Set(["date", "day", "when"].map(normalize));

/**
 * Build the interview for columns the guesser can't be certain about:
 * known-ambiguous generic headers get a targeted either/or question, and
 * low-confidence guesses get an open question with the top-ranked candidates.
 * Columns with no data never generate a question.
 */
export function generateQuestions(
  headers: string[],
  samples: unknown[][],
  guesses: FieldGuess[],
  max = 8
): MappingQuestion[] {
  const questions: MappingQuestion[] = [];

  headers.forEach((header, i) => {
    if (questions.length >= max) return;
    if ((samples[i] ?? []).length === 0) return;
    const norm = normalize(header);
    const guess = guesses[i];
    const label = header || "the untitled column";

    if (GENERIC_PLATFORM.has(norm)) {
      questions.push({
        colIdx: i,
        question: `Your “${label}” column — is that where you sold items, or where you bought them?`,
        options: [
          { label: "Where I bought them", field: "purchase_platform" },
          { label: "Where I sold them", field: "sale_platform" },
          { label: "Neither — ignore it", field: null },
        ],
      });
      return;
    }
    if (GENERIC_PRICE.has(norm)) {
      questions.push({
        colIdx: i,
        question: `Your “${label}” column — is that what you paid, or what you received when it sold?`,
        options: [
          { label: "What I paid", field: "purchase_price" },
          { label: "What I received (net payout)", field: "sale_payout" },
          { label: "Neither — ignore it", field: null },
        ],
      });
      return;
    }
    if (GENERIC_DATE.has(norm)) {
      questions.push({
        colIdx: i,
        question: `Your “${label}” column — is that when you bought items, or when you sold them?`,
        options: [
          { label: "When I bought them", field: "purchase_date" },
          { label: "When I sold them", field: "sale_date" },
          { label: "Neither — ignore it", field: null },
        ],
      });
      return;
    }

    if (guess.confidence === "low") {
      const candidates = rankFields(header, samples[i] ?? [])
        .filter((r) => r.score >= 0.3)
        .slice(0, 3);
      const options: MappingQuestion["options"] = [];
      const addIgnore = () =>
        options.push({ label: "Ignore this column", field: null });
      // For a column we couldn't place at all, lead with Ignore; for a shaky
      // guess, lead with the candidates.
      if (guess.field === null) addIgnore();
      for (const c of candidates) {
        if (!options.some((o) => o.field === c.field)) {
          options.push({ label: FIELD_LABELS[c.field], field: c.field });
        }
      }
      if (guess.field !== null) addIgnore();
      if (options.length < 2) return;
      questions.push({
        colIdx: i,
        question: `I’m not sure what “${label}” is — what should it import as?`,
        options,
      });
    }
  });

  return questions;
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

export function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Spreadsheet truthiness: "Complete", "Yes", "Paid", "X"… → true. */
export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return [
    "complete",
    "completed",
    "done",
    "yes",
    "y",
    "true",
    "paid",
    "received",
    "shipped",
    "sent",
    "x",
    "✓",
    "1",
  ].includes(s);
}

export function toMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate())!;
}

/**
 * Parse a spreadsheet date: Date objects, ISO strings, M/D/YY, and M/D with
 * no year at all. Two-digit years land in 2000–2069. A year-less date gets
 * the current year, stepped back a year if that would be in the future
 * (sheets record the past) and forward a year if it would precede `refIso`
 * (a sale can't precede its purchase). Non-dates ("Returned", "Pending")
 * come back null.
 */
export function parseFlexibleDate(
  v: unknown,
  refIso: string | null = null,
  today: string = todayIso()
): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    return isNaN(v.getTime())
      ? null
      : isoDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  const s = String(v).trim();
  if (!s || !/\d/.test(s)) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (m) {
    const mo = +m[1];
    const da = +m[2];
    let yr: number;
    if (m[3] === undefined) {
      yr = +today.slice(0, 4);
      const thisYear = isoDate(yr, mo, da);
      if (thisYear && thisYear > today) yr -= 1;
      const candidate = isoDate(yr, mo, da);
      if (refIso && candidate && candidate < refIso) {
        const bumped = isoDate(yr + 1, mo, da);
        if (bumped && bumped <= today) yr += 1;
      }
    } else {
      yr = +m[3];
      if (yr < 100) yr += yr < 70 ? 2000 : 1900;
    }
    return isoDate(yr, mo, da);
  }

  const d = new Date(s);
  return isNaN(d.getTime())
    ? null
    : isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Matches the row shape `importItems` accepts (structural copy so this
 * module stays importable outside Next.js). */
export interface ImportRowData {
  category: string;
  name: string;
  description: string | null;
  purchase_price: number;
  purchase_date: string | null;
  purchase_platform: string | null;
  quantity: number;
  card_set: string | null;
  card_number: string | null;
  player: string | null;
  condition: "raw" | "graded" | null;
  grade_company: string | null;
  grade: string | null;
  sale_date: string | null;
  sale_platform: string | null;
  sale_payout: number | null;
  payment_received: boolean;
  shipped: boolean;
  listed: boolean;
}

export interface ParsedSheet {
  headers: string[];
  rows: unknown[][];
}

export type ColumnMap = (MappableField | null)[];

export interface BuildResult {
  rows: ImportRowData[];
  errors: string[];
  /** Rows skipped because their status column says sold/returned. */
  statusSkipped: number;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

/** Guess a category from an item's name — free keyword rules, no AI.
 * `cardContext` marks sheets that are clearly about cards (e.g. the name
 * column is headed "Card Name"), used as the fallback. */
export function inferCategory(name: string, cardContext = false): string {
  const n = name.toLowerCase();
  if (
    /\betb\b|elite trainer|booster (box|bundle|display|blister|pack)|display box|hobby box|hanger box|blaster|poster collection|mega ex box/.test(n)
  ) {
    return "TCG Sealed";
  }
  if (
    /prizm|optic|topps|donruss|panini|bowman|chrome|refractor|rookie|\brc\b|\bauto\b|psa ?\d|\bsgc\b|\bbgs\b|kaboom|downtown|fast break/.test(n)
  ) {
    return "Sports Cards";
  }
  if (
    /pok[eé]mon|pikachu|chariz|charmander|bulbasaur|squirtle|eevee|umbreon|vaporeon|vstar|vmax|black star promo|\bex\b|\d{1,3}\/\d{2,3}/.test(n)
  ) {
    return "Pokémon Cards";
  }
  if (/supreme|shirt|hoodie|polo|\bhat\b|\btee\b/.test(n)) return "Clothing";
  if (/nike|jordan|kobe|adidas|reebok|yeezy|snkrs|air max|dunk|mercurial|\baj ?\d/.test(n)) {
    return "Sneakers";
  }
  if (/funko|pop!/.test(n)) return "Funko Pops";
  if (/lego|hot wheels|\brlc\b/.test(n)) return "Toys";
  return cardContext ? "Cards" : "General";
}

// ---------------------------------------------------------------------------
// Linking import rows to items already in the database
// ---------------------------------------------------------------------------

/** The slice of an existing item the matcher needs. Sold items participate
 * too, so re-importing a sales sheet doesn't duplicate past sales. */
export interface MatchCandidate {
  id: string;
  name: string;
  category: string;
  purchase_price: number;
  purchase_date: string | null;
  purchase_platform: string | null;
  sale_date: string | null;
  sale_platform: string | null;
  sale_payout: number | null;
  payment_received: boolean;
  shipped: boolean;
  listed: boolean;
}

/** One name fully containing the other (normalized, and long enough to be
 * meaningful) counts as the same name — sheets often add year/set prefixes. */
function containsName(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (Math.min(na.length, nb.length) < 10) return false;
  return na.includes(nb) || nb.includes(na);
}

function dayDiff(a: string, b: string): number {
  return Math.abs(
    (new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) /
      86400000
  );
}

export type Disposition =
  | { kind: "insert" }
  | { kind: "update"; id: string } // sold row linking to an unsold item
  | { kind: "duplicate"; id: string }; // unsold row already in inventory

/**
 * Decide what each import row does to the database. A sold row is first
 * checked against existing *sold* items — an exact name + price + sale-date +
 * payout match is a re-imported sale and gets skipped as a duplicate. It
 * otherwise links to an existing unsold item when the names match exactly
 * (normalized) and either the price or purchase date agrees, or when the
 * names are nearly identical and the price agrees. An unsold row is a
 * duplicate only on an exact name + price + purchase-date match with an
 * unsold item. Each existing item is consumed at most once, best matches
 * first within a row.
 */
export function matchImportRows(
  rows: ImportRowData[],
  candidates: MatchCandidate[]
): Disposition[] {
  const used = new Set<string>();

  return rows.map((row): Disposition => {
    // A sold row against items already recorded as sold: the same sale
    // (same item, cost, and sale date) is a duplicate — unless this row
    // carries a payout the existing record lacks, in which case it fills it
    // in. Different payouts on the same day mean two copies were sold; both
    // records stand.
    if (row.sale_date !== null) {
      for (const c of candidates) {
        if (used.has(c.id) || c.sale_date === null) continue;
        const priceClose =
          Math.abs(row.purchase_price - Number(c.purchase_price)) <= 0.01;
        if (!priceClose) continue;

        // Both sides knowing their payout means both sheets are complete —
        // demand the exact same day. When one side lacks a payout (a
        // cross-sheet fill or payout-less re-import), sheets often disagree
        // by a day or two on the date; tolerate that.
        const bothPayouts =
          row.sale_payout !== null && c.sale_payout !== null;
        const dd = dayDiff(row.sale_date, c.sale_date);
        if (bothPayouts ? dd !== 0 : dd > 2) continue;

        const nameExact = normalize(row.name) === normalize(c.name);
        const sim = nameExact ? 1 : similarity(row.name, c.name);
        let nameOk = nameExact || containsName(row.name, c.name) || sim >= 0.9;
        // A payout-less row adds nothing new; an exact nonzero price and the
        // exact sale date pin identity even when the spelling drifts.
        if (
          !nameOk &&
          row.sale_payout === null &&
          row.purchase_price > 0.005 &&
          dd === 0
        ) {
          nameOk = sim >= 0.5;
        }
        if (!nameOk) continue;

        const payoutsConflict =
          bothPayouts &&
          Math.abs(row.sale_payout! - Number(c.sale_payout)) > 0.01;
        if (payoutsConflict) {
          // Same day, different payout: a second copy sold — keep looking.
          continue;
        }
        // Same sale. If this row carries details the record lacks (payout,
        // platform, bought-at, flags, or a real category), it's an update
        // that fills them; otherwise skip it.
        const fillsSomething =
          (c.sale_payout === null && row.sale_payout !== null) ||
          (c.sale_platform === null && row.sale_platform !== null) ||
          (c.purchase_platform === null && row.purchase_platform !== null) ||
          (!c.payment_received && row.payment_received) ||
          (!c.shipped && row.shipped) ||
          (c.category === "General" && row.category !== "General");
        used.add(c.id);
        return { kind: fillsSomething ? "update" : "duplicate", id: c.id };
      }
    }

    let best: { id: string; score: number } | null = null;

    for (const c of candidates) {
      if (used.has(c.id) || c.sale_date !== null) continue;
      const nameExact = normalize(row.name) === normalize(c.name);
      const nameSim = nameExact ? 1 : similarity(row.name, c.name);
      const priceClose =
        Math.abs(row.purchase_price - Number(c.purchase_price)) <= 0.01;
      const dateEq = row.purchase_date === c.purchase_date;

      let linkable: boolean;
      if (row.sale_date !== null) {
        linkable =
          (nameExact && (priceClose || dateEq)) ||
          ((nameSim >= 0.9 || containsName(row.name, c.name)) && priceClose);
      } else {
        linkable = nameExact && priceClose && dateEq;
      }
      if (!linkable) continue;

      const score = nameSim + (priceClose ? 0.5 : 0) + (dateEq ? 0.25 : 0);
      if (!best || score > best.score) best = { id: c.id, score };
    }

    if (!best) return { kind: "insert" };
    used.add(best.id);
    if (row.sale_date !== null) return { kind: "update", id: best.id };
    // Unsold duplicate — but let it fill a listed flag or a real category
    // the record lacks.
    const c = candidates.find((x) => x.id === best!.id)!;
    const fillsUnsold =
      (row.listed && !c.listed) ||
      (c.category === "General" && row.category !== "General");
    return fillsUnsold
      ? { kind: "update", id: best.id }
      : { kind: "duplicate", id: best.id };
  });
}

export function buildRows(parsed: ParsedSheet, mapping: ColumnMap): BuildResult {
  const col = (field: MappableField) => mapping.indexOf(field);
  const get = (row: unknown[], field: MappableField) => {
    const i = col(field);
    return i === -1 ? null : (row[i] ?? null);
  };

  const rows: ImportRowData[] = [];
  const errors: string[] = [];
  let statusSkipped = 0;

  // A name column headed "Card Name" (etc.) marks the whole sheet as cards.
  const nameIdx = mapping.indexOf("name");
  const sheetCardContext =
    nameIdx !== -1 && /card/i.test(parsed.headers[nameIdx] ?? "");

  parsed.rows.forEach((r, idx) => {
    const rowNo = idx + 2; // 1-based + header row
    if (r.every((c) => c === null || c === undefined || c === "")) return;

    const name = toText(get(r, "name"));
    if (!name) {
      errors.push(`Row ${rowNo}: missing name — skipped`);
      return;
    }

    const statusText = toText(get(r, "status"))?.toLowerCase() ?? "";
    if (statusText.includes("return")) {
      statusSkipped++;
      return;
    }

    const hasCardFields = Boolean(
      toText(get(r, "card_set")) ??
        toText(get(r, "card_number")) ??
        toText(get(r, "player"))
    );
    // Categories are free text; the sheet's own label wins, otherwise the
    // name is classified by keyword rules. A "PC" status marks keepers.
    // Card-detail fields apply when the category mentions cards.
    let category =
      toText(get(r, "category")) ??
      inferCategory(name, sheetCardContext || hasCardFields);
    if (/^pc$|personal/i.test(statusText)) category = "Personal Collection";
    const isCard = /card/i.test(category);

    const grade = toText(get(r, "grade"));
    const condText = toText(get(r, "condition"))?.toLowerCase() ?? "";
    let condition: ImportRowData["condition"] = null;
    if (isCard) {
      condition = condText.startsWith("g") || grade ? "graded" : "raw";
    }

    const purchase_date = parseFlexibleDate(get(r, "purchase_date"));
    const sale_date = parseFlexibleDate(get(r, "sale_date"), purchase_date);
    const sale_payout = toMoney(get(r, "sale_payout"));
    // A sale exists only when it has a date; payout and platform are
    // optional and can be filled in later (e.g. by importing another sheet
    // that has them). A platform value alone is ignored (sheets often track
    // where an item was *bought*), but a payout with no date is suspicious
    // enough to flag.
    const sale_platform =
      sale_date !== null ? toText(get(r, "sale_platform")) : null;

    if (sale_date === null && sale_payout !== null) {
      errors.push(
        `Row ${rowNo}: has a sale payout but no sale date — skipped`
      );
      return;
    }
    if (sale_date === null && statusText.includes("sold")) {
      // Marked sold but no usable sale date — can't record it as a sale.
      statusSkipped++;
      return;
    }

    const purchase_price = toMoney(get(r, "purchase_price"));
    if (purchase_price === null || purchase_price < 0) {
      errors.push(`Row ${rowNo}: missing or invalid purchase price — skipped`);
      return;
    }

    const qty = toMoney(get(r, "quantity"));

    rows.push({
      category,
      name,
      description: toText(get(r, "description")),
      purchase_price,
      purchase_date,
      purchase_platform: toText(get(r, "purchase_platform")),
      quantity: qty && qty >= 1 ? Math.round(qty) : 1,
      card_set: isCard ? toText(get(r, "card_set")) : null,
      card_number: isCard ? toText(get(r, "card_number")) : null,
      player: isCard ? toText(get(r, "player")) : null,
      condition,
      grade_company:
        condition === "graded" ? toText(get(r, "grade_company")) : null,
      grade: condition === "graded" ? grade : null,
      sale_date,
      sale_platform,
      sale_payout,
      payment_received: toBool(get(r, "payment_received")),
      shipped: toBool(get(r, "shipped")),
      listed: toBool(get(r, "listed")),
    });
  });

  return { rows, errors, statusSkipped };
}
