#!/bin/sh
# Annonce une nouvelle version aux appareils, via Firebase Cloud Messaging.
#
# Deploye sur le VPS en /home/debian/bin/gstore-push.sh. Appele par
# receive-apk.sh apres une publication reussie.
#
# ── Pourquoi openssl et pas la bibliotheque google-auth ──────────────────────
# Le VPS n'a pas google-auth, et Debian 13 refuse un `pip install` global
# (PEP 668). Plutot que d'y poser un venv a maintenir, on signe le JWT
# directement : c'est vingt lignes, aucune dependance, et rien a mettre a jour.
#
# La cle de compte de service reste SUR LE SERVEUR
# (/home/debian/.config/gstore-fcm.json, chmod 600) : elle ne transite jamais
# par les secrets d'un depot public.
#
# Usage : gstore-push.sh <packageName> <versionName> <versionCode> [notes]
set -eu

KEY=/home/debian/.config/gstore-fcm.json
TOPIC=gstore-updates

[ -r "$KEY" ] || { echo "push ignore : $KEY absent" >&2; exit 0; }

PACKAGE=${1:?package attendu}
VERSION_NAME=${2:-}
VERSION_CODE=${3:-0}
NOTES=${4:-}

PROJECT=$(python3 -c "import json;print(json.load(open('$KEY'))['project_id'])")
EMAIL=$(python3 -c "import json;print(json.load(open('$KEY'))['client_email'])")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
python3 -c "import json;open('$TMP/key.pem','w').write(json.load(open('$KEY'))['private_key'])"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

NOW=$(date +%s)
EXP=$((NOW + 3600))

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
CLAIM=$(printf '{"iss":"%s","scope":"https://www.googleapis.com/auth/firebase.messaging","aud":"https://oauth2.googleapis.com/token","exp":%s,"iat":%s}' \
  "$EMAIL" "$EXP" "$NOW" | b64url)

SIGNATURE=$(printf '%s.%s' "$HEADER" "$CLAIM" \
  | openssl dgst -sha256 -sign "$TMP/key.pem" -binary | b64url)

ACCESS_TOKEN=$(curl -s --max-time 20 -X POST https://oauth2.googleapis.com/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer \
  --data-urlencode "assertion=$HEADER.$CLAIM.$SIGNATURE" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))")

[ -n "$ACCESS_TOKEN" ] || { echo "push : jeton OAuth2 refuse" >&2; exit 1; }

# Charge de DONNEES uniquement : c'est le store qui decide ensuite d'installer
# ou de notifier. Une notification poussee telle quelle s'afficherait aussi sur
# les telephones qui ont deja la version.
BODY=$(PACKAGE="$PACKAGE" VERSION_NAME="$VERSION_NAME" VERSION_CODE="$VERSION_CODE" NOTES="$NOTES" TOPIC="$TOPIC" python3 -c '
import json, os
print(json.dumps({"message": {
    "topic": os.environ["TOPIC"],
    "data": {
        "packageName": os.environ["PACKAGE"],
        "versionName": os.environ["VERSION_NAME"],
        "versionCode": os.environ["VERSION_CODE"],
        "whatsNew": os.environ["NOTES"],
    },
    "android": {"priority": "HIGH"},
}}))')

CODE=$(curl -s -o "$TMP/out" -w '%{http_code}' --max-time 20 \
  -X POST "https://fcm.googleapis.com/v1/projects/$PROJECT/messages:send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BODY")

if [ "$CODE" -ge 300 ]; then
  echo "push refuse ($CODE) : $(head -c 200 "$TMP/out")" >&2
  exit 1
fi

echo "PUSH_SENT=$TOPIC"
