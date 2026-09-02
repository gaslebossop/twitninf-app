/**
 * Recopie le client Lex compilé dans `src/vendor/lex/`.
 *
 * Metro ne sait pas résoudre un import distant, et le dépôt `lex` n'est pas
 * publié sur npm : la seule façon d'utiliser *la* bibliothèque plutôt que d'en
 * réécrire une dans l'app est d'en embarquer la sortie. Ce script rend cette
 * copie reproductible — et vérifiable : elle ne se modifie pas à la main.
 *
 * Le jour où `@lexlang/client` est sur npm, ce script et `src/vendor/lex/`
 * disparaissent au profit d'un `npm install`.
 *
 *   node scripts/sync-lex-sdk.mjs [chemin/vers/lex]
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lex = resolve(process.argv[2] ?? process.env.LEX_REPO ?? join(app, '..', 'lex'));
const core = join(lex, 'sdk', 'ts', 'packages', 'core');
const target = join(app, 'src', 'vendor', 'lex');

// Compiler avant de copier : sans cela on embarque silencieusement la sortie
// d'une version antérieure du source, ce qui est pire que pas de copie du tout.
execFileSync('npm', ['run', 'build'], { cwd: core, stdio: 'inherit', shell: true });

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const dist = join(core, 'dist');
const copied = readdirSync(dist)
  // Les source maps pointent vers un arbre absent de ce dépôt : les embarquer
  // n'aiderait personne à déboguer et alourdirait le bundle.
  .filter((name) => name.endsWith('.js') || name.endsWith('.d.ts'))
  .sort();

for (const name of copied) copyFileSync(join(dist, name), join(target, name));

const version = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8')).version;
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: lex }).toString().trim();
  } catch {
    return 'inconnu';
  }
})();

writeFileSync(
  join(target, 'PROVENANCE.md'),
  `# @lexlang/client — copie embarquée

**Ne rien modifier ici.** Ce dossier est régénéré par \`node scripts/sync-lex-sdk.mjs\` ;
toute correction se fait dans le dépôt \`lex\` (\`sdk/ts/packages/core/src/\`), avec ses
tests, puis se resynchronise.

| | |
|---|---|
| Version | ${version} |
| Commit | ${commit} |
| Synchronisé le | ${new Date().toISOString().slice(0, 10)} |
| Fichiers | ${copied.filter((n) => n.endsWith('.js')).length} modules |
`,
  'utf8',
);

console.log(`Lex ${version} (${commit}) → src/vendor/lex/ : ${copied.length} fichiers.`);
