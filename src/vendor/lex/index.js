/**
 * The Lex client for TypeScript.
 *
 * Runs anywhere `fetch` does: a browser, Node, Bun, React Native.
 *
 * ```ts
 * import { createClient } from "@lexlang/client";
 * import { Cart } from "./lex.generated.js";
 *
 * const lex = createClient({ url: "https://lex.example.com", unit: userId });
 * const { text } = await lex.query(Cart, { n: 3 });
 *
 * document.title = text["checkout.title"];
 * ```
 *
 * @packageDocumentation
 */
export { createClient } from "./client.js";
export { connectLive, concerns } from "./live.js";
export { groupEntries, render, renderAll } from "./render.js";
export { categorize, operandsOf, pluralCategory, ruleFor } from "./plural.js";
export { LexError } from "./types.js";
//# sourceMappingURL=index.js.map