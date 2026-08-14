# Événements — contrat d'API

Ce document décrit ce que le VPS doit exposer pour que le système d'événements
de l'app fonctionne, et la charge à injecter pour l'anniversaire twitninf.

Côté app, tout est déjà en place : `src/types/events.ts` (contrat),
`src/services/eventsApi.ts` (réseau), `src/contexts/EventsContext.tsx` (état),
`src/theme/eventArt.ts` (direction artistique), `src/screens/EventScreen.tsx`
(hub). Il ne manque que ces routes.

---

## Le principe

Le serveur reste **autoritaire**. Il décide quel événement est actif, où en est
chaque compte, et ce que vaut chaque récompense. Le client ne s'accorde jamais
rien : il demande, le serveur tranche.

Une seule exception, assumée : **la direction artistique ne transite pas en
couleurs**. Le serveur envoie une clé (`art: "birthday"`), l'app sait ce que
cette clé veut dire. Une DA inconnue de l'app retombe silencieusement sur
l'habillage ordinaire — un événement peut donc être créé avant que sa DA ne
soit livrée par un build.

### Ce que ce contrat remplace

| Ancien | Rôle | Devient |
|---|---|---|
| `GET /api/events/active` | couleurs + effets | `GET /api/events/current` |
| `GET /api/functional-events/active` | bascules par page | champ `features` |
| `GET /api/user-challenges?event_slug=` | quêtes + progression | champs `quests` / `progress` |
| `POST /api/user-challenges/:id/claim` | réclamation | `POST …/quests/:id/claim` |
| `POST /api/user-challenges/update-*-progress/:slug` | 5 routes de recalcul | supprimées (voir « mesure ») |

Les trois anciens systèmes n'étaient reliés que par un `event_slug` recopié à
la main. Un événement dont la DA était active mais dont l'événement fonctionnel
avait expiré affichait ses couleurs de fête au-dessus de quêtes devenues
inaccessibles, sans que rien ne signale l'incohérence.

**L'app sait encore lire l'ancienne forme.** `eventsApi.fetchCurrent()` essaie
`/api/events/current`, et recompose la réponse depuis les anciennes routes en
cas d'échec. Publier le build avant la mise à jour du VPS n'éteint donc rien.

---

## Routes

### `GET /api/events/current`

L'événement en cours pour le compte authentifié. **Aucun événement actif est
une réponse normale**, pas une erreur.

```jsonc
{
  "success": true,
  "data": {
    "event": {
      "id": "twitninf-birthday-2026",
      "slug": "birthday2026",
      "name": "Anniversaire twitninf",
      "description": "…",
      "starts_at": "2026-08-24T00:00:00+02:00",
      "ends_at":   "2026-08-31T23:59:59+02:00",
      "is_active": true,
      "priority": 100,
      "art": "birthday",              // clé de DA, pas des couleurs
      "features": {
        "hub": true, "banner": true, "intro": true,
        "skinApp": false, "earnMultiplier": 1.5, "dailyGift": true
      },
      "banner_message": "…",
      "quests": [ /* définitions — voir le seed */ ]
    },
    "progress": [
      {
        "quest_id": "candle",
        "progress": 1, "goal": 1,
        "completed": true, "claimed": false,
        "claimed_at": null
      },
      {
        "quest_id": "cake",
        "progress": 0, "goal": 10000,
        "completed": false, "claimed": false,
        // uniquement pour les quêtes `collective`
        "community": { "progress": 4213, "goal": 10000 }
      }
    ]
  }
}
```

Sans événement : `{ "success": true, "data": { "event": null } }`.

> **`is_active` fait foi.** Les dates ne servent au client qu'à afficher le
> compte à rebours. Un événement dont la fenêtre est passée mais qui reste
> `is_active` sera affiché — c'est voulu, cela laisse le temps de réclamer.

### `POST /api/events/:slug/quests/:questId/claim`

Remet la récompense. Idempotent : un second appel sur une quête déjà réclamée
répond `success: false` sans rien accorder deux fois.

