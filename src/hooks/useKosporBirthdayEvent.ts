import { useMemo } from 'react';
import { useEvents } from '../contexts/EventsContext';

/**
 * Adaptateur vers le nouveau système d'événements.
 *
 * ── Son histoire, qui vaut la peine d'être gardée ─────────────────────────
 * Ce hook était monté par six endroits à la fois (navigateur principal, barre
 * d'onglets, réglages, profil, page et popup de l'événement). Chaque instance
 * entretenait son propre minuteur de 30 s, et chaque tic déclenchait DEUX
 * appels réseau non mis en cache : une dizaine de requêtes toutes les trente
 * secondes, sur un simple profil ouvert, pour une réponse qui change une fois
 * par an.
 *
 * Le correctif de l'époque — un singleton de module avec abonnés, requête en
 * vol partagée et suspension en arrière-plan — était juste, et il est
 * documenté ici parce qu'il a servi de modèle au reste. Il traitait pourtant
 * un symptôme : la vraie cause était qu'aucune des six instances n'avait de
 * raison d'exister. Un fournisseur monté une fois à la racine EST le
 * propriétaire unique, et rend tout ce mécanisme inutile.
 *
 * ── Ce qui reste à faire ──────────────────────────────────────────────────
 * Les six appelants testent `isEventActive` pour afficher un onglet et une
 * page dédiés à UN événement. Le nouveau système rend ces branches génériques
 * (`features.hub`) : à migrer, puis supprimer ce fichier ainsi que
 * `KosporBirthdayScreen` et `KosporBirthdayPopup`, tous deux remplacés par
 * `EventScreen`.
 */

/** Slug historique, conservé le temps que les six appelants soient migrés. */
const LEGACY_SLUG = 'kosporbirthday';

export function useKosporBirthdayEvent() {
  const { event, isLive, loading, refresh } = useEvents();

  return useMemo(() => {
    // On ne répond vrai que pour CET événement : sinon l'anniversaire de
    // twitninf allumerait l'onglet Kospor, et les deux fêtes se
    // superposeraient dans la barre du bas.
    const isEventActive = isLive && event?.slug === LEGACY_SLUG;

    return {
      isEventActive,
      isLoading: loading,
      events: isEventActive && event ? [event] : [],
      refreshEvent: () => refresh(true),
    };
  }, [event, isLive, loading, refresh]);
}

export default useKosporBirthdayEvent;
