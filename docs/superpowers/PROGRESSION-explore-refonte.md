# Refonte Explorer — progression

Plan : docs/superpowers/plans/2026-08-18-explore-refonte.md
Branche : explore-refonte
Base : 92bcc09

Task 0 : REPORTÉE — exige un appareil physique, arbitré avec l utilisateur le 2026-08-18.
Task 9 : REPORTÉE pour la même raison.

Task 1 : complete (commits 27f346b..1bad0f5, revue propre — spec OK, qualite approuvee)
  Mineurs a reporter en revue finale :
   - hashId(id: string | number) accepte plus large que Tweet.id (toujours string)
   - quoteType renvoie fontSize/lineHeight/lines non utilises par estimatedHeightOf
     (destines au rendu des taches suivantes) — merite un mot de commentaire
   - magic numbers 0.52 / 56 / 8 / 26 / MEDIA_RATIOS non justifies individuellement
  Reporte a la Task 6 : verifier que estimatedHeightOf est bien la SEULE source
  de verite de hauteur (rendu + equilibrage), non verifiable a la Task 1.
Task 2 : complete (commits 1bad0f5..51dbbd1, revue propre — spec OK, qualite approuvee)
  Mineurs a reporter en revue finale :
   - splitColumns est un glouton sans tri prealable (pas LPT/best-fit) : ecart
     possiblement plus grand sur un bloc tres heterogene. Conforme au brief.
   - seuil 200 en dur dans le test d equilibrage, origine non commentee
  Reporte a la Task 6 : l ordre de rendu (rupture AVANT les colonnes) n est
  garanti ici que par la structure de donnees — a verifier dans le consommateur.
Task 3 : complete (commits 51dbbd1..9921ffb, 1 tour de correctif, re-revue approuvee)
  CRITIQUE corrige : measureInWindow lu avant son callback async -> CardRect
    valait toujours null. Ref ecrit par le callback, lu 260 ms plus tard ;
    le timer d ouverture reste cree de facon synchrone (sinon le double-tap
    n aurait rien a annuler).
  IMPORTANT corrige : GestureDetector imbrique supprime — Tappable expose deja
    onLongPress et compose Gesture.Exclusive(long, tap). Plus aucun worklet
    dans le fichier.
  MINEUR corrige : withAlpha(colors.black, 0.55).
  DECISION ASSUMEE : le delai d appui long passe de 350 ms a 500 ms (defaut
    RNGH, Tappable ne fixe pas minDuration). 500 ms est la valeur standard iOS
    et Android ; 350 etait arbitraire. A verifier au toucher en Task 9.
  Ecarts arbitres : borderCurve retire (absent des types RN 0.81.5),
    displayNameFonts importe hors barrel (precedent existant).
Task 4 : implementee + correctif applique (commits 9921ffb..75f3d5c)
  ⚠️ LE CORRECTIF N A PAS ETE RE-RELU (session interrompue faute de budget).
  CRITIQUE corrige : les courbes de theme/motion.ts ne passent PAS dans
    Reanimated (assertEasingIsWorklet). Utiliser src/utils/gesture.ts.
  IMPORTANT corrige : index borne sur slides, cancelAnimation de fade+drift.
  Corriges pendant l implementation : handlePress lisait measureInWindow avant
    son callback ; zone morte temporelle sur `tap` -> `handlePress`.
Task 5 a 8 : NON COMMENCEES. Le plan est a jour et corrige d avance.
