export interface WikiPage {
  title: string;
  url: string;
  revisionId: number;
  text: string; // plain-text article body
  links: string[]; // outbound article links: the rabbit-hole graph
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<any>;
}
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResponseLike>;

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'RabbitTrail/0.1 (daily story pipeline; https://github.com/)';
const MAX_CONTINUATIONS = 10;

function firstPage(json: any): any | null {
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== 'object') return null;
  return Object.values(pages)[0] ?? null;
}

const linkTitles = (raw: any): string[] => (Array.isArray(raw?.links) ? raw.links.map((l: any) => String(l.title)) : []);

// Returns null for a missing page, a disambiguation page, or one with no body to quote from.
export function parseWikiResponse(json: any): WikiPage | null {
  const raw = firstPage(json);
  if (!raw || 'missing' in raw || raw.pageprops?.disambiguation !== undefined) return null;

  const text = typeof raw.extract === 'string' ? raw.extract : '';
  const revisionId = raw.revisions?.[0]?.revid;
  if (!text.trim() || typeof raw.fullurl !== 'string' || typeof revisionId !== 'number') return null;

  return { title: String(raw.title), url: raw.fullurl, revisionId, text, links: linkTitles(raw) };
}

export async function fetchPage(title: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<WikiPage | null> {
  const base: Record<string, string> = {
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: title,
    prop: 'extracts|revisions|links|info|pageprops',
    explaintext: '1',
    rvprop: 'ids',
    plnamespace: '0',
    pllimit: 'max',
    inprop: 'url',
    ppprop: 'disambiguation',
  };

  let page: WikiPage | null = null;
  const extraLinks: string[] = [];
  let cont: Record<string, string> | null = null;

  for (let i = 0; i < MAX_CONTINUATIONS; i++) {
    const params = new URLSearchParams({ ...base, ...(cont ?? {}) });
    const res = await fetchImpl(`${API}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`);
    const json = await res.json();

    if (i === 0) {
      page = parseWikiResponse(json);
      if (!page) return null;
    } else {
      extraLinks.push(...linkTitles(firstPage(json)));
    }

    if (!json.continue) break;
    cont = json.continue;
  }

  return page && { ...page, links: [...page.links, ...extraLinks] };
}