```jsonc
{
  "success": true,
  "data": {
    "granted": {
      "kind": "coins",
      "label": "300 NF",
      "payload": { "amount": 300 }
    }
  }
}
```

`granted` est **ce qui a réellement été donné**, pas ce que la quête annonçait.
Sur un `lootbox`, les deux diffèrent par construction — c'est tout l'intérêt.
Le client affiche `granted.label` et, si `kind === "coins"`, joue la
célébration avec `payload.amount`.

Refus attendus : quête non terminée, déjà réclamée, événement clos, prérequis
non satisfaits. Toujours `200` avec `success: false` et un `message` lisible —
l'app l'affiche tel quel.

### `POST /api/events/:slug/quests/:questId/report`

Pour les quêtes que **seul le client peut constater** : la navigation. Le
serveur ne voit pas passer l'ouverture de la Carte NF.

```jsonc
// requête
{ "amount": 1, "idempotency_key": "birthday2026:tour:map" }
```

`idempotency_key` est **obligatoire** et doit être mémorisée côté serveur : un
écran remonté deux fois enverrait sinon deux fois le même signal. Le serveur
reste libre de plafonner ou d'ignorer.

> ⚠️ **Ne jamais accorder une récompense sur la seule foi d'un signal client.**
> Un `report` incrémente un compteur ; c'est `claim` qui donne, après
> revérification côté serveur.

---

## Mesure des quêtes

`kind` dit au serveur comment mesurer. C'est la seule chose qu'il doit
implémenter par type ; le client ne fait qu'afficher.

| `kind` | Mesure | Recalcul |
|---|---|---|
| `count` | compteur d'actes sur la période | à l'acte |
| `streak` | jours calendaires distincts avec ≥ 1 acte, **remis à 0** si un jour est sauté | quotidien |
| `single` | booléen, `goal` toujours à 1 | à l'acte |
| `social` | acteurs **distincts** (dédupliqué par `user_id`) | à l'acte |
| `explore` | signaux `report` distincts | au report |
| `timed` | comme `single`, mais rejeté hors de `window` | à l'acte |
| `collective` | agrégat global ; `progress` par compte reste sa part | périodique |
| `secret` | déclencheur privé, non annoncé | à l'acte |

Les cinq anciennes routes `update-*-progress` disparaissent : la progression se
recalcule à l'événement métier, pas sur demande du client. C'est ce qui
permettait à un client de forcer un recalcul en boucle.

---

## Récompenses

| `kind` | `payload` | Effet serveur |
|---|---|---|
| `coins` | `{ amount }` | crédite le solde NF |
| `pro_days` | `{ days }` | prolonge l'accès Pro |
| `cosmetic` | `{ slot, value, exclusive? }` | débloque à vie dans la personnalisation |
| `badge` | `{ badge, permanent }` | badge de profil |
| `title` | `{ title }` | titre sous le pseudo |
| `multiplier` | `{ factor, hours }` | bonus temporaire sur les gains |
| `unlock` | `{ feature, hours? }` | capacité normalement payante, prêtée |
| `lootbox` | table de tirage côté serveur | **tire, puis renvoie le résultat réel dans `granted`** |

`slot` correspond aux champs de `profileCustomizationService` :
`avatar_decoration`, `name_font`, `name_effect`, `profile_effect`,
`banner_style`.

---

## Seed — anniversaire twitninf

Source de vérité : [`src/data/birthdayEvent.ts`](../src/data/birthdayEvent.ts),
typé et relu en revue de code. À injecter tel quel.

> **`is_active: false` volontairement.** C'est le VPS qui allumera l'événement
> le 24 août. Injecter un événement déjà actif, c'est le lancer à l'instant de
> l'injection — soit dix jours trop tôt.

### Les onze quêtes

