/**
 * The client: fetching a query, rendering it, keeping it fresh.
 *
 * @packageDocumentation
 */
import type { ExposureRecord, LexQuery, LexResponse, LexResult, LexStorage, LexVariables } from "./types.js";
/** How a client is set up. */
export interface ClientOptions {
    /** The server's read address, for example `https://lex.example.com`. */
    readonly url: string;
    /** The locale to ask for. Defaults to the browser's. */
    readonly locale?: string;
    /**
     * The experiment unit: a user id, a device id, a session id.
     *
     * The same unit always sees the same variant. Lex never stores it — it
     * only hashes it — so anything stable and yours will do.
     */
    readonly unit?: string;
    /** The platform, for experiment targeting. */
    readonly platform?: string;
    /** The app version, for experiment targeting. */
    readonly appVersion?: string;
    /**
     * A catalogue baked into the build, used before the network answers.
     *
     * This is what makes a first launch show real text instead of a blank
     * screen: the app renders from what it shipped with, then quietly
     * replaces it with what the server says.
     */
    readonly embedded?: Readonly<Record<string, LexResponse>>;
    /**
     * Where to keep the last answer between launches.
     *
     * Without it, a cold start with no network shows whatever was baked into
     * the build — or nothing. With it, it shows what the person last saw,
     * which is almost always closer to the truth.
     *
     * `localStorage` in a browser, `AsyncStorage` in React Native.
     */
    readonly storage?: LexStorage;
    /** Called whenever an experiment places this client in a variant. */
    readonly onExposure?: (exposure: ExposureRecord) => void;
    /** Replaces `fetch`, for tests and for runtimes that name it differently. */
    readonly fetch?: typeof globalThis.fetch;
}
/** What a client can do. */
export interface LexClient {
    /** Runs a query and renders its text. */
    query<V extends LexVariables, T>(query: LexQuery<V, T>, variables?: V): Promise<LexResult<T>>;
    /** The locale being asked for. */
    locale(): string;
    /** Changes the locale and forgets what was cached in the old one. */
    setLocale(locale: string): void;
    /** Forgets everything cached, so the next call re-fetches. */
    invalidate(): void;
    /** The catalogue version last seen, or 0 before the first answer. */
    version(): number;
}
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
export declare function createClient(options: ClientOptions): LexClient;
//# sourceMappingURL=client.d.ts.map