/**
 * Staying in sync with a catalogue that changes.
 *
 * Optional, on purpose. Without it a client re-fetches on its own
 * schedule; with it a text change reaches the screen in under a second,
 * with no reload and no redeploy.
 *
 * @packageDocumentation
 */
/** What the server pushes when a release is published. */
export interface Update {
    /** The new catalogue version. */
    readonly v: number;
    /** The keys that changed. Absent means "re-fetch what you hold". */
    readonly changed?: readonly string[];
}
/** How a live connection is set up. */
export interface LiveOptions {
    /** The server's read address. The socket path is added. */
    readonly url: string;
    /** Called when the catalogue moves. */
    readonly onUpdate: (update: Update) => void;
    /** Called when the connection ends, before a reconnection is scheduled. */
    readonly onClose?: () => void;
    /** Replaces `WebSocket`, for tests. */
    readonly socket?: new (url: string) => WebSocket;
    /** Milliseconds before the first reconnection attempt. */
    readonly retryDelay?: number;
    /** The longest a reconnection will ever wait. */
    readonly maxRetryDelay?: number;
}
/** A live connection. */
export interface LiveConnection {
    /** Stops reconnecting and closes. */
    close(): void;
    /** Whether the socket is currently open. */
    connected(): boolean;
}
/**
 * Connects, and keeps connecting.
 *
 * A dropped connection is normal — phones sleep, proxies time out, laptops
 * close — so this reconnects with backoff rather than reporting an error
 * nobody can act on. The delay doubles up to a ceiling and resets on a
 * successful connection.
 *
 * @example
 * ```ts
 * const live = connectLive({
 *   url: "https://lex.example.com",
 *   onUpdate: () => { lex.invalidate(); repaint(); },
 * });
 * ```
 */
export declare function connectLive(options: LiveOptions): LiveConnection;
/**
 * Whether an update concerns a client holding these keys.
 *
 * An update that names nothing concerns everyone.
 */
export declare function concerns(update: Update, held: readonly string[]): boolean;
//# sourceMappingURL=live.d.ts.map