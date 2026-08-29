#!/bin/sh
# Recoit l'APK publie par la CI, met le catalogue G-Store a jour, previent les
# appareils. Et rien d'autre.
#
# Deploye sur le VPS en /home/debian/bin/receive-apk.sh, force dans
# authorized_keys pour la cle de la CI Android :
#
#   command="/home/debian/bin/receive-apk.sh",restrict ssh-ed25519 AAAA...
#
# La cle ne peut donc ouvrir aucun shell ni ecrire ailleurs — c'est ce qui
# permet de mettre sa moitie privee dans les secrets d'un depot PUBLIC.
#
# Protocole : l'APK arrive sur stdin, les metadonnees dans la commande SSH.
#   ssh -i cle host "<package> <versionCode> <versionName> [notes...]" < app.apk
#
# La cle FCM ne quitte jamais ce serveur (voir gstore-push.sh).
set -eu

DIR=/home/debian/api/src/public/gstore
BASE_URL=https://api.twitninf.fr/static/gstore

# Liste blanche : la cle de la CI ne doit pas pouvoir publier n'importe quel
# paquet dans le catalogue, meme si le depot qui la porte est compromis.
ALLOWED="com.gasleboss.TwitNin com.gstore"

set -- ${SSH_ORIGINAL_COMMAND:-}
PACKAGE=${1:-}
VERSION_CODE=${2:-}
VERSION_NAME=${3:-}
shift 3 2>/dev/null || true
NOTES=${*:-}

case " $ALLOWED " in
  *" $PACKAGE "*) ;;
  *) echo "Paquet refuse : '$PACKAGE'" >&2; exit 1 ;;
esac

echo "$VERSION_CODE" | grep -qE '^[0-9]+$' || { echo "versionCode invalide : '$VERSION_CODE'" >&2; exit 1; }

mkdir -p "$DIR"
TMP="$DIR/.$PACKAGE.part"
cat > "$TMP"

# Un transfert coupe donnerait un APK tronque, qu'Android refuse a
# l'installation sans rien expliquer d'utile. Mieux vaut garder la version
# precedente et faire echouer le job.
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 2000000 ]; then
  rm -f "$TMP"
  echo "APK refuse : $SIZE octets, transfert probablement coupe" >&2
  exit 1
fi

# Un numero qui n'avance pas produit un catalogue qui a l'air a jour alors
# qu'aucun telephone ne bougera : Android ignore une version dont le
# versionCode n'est pas superieur.
CURRENT=$(python3 - "$DIR/catalog.json" "$PACKAGE" <<'PY'
import json, sys
try:
    catalog = json.load(open(sys.argv[1], encoding="utf-8"))
    print(next((a.get("versionCode", 0) for a in catalog.get("apps", []) if a["packageName"] == sys.argv[2]), 0))
except Exception:
    print(0)
PY
)
if [ "$VERSION_CODE" -le "$CURRENT" ]; then
  rm -f "$TMP"
  echo "versionCode $VERSION_CODE deja publie (catalogue : $CURRENT)" >&2
  exit 1
fi

SHA=$(sha256sum "$TMP" | cut -d' ' -f1)
APK="$DIR/$PACKAGE-$VERSION_CODE.apk"
chmod 644 "$TMP"
mv -f "$TMP" "$APK"
# Nom stable, cible du bouton de la page d'installation.
cp -f "$APK" "$DIR/$PACKAGE-latest.apk"

python3 - "$DIR/catalog.json" "$PACKAGE" "$VERSION_CODE" "$VERSION_NAME" "$SIZE" "$SHA" "$BASE_URL/$PACKAGE-$VERSION_CODE.apk" "$NOTES" <<'PY'
import datetime, json, sys

path, package, code, name, size, sha, url, notes = sys.argv[1:9]
try:
    catalog = json.load(open(path, encoding="utf-8"))
except Exception:
    catalog = {"apps": []}

apps = catalog.get("apps", [])
entry = next((a for a in apps if a.get("packageName") == package), None)
if entry is None:
    # Une app inconnue du catalogue n'a pas de fiche editoriale : on la cree
    # minimale plutot que d'echouer, elle sera completee a la main.
    entry = {"packageName": package, "name": package, "tagline": "", "description": ""}
    apps.append(entry)

entry.update({
    "versionCode": int(code),
    "versionName": name,
    "sizeBytes": int(size),
    "sha256": sha,
    "apkUrl": url,
    # Toujours reecrite, meme vide : sinon la note de la version precedente
    # suit la nouvelle et s'affiche dans la notification des utilisateurs.
    "whatsNew": notes,
})

catalog["apps"] = apps
catalog["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
json.dump(catalog, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY

echo "APK_SIZE=$SIZE"
echo "APK_SHA256=$SHA"
echo "APK_URL=$BASE_URL/$PACKAGE-$VERSION_CODE.apk"

# Le push est un bonus : une panne d'annonce ne doit pas faire echouer une
# publication qui, elle, a reussi. Les appareils verront la version a leur
# prochaine verification horaire.
/home/debian/bin/gstore-push.sh "$PACKAGE" "$VERSION_NAME" "$VERSION_CODE" "$NOTES" || echo "push non envoye (non bloquant)" >&2
