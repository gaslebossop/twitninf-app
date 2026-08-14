#!/bin/sh
# Recoit l'IPA publie par la CI, et rien d'autre.
#
# Deploye sur le VPS en /home/debian/bin/receive-ipa.sh. C'est une commande
# FORCEE dans authorized_keys pour la cle de la CI :
#
#   command="/home/debian/bin/receive-ipa.sh",restrict ssh-ed25519 AAAA...
#
# La cle ne peut donc ouvrir aucun shell, ne peut rien lire, ne peut ecrire
# nulle part ailleurs — elle ne sait faire que ceci. C'est ce qui permet de
# mettre sa moitie privee dans les secrets d'un depot PUBLIC sans exposer le
# serveur : au pire, quelqu'un remplace un IPA de test.
#
# La destination est lue sur le serveur, pas ecrite ici : le chemin comporte un
# segment aleatoire qui tient lieu de discretion pour la source AltStore, et ce
# fichier-ci est versionne dans un depot public.
set -eu

DEST_FILE=/home/debian/.config/twitninf-altstore-dest
if [ ! -r "$DEST_FILE" ]; then
  echo "Destination non configuree ($DEST_FILE absent)" >&2
  exit 1
fi
DEST=$(cat "$DEST_FILE")
TMP="$DEST.part"

mkdir -p "$(dirname "$DEST")"
cat > "$TMP"

# Un transfert coupe donnerait un IPA tronque, qu'AltStore refuse sans rien
# expliquer. Mieux vaut garder la version precedente et faire echouer le job.
size=$(stat -c%s "$TMP")
if [ "$size" -lt 5000000 ]; then
  echo "IPA refuse : $size octets, transfert probablement coupe" >&2
  exit 1
fi

chmod 644 "$TMP"
mv -f "$TMP" "$DEST"

# Le job lit cette taille pour la reporter dans apps.json : AltStore l'affiche
# avant le telechargement, et un chiffre faux se voit.
echo "IPA_SIZE=$size"
