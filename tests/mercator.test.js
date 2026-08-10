/**
 * Projection de la Carte NF.
 *
 * L'erreur qu'on cherche ici est celle qui ne se voit pas à l'essai : placer
 * les marqueurs par une règle de trois sur la latitude. Mercator n'est pas
 * linéaire, donc une carte testée à Paris paraît juste, et décale les
 * marqueurs de plusieurs kilomètres en Scandinavie ou près de l'équateur.
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

const {
  latLonToWorld,
  worldToLatLon,
  visibleTiles,
  screenPosition,
  panCenter,
  viewportBounds,
  TILE_SIZE,
  MAX_LATITUDE,
} = loadTypeScriptModule(require.resolve('../src/utils/mercator.ts'));

const VIEWPORT = { width: 390, height: 700 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const TROMSO = { latitude: 69.6492, longitude: 18.9553 };
const QUITO = { latitude: -0.1807, longitude: -78.4678 };

test('aller-retour lat/lon → pixels → lat/lon, sous toutes les latitudes', () => {
  for (const point of [PARIS, TROMSO, QUITO, { latitude: 0, longitude: 0 }]) {
    for (const zoom of [3, 8, 14]) {
      const world = latLonToWorld(point.latitude, point.longitude, zoom);
      const back = worldToLatLon(world.x, world.y, zoom);
      assert.ok(Math.abs(back.latitude - point.latitude) < 1e-6, 'latitude conservée');
      assert.ok(Math.abs(back.longitude - point.longitude) < 1e-6, 'longitude conservée');
    }
  }
});

test('le méridien de Greenwich tombe au milieu du plan monde', () => {
  const { x } = latLonToWorld(0, 0, 4);
  assert.equal(x, (TILE_SIZE * Math.pow(2, 4)) / 2);
});

test('la projection n’est PAS linéaire en latitude', () => {
  // Un degré de latitude occupe plus de pixels près des pôles qu'à l'équateur.
  const zoom = 8;
  const nearEquator =
    latLonToWorld(1, 0, zoom).y - latLonToWorld(0, 0, zoom).y;
  const nearPole =
    latLonToWorld(70, 0, zoom).y - latLonToWorld(69, 0, zoom).y;

  assert.ok(Math.abs(nearPole) > Math.abs(nearEquator) * 2,
    'une règle de trois sur la latitude serait fausse');
});

test('un marqueur au centre se pose au centre de l’écran', () => {
  const position = screenPosition(PARIS, PARIS, 12, VIEWPORT);
  assert.ok(Math.abs(position.x - VIEWPORT.width / 2) < 1e-6);
  assert.ok(Math.abs(position.y - VIEWPORT.height / 2) < 1e-6);
});

test('un point au nord du centre se pose au-dessus, à toutes les latitudes', () => {
  for (const center of [PARIS, TROMSO, QUITO]) {
    const north = { latitude: center.latitude + 0.2, longitude: center.longitude };
    const position = screenPosition(north, center, 11, VIEWPORT);
    assert.ok(position.y < VIEWPORT.height / 2, 'le nord est en haut');
    assert.ok(Math.abs(position.x - VIEWPORT.width / 2) < 1e-6, 'même méridien, même colonne');
  }
});

test('les tuiles couvrent la fenêtre et restent en nombre raisonnable', () => {
  const tiles = visibleTiles(PARIS, 12, VIEWPORT);
  assert.ok(tiles.length > 0);
  assert.ok(tiles.length <= 64, 'jamais plus de 64 tuiles par rendu');

  const covered = tiles.some(
    (tile) => tile.left <= 0 && tile.top <= 0 && tile.left + TILE_SIZE > 0 && tile.top + TILE_SIZE > 0
  );
  assert.ok(covered, 'le coin haut-gauche de la fenêtre est couvert');
});

test('aucune tuile hors du monde en haut ni en bas', () => {
  const tiles = visibleTiles({ latitude: MAX_LATITUDE, longitude: 0 }, 3, VIEWPORT);
  const count = Math.pow(2, 3);
  for (const tile of tiles) {
    assert.ok(tile.y >= 0 && tile.y < count, 'pas de tuile au-delà des pôles');
    assert.ok(tile.x >= 0 && tile.x < count, 'index de colonne enroulé dans le monde');
  }
});

test('le monde s’enroule horizontalement au 180e méridien', () => {
  const tiles = visibleTiles({ latitude: 0, longitude: 179.9 }, 3, VIEWPORT);
  const count = Math.pow(2, 3);
  assert.ok(tiles.every((tile) => tile.x >= 0 && tile.x < count));
});

test('déplacer de N pixels puis de −N pixels revient au point de départ', () => {
  const moved = panCenter(PARIS, 12, 140, -90);
  const back = panCenter(moved, 12, -140, 90);
  assert.ok(Math.abs(back.latitude - PARIS.latitude) < 1e-6);
  assert.ok(Math.abs(back.longitude - PARIS.longitude) < 1e-6);
});

test('glisser vers la droite fait apparaître ce qui est à l’ouest', () => {
  const moved = panCenter(PARIS, 12, 200, 0);
  assert.ok(moved.longitude < PARIS.longitude, 'la carte suit le doigt');
});

test('le rectangle envoyé à l’API contient bien le centre', () => {
  const bounds = viewportBounds(PARIS, 12, VIEWPORT);
  assert.ok(bounds.north > PARIS.latitude && bounds.south < PARIS.latitude);
  assert.ok(bounds.east > PARIS.longitude && bounds.west < PARIS.longitude);
  assert.ok(bounds.north > bounds.south, 'nord au-dessus du sud');
});

test('zoomer resserre le rectangle demandé', () => {
  const wide = viewportBounds(PARIS, 9, VIEWPORT);
  const tight = viewportBounds(PARIS, 14, VIEWPORT);
  assert.ok(tight.north - tight.south < wide.north - wide.south);
});
