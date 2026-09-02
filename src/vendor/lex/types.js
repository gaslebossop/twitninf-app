/**
 * The shapes the protocol puts on the wire.
 *
 * These mirror `lex-engine::response` and `lex-icu::program`. They are
 * written out rather than generated so that reading this file tells you
 * exactly what arrives, in the language you are reading it in.
 *
 * @packageDocumentation
 */
/** Why a request failed. */
export class LexError extends Error {
    /** The protocol's stable error code, when the server sent one. */
    code;
    /** The HTTP status, when there was one. */
    status;
    constructor(code, message, status) {
        super(message);
        this.name = "LexError";
        this.code = code;
        this.status = status;
    }
}
//# sourceMappingURL=types.js.map