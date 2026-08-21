/**
 * Ce qui a le droit d'entrer dans le fil.
 *
 * Ces cas ne sont pas théoriques : le test `tweet.content` truthy qu'ils
 * remplacent jetait en silence trois familles entières de contenu, entre le
 * moment où le recommandeur les servait et celui où la liste les affichait.
 * Chacune est ici, et chacune correspond à un bug réel.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

function loadTypeScriptModule(path) {
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(path, module);
  loaded.filename = path;
  loaded.paths = module.paths;
  loaded._compile(output, path);
  return loaded.exports;
}

const { hasRenderableContent } = loadTypeScriptModule('src/utils/tweetMedia.ts');

test('un tweet avec du texte passe', () => {
  assert.equal(hasRenderableContent({ id: '1', content: 'bonjour' }), true);
});

test('un tweet sans id ne passe jamais', () => {
  assert.equal(hasRenderableContent({ content: 'bonjour' }), false);
  assert.equal(hasRenderableContent(null), false);
  assert.equal(hasRenderableContent(undefined), false);
});

test('un tweet vide et sans média ne passe pas', () => {
  assert.equal(hasRenderableContent({ id: '1', content: '' }), false);
  assert.equal(hasRenderableContent({ id: '1', content: '   ' }), false);
  assert.equal(hasRenderableContent({ id: '1' }), false);
});

test('un tweet publié en IMAGE SEULE passe', () => {
  assert.equal(
    hasRenderableContent({ id: '1', content: '', media_urls: ['https://x/photo.jpg'] }),
    true,
  );
});

test('un tweet publié en VIDÉO SEULE passe', () => {
  assert.equal(
    hasRenderableContent({ id: '1', content: '', media_urls: ['https://x/clip.mp4'] }),
    true,
  );
});

test('un RETWEET PUR passe : son texte vit sur l’original', () => {
  const retweet = {
    id: 'rt',
    content: '',
    is_retweet: true,
    originalTweet: { id: 'src', content: 'le vrai texte' },
  };
  assert.equal(hasRenderableContent(retweet), true);
});

test('un retweet d’un tweet en image seule passe aussi', () => {
  const retweet = {
    id: 'rt',
    content: '',
    tweet_type: 'retweet',
    originalTweet: { id: 'src', content: '', media_urls: ['https://x/photo.jpg'] },
  };
  assert.equal(hasRenderableContent(retweet), true);
});

test('un retweet dont l’original est vide et sans média ne passe pas', () => {
  const retweet = {
    id: 'rt',
    content: '',
    is_retweet: true,
    originalTweet: { id: 'src', content: '' },
  };
  assert.equal(hasRenderableContent(retweet), false);
});

test('une CITATION sans commentaire passe : le tweet cité porte le sens', () => {
  const quote = {
    id: 'q',
    content: '',
    is_quote: true,
    originalTweet: { id: 'src', content: 'texte cité' },
  };
  assert.equal(hasRenderableContent(quote), true);
});

test('un COMPTE PROMU passe : l’écran lui rend sa propre carte', () => {
  const promoted = {
    id: 'ad-1',
    content: '',
    promoted_account: { id: 'u9', username: 'marque' },
  };
  assert.equal(hasRenderableContent(promoted), true);
});

test('un media_urls mal formé ne fait pas passer un tweet vide', () => {
  assert.equal(hasRenderableContent({ id: '1', content: '', media_urls: [] }), false);
  assert.equal(hasRenderableContent({ id: '1', content: '', media_urls: [null, ''] }), false);
  assert.equal(hasRenderableContent({ id: '1', content: '', media_urls: 'pas-un-tableau' }), false);
});