| # | id | kind | palier | Ce qu'il faut faire | Récompense |
|---|---|---|---|---|---|
| 1 | `candle` | single | bronze | Publier avec `#JoyeuxTwitninf` | 120 NF |
| 2 | `toast` | social | bronze | 5 comptes distincts aiment ta bougie | Décoration d'avatar « Pétales » |
| 3 | `spread` | count | bronze | Aimer 50 tweets | Gains × 2 pendant 24 h |
| 4 | `tour` | explore | argent | Visiter les 6 recoins de l'app | Paquet surprise |
| 5 | `gift` | social | argent | Envoyer des NF à 3 comptes | Paquet surprise (rare) |
| 6 | `guestbook` | single | argent | Laisser un mot dans le livre d'or | Titre « Invité d'honneur » |
| 7 | `midnight` | timed | or | Publier entre 00:00 et 00:20 le 24 | Police de nom « Minuit », exclusive |
| 8 | `sevennights` | streak | or | 7 jours d'affilée | 7 jours de Pro |
| 9 | `cake` | collective | argent | 10 000 tweets par toute la communauté | 300 NF pour tout le monde |
| 10 | `echo` | secret | légendaire | *(non annoncé)* | Badge « Chat noir » |
| 11 | `founder` | count | légendaire | Terminer 8 des autres | Badge « Fondateur » + 1 000 NF + 30 j de Pro |

Une seule est un compteur pur (`spread`), et c'est assumé : il en faut une
qu'on remplit sans y penser. Trois sont impossibles à réussir seul (`toast`,
`gift`, `cake`), une est invisible (`echo`), et une n'est ouverte que vingt
minutes (`midnight`).

### Points d'attention côté serveur

- **`toast`** — dédupliquer par `user_id` du liker. Sans cela, la quête se
  farme avec un seul compte complice.
- **`midnight`** — la fenêtre est en `+02:00`. Comparer en UTC après
  conversion, pas en heure locale du serveur.
- **`echo`** — le déclencheur reste à définir avec vous ; il doit être trouvable
  sans être documenté. La quête porte `hidden: true`, donc l'app ne l'affiche
  pas tant que `progress` vaut 0.
- **`founder`** — `goal: 8` se mesure sur les **autres** quêtes terminées,
  `founder` non comprise. Volontairement sans `requires`, pour rester visible
  dès le premier jour : verrouillée, personne ne viserait les huit.
- **`cake`** — `progress` renvoyé par compte doit être la valeur **globale**
  (l'app affiche `community` en priorité), et la récompense est due à tout le
  monde, y compris à ceux qui n'ont rien publié.

### Ce qui reste à trancher côté produit

- Le contenu exact des deux tables de tirage (`tour`, `gift`). Les `teaser`
  affichés dans l'app annoncent ce qu'on **peut** gagner ; la table réelle est
  côté serveur.
- Le déclencheur de `echo`.
- Le livre d'or (`guestbook`) suppose un point d'entrée d'écriture. L'ancienne
  API exposait `POST /api/user-challenges/complete-birthday-wish/:slug` — à
  reprendre sous la nouvelle forme.

---

## Nettoyage restant côté app

Le nouveau système est en place et alimente tout. Trois modules ne sont plus
que des **adaptateurs** vers lui — ils ne tiennent plus d'état et n'appellent
plus le réseau :

- `contexts/EventContext.tsx` (9 appelants)
- `contexts/FunctionalEventContext.tsx` (2 appelants)
- `hooks/useKosporBirthdayEvent.ts` (6 appelants)

À supprimer une fois leurs appelants migrés vers `useEvents()` de
`EventsContext`, avec `services/eventService.ts`,
`services/functionalEventService.ts`, `services/userChallengeService.ts`,
`services/challengeProgressService.ts`, `themes/eventThemes.ts`,
`hooks/useEventTheme.ts`, `hooks/useEventStyles.ts`,
`components/EventBanner.tsx`, `components/FunctionalEventBanner.tsx`,
`screens/KosporBirthdayScreen.tsx` et `components/KosporBirthdayPopup.tsx`.

C'est du travail mécanique, mais qui se vérifie écran par écran — donc à faire
en regardant l'app tourner, pas à l'aveugle.
