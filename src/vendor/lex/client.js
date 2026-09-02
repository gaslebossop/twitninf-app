/**
 * The client: fetching a query, rendering it, keeping it fresh.
 *
 * @packageDocumentation
 */
import { renderAll } from "./render.js";
import { LexError } from "./types.js";
/**
 * Creates a client.
 *
 * @example
 * ```ts
 * const lex = createClient({ url: "https://lex.example.com", unit: userId });
 * const { text } = await lex.query(Cart, { n: 3 });
 * text["checkout.title"];   // "Votre panier"
 * ```
 */
export function createClient(options) {
    const fetching = options.fetch ?? globalThis.fetch?.bind(globalThis);
    const base = options.url.replace(/\/$/, "");
    const cache = new Map();
    let locale = options.locale ?? defaultLocale();
    let version = 0;
    /** Where one answer is kept on disk. */
    const storageKey = (key) => `lex.answer.${key}`;
    /** Keeps an answer, ignoring a storage that refuses. */
    const persist = async (key, cached) => {
        if (!options.storage)
            return;
        try {
            await options.storage.set(storageKey(key), JSON.stringify(cached));
        }
        catch {
            // A cache that cannot be written is not worth failing a request over.
        }
    };
    /** The cache key: a query in two locales is two answers. */
    const keyOf = (query, variables) => `${query.hash}|${locale}|${stableJson(variables)}`;
    /** The best thing held locally, when the server cannot be reached. */
    const fallbackFor = (cached, hash) => {
        const response = cached?.response ?? options.embedded?.[hash];
        return response ? { response, fresh: false } : undefined;
    };
    async function request(query, variables) {
        const key = keyOf(query, variables);
        let cached = cache.get(key);
        // A cold start has nothing in memory, but may have something on disk.
        if (!cached && options.storage) {
            const kept = await readStored(options.storage, storageKey(key));
            if (kept) {
                cache.set(key, kept);
                cached = kept;
            }
        }
        if (!fetching) {
            const held = fallbackFor(cached, query.hash);
            if (held)
                return held;
            throw new LexError("LEX_CLIENT_NO_FETCH", "no fetch available in this runtime");
        }
        const url = `${base}/q/${query.hash}${queryString({
            v: Object.keys(variables).length > 0 ? JSON.stringify(variables) : undefined,
            u: options.unit,
            p: options.platform,
            a: options.appVersion,
        })}`;
        const headers = { "accept-language": locale };
        if (cached?.etag)
            headers["if-none-match"] = cached.etag;
        let response;
        try {
            response = await fetching(url, { headers });
        }
        catch (cause) {
            // The network is gone. Anything already held beats an empty screen.
            const held = fallbackFor(cached, query.hash);
            if (held)
                return held;
            throw new LexError("LEX_CLIENT_UNREACHABLE", `cannot reach ${base}: ${String(cause)}`);
        }
        if (response.status === 304) {
            // Normally this is the answer to our own conditional request. It can
            // also arrive from a proxy answering a tag we never sent, and then
            // there is nothing to un-modify — so fall back rather than parse an
            // empty body.
            // A 304 is the server speaking: what is held is current, not stale.
            const unchanged = cached?.response ?? options.embedded?.[query.hash];
            if (unchanged)
                return { response: unchanged, fresh: true };
            throw new LexError("LEX_CLIENT_STALE", "the server said nothing changed, but this client holds nothing", 304);
        }
        if (!response.ok) {
            const body = (await response.json().catch(() => ({})));
            // A server that has forgotten a query, or is briefly unwell, should
            // not blank a screen that already has text on it.
            const held = fallbackFor(cached, query.hash);
            if (held)
                return held;
            throw new LexError(body.code ?? "LEX_CLIENT_FAILED", body.message ?? `the server answered ${response.status}`, response.status);
        }
        const parsed = (await response.json().catch(() => undefined));
        // A 200 whose body is not a response — a captive portal, a proxy
        // error page, a truncated read. Anything held beats rendering nothing.
        if (!parsed || typeof parsed.t !== "object" || parsed.t === null) {
            const held = fallbackFor(cached, query.hash);
            if (held)
                return held;
            throw new LexError("LEX_CLIENT_MALFORMED", `${base} answered something that is not a Lex response`, response.status);
        }
        const fresh = {
            response: parsed,
            etag: response.headers.get("etag") ?? undefined,
        };
        cache.set(key, fresh);
        void persist(key, fresh);
        version = parsed.v;
        return { response: parsed, fresh: true };
    }
    return {
        async query(query, variables) {
            const values = (variables ?? {});
            const { response, fresh } = await request(query, values);
            for (const exposure of response.x ?? [])
                options.onExposure?.(exposure);
            return {
                text: renderAll(response.t, values, { locale: response.l }),
                locale: response.l,
                version: response.v,
                exposures: response.x ?? [],
                fresh,
            };
        },
        locale: () => locale,
        setLocale(next) {
            if (next === locale)
                return;
            locale = next;
            // Cached answers are per-locale, and the old ones are now wrong.
            cache.clear();
        },
        invalidate() {
            cache.clear();
        },
        version: () => version,
    };
}
/**
 * A query string, written out rather than assembled with `URLSearchParams`.
 *
 * React Native ships a `URL` whose `searchParams` throws — and it is one of
 * the runtimes this client exists for. Six lines here buy every runtime
 * with a `fetch`, which is the whole promise of the package.
 */
function queryString(params) {
    const pairs = Object.entries(params)
        .filter((entry) => entry[1] !== undefined)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`);
    return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
/** Reads one kept answer, treating anything unreadable as absent. */
async function readStored(storage, key) {
    try {
        const kept = await storage.get(key);
        return kept ? JSON.parse(kept) : undefined;
    }
    catch {
        return undefined;
    }
}
/** The browser's locale, or English outside one. */
function defaultLocale() {
    const navigatorLocale = globalThis.navigator
        ?.language;
    return navigatorLocale ?? "en";
}
/**
 * JSON with object keys sorted, so two equal variable sets cache alike.
 *
 * `{a:1,b:2}` and `{b:2,a:1}` are the same request and must not fetch twice.
 */
function stableJson(value) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify(entries);
}
//# sourceMappingURL=client.js.map