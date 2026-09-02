/**
 * Which plural form a number takes, in a given language.
 *
 * A port of the server's `lex-icu::plural`, rule for rule. The two must
 * agree exactly — a number that is `few` on the server and `other` here
 * would show the wrong sentence — so the conformance suite runs the same
 * cases against both.
 *
 * @packageDocumentation
 */
/** A CLDR plural category. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
/** The rule families this SDK implements. */
export type PluralRule = "invariant" | "oneIsSingular" | "zeroAndOneAreSingular" | "eastSlavic" | "polish" | "czech" | "arabic" | "romanian" | "lithuanian";
/**
 * The numeric operands a CLDR rule reads.
 *
 * Rules do not look at a quantity, they look at how it is *written*: `1`
 * and `1.0` are the same number and different categories in Russian.
 */
export interface Operands {
    /** Absolute value. */
    readonly n: number;
    /** Integer digits. */
    readonly i: number;
    /** Number of visible fraction digits. */
    readonly v: number;
}
/**
 * The rule for a locale, defaulting to the English one.
 *
 * Only the language part is read: `fr-CA` and `fr` pluralise alike, and no
 * CLDR rule varies by region. An unknown language falls back rather than
 * failing — a wrong plural is cosmetic, a missing string is a broken screen.
 */
export declare function ruleFor(locale: string): PluralRule;
/**
 * The operands of a number, given how many fraction digits it is shown with.
 */
export declare function operandsOf(value: number, digits?: number): Operands;
/** The category a number falls into under a rule. */
export declare function categorize(rule: PluralRule, operands: Operands): PluralCategory;
/**
 * The plural category of a value in a locale, in one call.
 *
 * @example
 * ```ts
 * pluralCategory("ru", 3);   // "few"
 * pluralCategory("fr", 0);   // "one"
 * pluralCategory("en", 0);   // "other"
 * ```
 */
export declare function pluralCategory(locale: string, value: number, digits?: number): PluralCategory;
//# sourceMappingURL=plural.d.ts.map