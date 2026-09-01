import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_CONFIG } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services';
import NewEconomyService from '../services/newEconomyService';
import { subscriptionPricingService } from '../services/subscriptionPricingService';
import {
  buildSubscriptionViewState,
  type SubscriptionViewState,
} from '../services/subscriptionViewState';
import { colors, isDarkTheme } from '../theme';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { toast } from '../components/ui/Toast';

/**
 * L'écran d'abonnement — une page servie par l'API, dans une `WebView`.
 *
 * ── Pourquoi une page ──
 * L'offre bouge souvent : un palier gagne un avantage, un plafond change, une
 * phrase se reformule. En natif, chacune de ces retouches demande un build et
 * une publication dans un magasin. Servie par l'API, la même retouche part
 * avec le serveur. C'est le même raisonnement que la Carte NF, pour une raison
 * différente : là-bas c'était une contrainte native, ici c'est la cadence.
 *
 * ── Ce que la page ne peut pas faire ──
 * Elle ne porte AUCUN jeton et n'appelle personne (sa CSP a `connect-src
 * 'none'`). Elle affiche ce que cet écran lui pousse, et quand on appuie sur
 * « Passer à Ultra » elle ne fait que le DEMANDER : la confirmation est
 * native, la transaction part d'ici avec le jeton de l'app. Une WebView ne
 * doit pas pouvoir débiter un compte — c'est de l'argent réel, et les règles
 * des magasins l'exigent aussi.
 *
 * ── Ce qui, dans une WebView, trahirait une page web ──
 * Le rebond élastique de fin de geste, la sélection de texte à l'appui long,
 * le flash blanc avant le premier rendu, et les barres de défilement. Les
 * quatre sont neutralisés ici et dans la page. Le défilement, lui, reste actif
 * — contrairement à la carte : une page d'abonnement se fait défiler, et
 * c'est le REBOND qui trahit, pas le défilement.
 */

type Props = { navigation: any };

const VIEW_URL = `${API_CONFIG.BASE_URL}/api/subscription/view`;

