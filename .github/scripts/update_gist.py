"""Fixe buildVersion, taille, date et URL de telechargement dans apps.json,
le flux AltStore servi par le gist.

buildVersion est le seul champ qu'AltStore compare pour detecter une
nouvelle version disponible ; il doit strictement augmenter a chaque
publication. "version" reste un simple libelle humain, laisse tel quel.

Le numero est DONNE par l'appelant et non calcule ici. La raison : l'app
elle-meme doit connaitre, au moment du bundling JS, le numero qu'elle
portera une fois publiee — c'est ce qui lui permet de comparer son propre
build a celui du gist et d'annoncer une mise a jour (voir
src/services/updateCheck.ts). Le workflow lit donc le gist AVANT de builder,
calcule le prochain numero, l'injecte dans le bundle, puis le repasse ici
pour que les deux valeurs coincident exactement.

La taille aussi vient de l'appelant : l'IPA n'est plus copie a cote
d'apps.json, il est depose sur le VPS, et c'est le serveur qui renvoie le
nombre d'octets reellement ecrits (voir receive-ipa.sh). Mesurer le fichier
local dirait ce qu'on croit avoir envoye, pas ce qui est servi.

Usage: python3 update_gist.py <apps.json> <build_version> <taille> [url]
"""
import datetime
import json
import sys

apps_json_path, build_version, size = sys.argv[1], sys.argv[2], sys.argv[3]
download_url = sys.argv[4] if len(sys.argv) > 4 else None

with open(apps_json_path) as f:
    data = json.load(f)

version = data["apps"][0]["versions"][0]
previous = int(version["buildVersion"])

# Garde-fou : un numero qui stagne ou recule laisserait AltStore croire que
# rien n'a change, et les apps installees se croiraient a jour indefiniment.
# C'est aussi ce qui rattrape deux publications concurrentes : la seconde
# echoue ici plutot que d'ecraser la premiere.
if int(build_version) <= previous:
    sys.exit(
        f"buildVersion doit augmenter : {build_version} <= {previous} deja publie."
    )

version["buildVersion"] = str(int(build_version))
version["date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
version["size"] = int(size)
if download_url:
    version["downloadURL"] = download_url

with open(apps_json_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print(f"buildVersion {previous} -> {version['buildVersion']} ({version['size']} octets)")
