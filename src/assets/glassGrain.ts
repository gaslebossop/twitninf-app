/**
 * Grain de la vitre dépolie des contenus payants.
 *
 * Bruit blanc 32x32 (gris et alpha variables), embarqué en base64 plutôt
 * qu'en fichier : 1,3 Ko, aucun chargement asynchrone, donc aucun instant où
 * la vitre s'affiche lisse avant de se texturer.
 *
 * Un flou seul donne une image « hors focus » ; c'est ce micro-relief,
 * répété en mosaïque, qui la fait lire comme du VERRE dépoli. Posé très
 * discrètement (voir l'opacité côté composant) : visible de près, invisible
 * en scrollant.
 *
 * Régénérer : bruit aléatoire, PNG niveaux de gris + alpha, 32x32.
 */
export const GLASS_GRAIN_URI =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAFAklEQVR42h2VaTtybRiFtx5vpmiQoQE95kJEhtKDkCEkRfif' +
  '5/8732Pvr/s47n1f97rOtVZglwUfSZH2yZoHFMgzQZk8Kb+sseY7O154yRjLrJPwkTUvKLHgpYOAInusM88scUcssMAyqyzZ' +
  '94SCbdIkPGWJBItMeGbHFuOU2fSIBc8Dj+3YZYUZX/z2iik/7fvsmW8OqZCkwDg7lJnxnXFm/WHLFz9IsewoYNJ35n32yAFx' +
  'aw4Z94ANT0jYs0bSX//Z8ssTNv2xxa7PVPjrP1YpBoyT8sdjm96SZt+Gh3YZ95oSGRb8sm+LP147JOs/Ug7sOfTdS7bIB0yz' +
  'z5qX9skyTYGMP8x464gx9imQDG+0S46KXS9tUSTrLdM+e+FhQIK0dRsUvGDZN5Je+UrFE1a88JaifQI2PPeI//jLJBu2vLHL' +
  'rEP2A+/ss+khCSpekaNM3K4PlGxYtcOWTw48skvWT9+YcxBpdsyCbf+F/75hmh2PPLPns+9sEPObPKve2mbKQ189IOGJ736x' +
  '4Y/3/rNphxKlwKptv/jPJ4f+854ZyiRZ9M1j0iwQJ8e0XVKeUWTXD3sOKLPPJpt2AlK+E3hE0gZ/bdv2kwRzXjHGNsvWvWWK' +
  'mKcs26ZEloo9G6wQhOIHbDBLQMkOZfa8YoU0edKe2CMgToI9B+z4FdJA1ovwQvaZseu7r4E1v32xTZYlit4S95oN/mOWRfv2' +
  'bHlr3Su/STHuLxl7THnJNIu++hCwadcz23Y8I2ffQ9Je+emDA39CR3hHwmeKZMiwRdkjcuRtWmfWo4BlipRteE/eU+a8ZYV5' +
  'm34wE7LOChUfbLHFuh/W/SLjsz3W2GSdXEDGK0rkvKTElC1rxIlFSFdZ9oZ5h17Y9c0Wy77aJLDuGave+Ml84C+T3nnMmF2/' +
  '2WaVRfJsEvOCKV9Y9Zw1St5SZpsV8laJk/SFpIc+hiB9OvTad8bYYc97T5n1yaZ9Vh2w5LFXFPnjMTECryOPxFm3yoz9gGl/' +
  'mfHMe7/tUnFgn21rlCizwZxNCl77YD+0Nmky5Lzzm0l2mAzzIBuZaEDMoa/sR0cnfWPfkR9shnu3ww5pv/3wnFnvbLHEBDPW' +
  'mQuI+e6BQ5+iXFq0zq6fXtrxgoy/zDLpsUfk+UuKgo9ekIscckKGicAe09HwE955T5p1sp5FHlgLTW3LYwKSVinZckAy5JIY' +
  'a458ZjEgTdEae/ZsssG0b/Y9t27Vpj3PPPWeXaaY549tFokxbo3VaEPTIYkxMuxaY4clFvlDhnXvfGKNMlveUHAQfmHdE/Je' +
  '++GL5x5E6XTNVsAOO3aoMOdzxEHCIx+j3Ouy5BMJG+xateYTm+wTiyCusGWH8TAPzlny0hs/bPkYra7oPUkqTJDyJmqLDOsU' +
  'mKJCEJIYReyIKTuhiHd++2uVgkM73pOz4YEDR+wx5QdpsswRs0GMFb9tMh6y6h0leywEZBnjr83o5W1vSDuyGmpOhWXfSXod' +
  'dpW3zPnCgk9hh5Hz3gfPHQSe2WQ/zKFI21XSXpOwb9sDW1FiJr1jLfJhynuPffPFhg2S1kM7bzskTtER2x545ci+gygBJ5mj' +
  'SJyAMTaY8oYKeS9YZMVnr8mF7ATsOfKYnCOKUS9+2yATzbJtl30mKDLNmG/WKbBh02qYCyyH5eZn4GXk8VlSdq2SIB5V3SlZ' +
  'a36xw67nZP3w1K9wgkijemS9OyYY/x8nRhuFLulUFAAAAABJRU5ErkJggg==';

export default GLASS_GRAIN_URI;