export default function SubscriptionScreen({ navigation }: Props) {
  const { user, refreshCurrentUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView | null>(null);
  const [busy, setBusy] = useState(false);
  /** Vrai dès que la page a dit « prête » : avant, pousser ne sert à rien. */
  const readyRef = useRef(false);
  /**
   * Le dernier état poussé. Une ref et non un `useState` : il ne déclenche
   * aucun rendu — l'écran est une WebView, il n'affiche rien lui-même — et la
   * confirmation du mandat a besoin du prix qui vient d'en être calculé.
   */
  const stateRef = useRef<SubscriptionViewState | null>(null);

  /**
   * Assemble l'état et l'envoie à la page.
   *
   * `injectJavaScript` plutôt que `postMessage` : sur Android, `postMessage`
   * vers une WebView demande un `origin` que la page ne peut pas vérifier, et
   * un écouteur `message` global accepterait n'importe quelle iframe. Une
   * fonction nommée n'est appelable que par l'hôte natif.
   */
  const push = useCallback(async () => {
    try {
      const [pricing, wallet, mandate] = await Promise.all([
        subscriptionPricingService.get(),
        NewEconomyService.getNfWallet().catch(() => null),
        // Le mandat est facultatif : une base où la migration n'a pas encore
        // été jouée répond 503, et la page doit s'afficher quand même — sans
        // l'interrupteur, mais entière.
        //
        // L'échec est JOURNALISÉ, pas avalé. Une première version se contentait
        // d'un `.catch(() => null)` muet : une erreur SQL côté serveur faisait
        // disparaître l'interrupteur sans le moindre signe, et rien, ni dans
        // l'app ni à l'écran, ne distinguait « pas encore disponible » de
        // « cassé ». Un repli silencieux sur une fonctionnalité absente est
        // exactement le genre de panne qu'on ne trouve qu'en la cherchant.
        apiService
          .request('/api/users/subscription-mandate', { requiresAuth: true })
          .then((r: any) => r?.data || null)
          .catch((error: any) => {
            console.warn('[abonnement] mandat illisible :', error?.message || error);
            return null;
          }),
      ]);
      const state: SubscriptionViewState = stateRef.current = buildSubscriptionViewState({
        tier: effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier),
        expiresAt: user?.subscription_expires_at,
        balanceNf: Number(wallet?.wallet?.balance || 0),
        pricing,
        mandate,
        theme: isDarkTheme() ? 'dark' : 'light',
        insets: { top: insets.top, bottom: insets.bottom },
      });
      // `JSON.stringify` deux fois : une pour l'état, une pour l'échapper dans
      // le source injecté. Sans la seconde, une apostrophe dans un libellé
      // casserait le script.
      webRef.current?.injectJavaScript(
        `window.__twitninfPush && window.__twitninfPush(${JSON.stringify(JSON.stringify(state))}); true;`,
      );
    } catch (error: any) {
      toast.error('Offre indisponible', {
        description: error?.message || 'Réessaie dans quelques instants.',
      });
    }
  }, [user, insets.top, insets.bottom]);

  // Le solde et le palier peuvent changer pendant qu'on regarde la page
  // (un achat ailleurs, un abonnement qui expire) : on repousse à chaque
  // changement d'utilisateur.
  useEffect(() => {
    if (readyRef.current) void push();
  }, [push]);

  /**
   * L'achat. Confirmation NATIVE, puis transaction avec le jeton de l'app.
   *
   * Le contrôle du montant est refait ici : la page a beau afficher un prix,
   * c'est cet écran qui l'a poussé, et c'est le serveur qui facturera. On ne
   * fait donc que demander confirmation sur ce qu'on s'apprête à débiter.
   */
  const purchase = useCallback(
    async (tier: 'plus' | 'pro' | 'ultra') => {
      if (busy) return;
      const label = tier === 'plus' ? 'Plus' : tier === 'pro' ? 'Pro' : 'Ultra';
      const ok = await confirmAsync({
        title: `Passer à ${label} ?`,
        message:
          tier === 'ultra'
            ? 'Le montant sera débité de ton portefeuille NF. La reconduction automatique reste à activer si tu la veux.'
            : 'Le montant sera débité de ton portefeuille NF, au cours du moment. La reconduction automatique reste à activer si tu la veux.',
        confirmLabel: `Passer à ${label}`,
        icon: 'diamond',
      });
      if (!ok) return;

      setBusy(true);
      try {
        // Ultra a son propre point d'entrée : prix fixe en NF, pas de `{ tier }`
        // à passer (contrairement à Plus/Pro, tarifiés en euros convertis).
        const result =
          tier === 'ultra'
            ? await apiService.request('/api/users/purchase-ultra', {
                method: 'POST',
                requiresAuth: true,
              })
            : await apiService.request('/api/users/purchase-subscription', {
                method: 'POST',
                requiresAuth: true,
                body: { tier },
              });

        const data = result?.data;
        // On ne se fie pas au seul `success` : un paiement non confirmé ou un
        // palier différent de celui demandé doit échouer bruyamment, pas
        // laisser croire que c'est acheté.
        if (
          result?.success !== true ||
          data?.payment_confirmed !== true ||
          !data?.transaction_id ||
          data?.subscription_tier !== tier
        ) {
          throw new Error(result?.message || 'Le paiement NF n’a pas été confirmé.');
        }

        await refreshCurrentUser();

        // Le crédit publicitaire Ultra est annoncé à la vente et versé pour de
        // bon : on le dit, avec le montant réellement crédité.
        const adCredit = Number(data?.ad_credit_granted) || 0;
        if (tier === 'ultra' && adCredit > 0) {
          const eur = data?.ad_credit_eur_equivalent;
          toast.reward('Crédit publicitaire versé', {
            description: `${adCredit} NF${eur ? ` (${eur} €)` : ''} ajoutés à ton portefeuille.`,
          });
        } else {
          toast.success(`${label} est actif`, {
            description: 'Tous les avantages sont disponibles immédiatement.',
          });
        }

        // La page doit voir le nouvel état : sans ce renvoi, elle continuerait
        // d'afficher l'ancien palier et proposerait d'acheter ce qu'on vient
        // de payer.
        await push();
      } catch (error: any) {
        toast.error('Achat impossible', {
          description: error?.message || 'Réessaie dans quelques instants.',
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshCurrentUser, push],
  );

  /**
   * Le renouvellement automatique.
   *
   * Même règle que l'achat : la page DEMANDE, l'app confirme et exécute avec
   * son jeton. La différence est qu'ici rien n'est débité tout de suite — on
   * engage le compte pour les échéances À VENIR, ce que la confirmation doit
   * dire clairement, montant et périodicité compris.
   */
  const setMandate = useCallback(
    async (enabled: boolean) => {
      if (busy) return;

      const price = stateRef.current?.mandate?.priceNf;
      const every = stateRef.current?.plans?.[0]?.durationDays ?? 5;
      const ok = await confirmAsync(
        enabled
          ? {
              title: 'Activer le renouvellement ?',
              message:
                `Ton abonnement se reconduira tout seul${price ? ` pour ${price} NF` : ''} ` +
                `tous les ${every} jours, prélevés sur ton portefeuille NF. ` +
                'Tu peux le désactiver quand tu veux.',
              confirmLabel: 'Activer',
              icon: 'refresh',
            }
          : {
              title: 'Désactiver le renouvellement ?',
              message:
                'Ton abonnement ira au bout de la période déjà payée, puis s’arrêtera. ' +
                'Rien ne sera prélevé d’ici là.',
              confirmLabel: 'Désactiver',
              icon: 'close-circle',
              destructive: true,
            },
      );
      if (!ok) return;

      setBusy(true);
      try {
        const result = await apiService.request('/api/users/subscription-mandate', {
          method: enabled ? 'POST' : 'DELETE',
          requiresAuth: true,
        });
        if (result?.success !== true) {
          throw new Error(result?.message || 'Opération refusée.');
        }
        toast.success(
          enabled ? 'Renouvellement activé' : 'Renouvellement désactivé',
          { description: result?.message },
        );
        // La bascule change `subscription_expires_at` en base (NULL à
        // l'activation, la date de fin au retrait) : sans ce rafraîchissement,
        // tout le reste de l'app garderait l'ancienne valeur.
        await refreshCurrentUser?.();
        await push();
      } catch (error: any) {
        toast.error('Opération impossible', {
          description: error?.message || 'Réessaie dans quelques instants.',
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshCurrentUser, push],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: any;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      switch (message?.type) {
        case 'ready':
          // Une WebView peut être rechargée par le système sous pression
          // mémoire : la page redemande alors son état, et le redemander est
          // le seul signal fiable qu'elle est vivante.
          readyRef.current = true;
          void push();
          return;
        case 'purchase':
          if (message.tier === 'plus' || message.tier === 'pro' || message.tier === 'ultra') {
            void purchase(message.tier);
          }
          return;
        case 'set-mandate':
          if (typeof message.enabled === 'boolean') {
            void setMandate(message.enabled);
          }
          return;
        case 'close':
          navigation.goBack();
          return;
        default:
      }
    },
    [push, purchase, setMandate, navigation],
  );

  /**
   * Rien ne doit pouvoir naviguer hors de cette page. Elle n'a aucun lien,
   * mais un jour quelqu'un en ajoutera un : la règle est écrite maintenant.
   */
  const handleNavigation = useCallback(
    (request: { url: string }) => request.url.startsWith(VIEW_URL),
    [],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <WebView
        ref={webRef}
        source={{ uri: VIEW_URL }}
        // La page pose son propre fond, mais trop tard : le compositeur natif
        // peint le sien AVANT d'avoir lu la moindre ligne de CSS, et il est
        // blanc par défaut. C'est le flash qui trahit une WebView.
        style={[styles.web, { backgroundColor: colors.bg }]}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavigation}
        // ── Tout ce qui suit efface la « page web » ──
        // Le rebond élastique de fin de geste est la signature nº1 d'une
        // WebView : aucun écran natif ne rebondit.
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // L'aperçu de lien au appui long (iOS) n'a aucun sens ici.
        allowsLinkPreview={false}
        // Pas d'indicateur de chargement : la page se dévoile d'elle-même une
        // fois sa palette reçue (voir l'opacité dans la page).
        startInLoadingState={false}
        // Rien ne doit pouvoir ouvrir une seconde vue par-dessus.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        // Le bundle est derrière des URLs hachées, donc immuables : le cache
        // de la plateforme évite de le retélécharger à chaque ouverture.
        cacheEnabled
        // Une page d'abonnement ne se met jamais à l'échelle du texte système :
        // la mise en page se retrouverait à une taille qui n'est plus la sienne.
        textZoom={100}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        // Le contenu vient de notre API et de nulle part ailleurs.
        originWhitelist={[API_CONFIG.BASE_URL]}
        mixedContentMode="never"
        {...(Platform.OS === 'ios' ? { allowsBackForwardNavigationGestures: false } : null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  web: { flex: 1 },
});
