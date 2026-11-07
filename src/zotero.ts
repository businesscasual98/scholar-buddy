import { requestUrl } from "obsidian";

/** Subset of the Zotero API item shape we care about. */
export interface ZoteroItemData {
  key: string;
  version: number;
  itemType: string;
  parentItem?: string;
  deleted?: boolean;
  title?: string;
  date?: string;
  creators?: { firstName?: string; lastName?: string; name?: string; creatorType: string }[];
  // annotation fields
  annotationType?: "highlight" | "underline" | "note" | "text" | "image" | "ink";
  annotationText?: string;
  annotationComment?: string;
  annotationColor?: string;
  annotationPageLabel?: string;
  annotationSortIndex?: string;
  // note fields
  note?: string;
}

interface ZoteroApiItem {
  key: string;
  version: number;
  data: ZoteroItemData;
}

/**
 * Zotero drops any request that carries a browser `Origin` header (which
 * Obsidian's requestUrl always sends) unless this header is present.
 */
const ALLOWED = { "Zotero-Allowed-Request": "1" };

export interface BbtSearchHit {
  citekey?: string;
  title?: string;
  author?: { family?: string; given?: string; literal?: string }[];
}

export class ZoteroUnavailableError extends Error {}
export class LocalApiDisabledError extends Error {}

/** Thin client over Zotero 7+'s local HTTP API and Better BibTeX's JSON-RPC. */
export class ZoteroClient {
  constructor(private port: number) {}

  private get base(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Library version from Zotero's Last-Modified-Version header. One tiny request. */
  async libraryVersion(): Promise<number> {
    const res = await this.get(`/api/users/0/items?format=versions&limit=1`);
    return parseInt(res.headers["last-modified-version"] ?? "0", 10) || 0;
  }

  async allItemsOfType(itemType: string): Promise<ZoteroItemData[]> {
    const out: ZoteroItemData[] = [];
    const limit = 100;
    for (let start = 0; ; start += limit) {
      const res = await this.get(
        `/api/users/0/items?itemType=${itemType}&format=json&limit=${limit}&start=${start}`
      );
      const page = res.json as ZoteroApiItem[];
      out.push(...page.map((i) => i.data));
      const total = parseInt(res.headers["total-results"] ?? "0", 10);
      if (page.length < limit || out.length >= total) break;
    }
    return out;
  }

  async itemsByKey(keys: string[]): Promise<Map<string, ZoteroItemData>> {
    const map = new Map<string, ZoteroItemData>();
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      // Zotero's local API also returns children for itemKey queries (an attachment's annotations
      // alone can run to hundreds), so page through everything and keep only what we asked for.
      const limit = 100;
      for (let start = 0; ; start += limit) {
        const res = await this.get(
          `/api/users/0/items?itemKey=${batch.join(",")}&format=json&limit=${limit}&start=${start}`
        );
        const page = res.json as ZoteroApiItem[];
        for (const it of page) {
          if (batch.includes(it.key)) map.set(it.key, it.data);
        }
        const total = parseInt(res.headers["total-results"] ?? "0", 10);
        if (page.length < limit || start + limit >= total || batch.every((k) => map.has(k))) break;
      }
    }
    return map;
  }

  /** {zoteroItemKey: citekey} from Better BibTeX. Throws if BBT isn't reachable. */
  async citekeys(itemKeys: string[]): Promise<Record<string, string>> {
    const res = await requestUrl({
      url: `${this.base}/better-bibtex/json-rpc`,
      method: "POST",
      contentType: "application/json",
      headers: ALLOWED,
      body: JSON.stringify({ jsonrpc: "2.0", method: "item.citationkey", params: [itemKeys], id: 1 }),
      throw: false,
    });
    if (res.status !== 200) throw new ZoteroUnavailableError(`Better BibTeX RPC returned ${res.status}`);
    const result = (res.json as { result?: Record<string, string | null> }).result ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(result)) if (v) out[k] = v;
    return out;
  }

  /** Better BibTeX full-text search; results are CSL-JSON plus `citekey`. */
  async search(query: string): Promise<BbtSearchHit[]> {
    const res = await requestUrl({
      url: `${this.base}/better-bibtex/json-rpc`,
      method: "POST",
      contentType: "application/json",
      headers: ALLOWED,
      body: JSON.stringify({ jsonrpc: "2.0", method: "item.search", params: [query], id: 1 }),
      throw: false,
    });
    if (res.status !== 200) throw new ZoteroUnavailableError(`Better BibTeX RPC returned ${res.status}`);
    return (res.json as { result?: BbtSearchHit[] }).result ?? [];
  }

  private async get(path: string) {
    let res;
    try {
      res = await requestUrl({ url: this.base + path, headers: ALLOWED, throw: false });
    } catch {
      throw new ZoteroUnavailableError("Zotero is not running or its HTTP server is off.");
    }
    if (res.status === 403) throw new LocalApiDisabledError("Zotero's local API is not enabled.");
    if (res.status !== 200) throw new ZoteroUnavailableError(`Zotero returned HTTP ${res.status} for ${path}`);
    return res;
  }
}
