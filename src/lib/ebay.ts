// Server-only eBay Browse API client. NEVER import this into a client
// component — it reads the secret from env and must stay on the server.
//
// Uses the client-credentials (app token) flow: no per-user eBay login, no
// per-call charge. Currently returns *active listing* prices; swapping to sold
// comps later means pointing fetchEbayComps at the Marketplace Insights
// endpoint — the shape returned here stays the same.

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

let cachedToken: { token: string; expiresAt: number } | null = null;

/** True when eBay credentials are configured. Lets callers give a clean
 * "not set up yet" message instead of throwing. */
export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function getAppToken(): Promise<string> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "eBay isn't configured yet — add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET."
    );
  }
  // Reuse a still-valid token (they last ~2h) with a minute of headroom.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });
  if (!res.ok) {
    throw new Error(`eBay auth failed (${res.status}). Check your keys.`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new Error("eBay auth returned no token.");
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000,
  };
  return cachedToken.token;
}

export type Comps = {
  low: number;
  median: number;
  high: number;
  count: number;
};

type BrowseItem = { price?: { value?: string; currency?: string } };
type BrowseResponse = { itemSummaries?: BrowseItem[] };

function summarize(prices: number[]): Comps {
  const sorted = [...prices].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return { low: 0, median: 0, high: 0, count: 0 };
  const median =
    count % 2
      ? sorted[(count - 1) / 2]
      : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  return {
    low: sorted[0],
    median: Math.round(median * 100) / 100,
    high: sorted[count - 1],
    count,
  };
}

/** Pull matching listings and reduce them to low/median/high/count (USD). */
export async function fetchEbayComps(query: string): Promise<Comps> {
  const token = await getAppToken();
  const url = `${BROWSE_URL}?q=${encodeURIComponent(query)}&limit=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) {
    throw new Error(`eBay search failed (${res.status}).`);
  }
  const json = (await res.json()) as BrowseResponse;
  const prices = (json.itemSummaries ?? [])
    .map((s) =>
      s.price?.currency === "USD" ? Number(s.price.value) : Number.NaN
    )
    .filter((n) => Number.isFinite(n) && n > 0);
  return summarize(prices);
}
