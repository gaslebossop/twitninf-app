/**
 * Staying in sync with a catalogue that changes.
 *
 * Optional, on purpose. Without it a client re-fetches on its own
 * schedule; with it a text change reaches the screen in under a second,
 * with no reload and no redeploy.
 *
 * @packageDocumentation
 */
/** How long to wait before the first retry. */
const DEFAULT_RETRY = 1_000;
/** The ceiling on backoff: a minute is long enough to be polite. */
const DEFAULT_MAX_RETRY = 60_000;
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
export function connectLive(options) {
    const Socket = options.socket ?? globalThis.WebSocket;
    const base = options.url.replace(/\/$/, "").replace(/^http/, "ws");
    const first = options.retryDelay ?? DEFAULT_RETRY;
    const ceiling = options.maxRetryDelay ?? DEFAULT_MAX_RETRY;
    let socket;
    let delay = first;
    let closed = false;
    let timer;
    function open() {
        if (closed || !Socket)
            return;
        try {
            socket = new Socket(`${base}/live`);
        }
        catch {
            // Some runtimes throw here rather than firing `onerror` — a phone
            // with no network at the moment of the call, most often. That is a
            // reason to try again later, not to give up on live updates.
            retry();
            return;
        }
        socket.onopen = () => {
            // Only a connection that actually opened resets the backoff;
            // otherwise a server that accepts and immediately drops would be
            // hammered once a second forever.
            delay = first;
        };
        socket.onmessage = (event) => {
            try {
                options.onUpdate(JSON.parse(String(event.data)));
            }
            catch {
                // A message we cannot read is not worth taking the socket down for.
            }
        };
        socket.onclose = () => {
            options.onClose?.();
            retry();
        };
        socket.onerror = () => {
            // `onclose` always follows, and that is where reconnection lives.
            socket?.close();
        };
    }
    /** Schedules the next attempt, and widens the gap before the one after. */
    function retry() {
        if (closed || timer !== undefined)
            return;
        timer = setTimeout(() => {
            timer = undefined;
            open();
        }, delay);
        delay = Math.min(delay * 2, ceiling);
    }
    open();
    return {
        close() {
            closed = true;
            if (timer !== undefined)
                clearTimeout(timer);
            timer = undefined;
            socket?.close();
        },
        connected: () => socket?.readyState === 1,
    };
}
/**
 * Whether an update concerns a client holding these keys.
 *
 * An update that names nothing concerns everyone.
 */
export function concerns(update, held) {
    if (!update.changed || update.changed.length === 0)
        return true;
    return update.changed.some((key) => held.includes(key));
}
//# sourceMappingURL=live.js.map