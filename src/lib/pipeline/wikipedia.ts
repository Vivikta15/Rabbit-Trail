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
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
}
export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface FetchPageOptions {
  retry?: RetryOptions;
  timeoutMs?: number;
}

import { fetchWithTimeout, HttpStatusError, PipelineAbort, RetryOptions, retryAfterMs, withRetry } from './http';

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

async function requestJson(url: string, fetchImpl: FetchLike, options: FetchPageOptions): Promise<any> {
  try {
    const res = await withRetry(async () => {
      const r = await fetchWithTimeout(fetchImpl, url, { headers: { 'User-Agent': USER_AGENT } }, options.timeoutMs ?? 20000);
      if (!r.ok) throw new HttpStatusError(`status ${r.status}`, r.status, retryAfterMs(r.headers?.get('retry-after')));
      return r;
    }, { retries: 3, baseDelayMs: 1000, maxDelayMs: 15000, ...options.retry });
    return await res.json();
  } catch (err) {
    if (err instanceof HttpStatusError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408) {
      throw new PipelineAbort(`Wikipedia refused the request (${err.status}). The pipeline cannot continue.`);
    }
    const detail = err instanceof HttpStatusError ? `${err.status}` : (err as Error).message;
    throw new PipelineAbort(`Wikipedia is not responding (${detail}). Please try again later.`);
  }
}

export async function fetchPage(
  title: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  options: FetchPageOptions = {},
): Promise<WikiPage | null> {
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
    const json = await requestJson(`${API}?${params.toString()}`, fetchImpl, options);

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
