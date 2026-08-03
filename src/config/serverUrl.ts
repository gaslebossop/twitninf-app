export interface ResolvedServerUrl {
  url: string;
  configured: boolean;
}

/**
 * Valide une adresse serveur publique sans empêcher l'interface de démarrer
 * quand le développeur n'a pas encore créé son fichier `.env`.
 *
 * Une adresse absente pointe vers un domaine réservé et non routable : les
 * écrans publics restent accessibles, mais aucune requête ne peut partir par
 * erreur vers un service réel. Une valeur fournie mais dangereuse reste une
 * erreur de configuration explicite.
 */
export function resolveServerUrl(
  rawValue: string | undefined,
  variableName: string,
  fallbackUrl: string,
  warn: (message: string) => void = console.warn,
): ResolvedServerUrl {
  const value = rawValue?.trim();

  if (!value) {
    warn(
      `${variableName} manquant : mode hors ligne utilisé. ` +
        'Créer un fichier .env à la racine pour connecter les services.',
    );
    return { url: fallbackUrl, configured: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} doit être une URL absolue valide.`);
  }

  const isLocalDevelopment = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error(`${variableName} doit utiliser HTTPS hors développement local.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${variableName} ne doit pas contenir d’identifiants.`);
  }

  return { url: value.replace(/\/+$/, ''), configured: true };
}
