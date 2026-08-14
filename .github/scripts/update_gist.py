"""Fixe buildVersion et rafraichit taille/date dans apps.json du gist
AltStore, apres qu'un nouvel IPA y a ete copie en TwitNinf.ipa.

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

Usage: python3 update_gist.py <chemin_vers_gist-repo> <chemin_vers_ipa> <build_version>
"""
import datetime
import json
import os
import sys

gist_dir, ipa_path, build_version = sys.argv[1], sys.argv[2], sys.argv[3]
apps_json_path = os.path.join(gist_dir, "apps.json")

with open(apps_json_path) as f:
    data = json.load(f)

version = data["apps"][0]["versions"][0]
previous = int(version["buildVersion"])

# Garde-fou : un numero qui stagne ou recule laisserait AltStore croire que
# rien n'a change, et les apps installees se croiraient a jour indefiniment.
if int(build_version) <= previous:
    sys.exit(
        f"buildVersion doit augmenter : {build_version} <= {previous} deja publie."
    )

version["buildVersion"] = str(int(build_version))
version["date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
version["size"] = os.path.getsize(ipa_path)

with open(apps_json_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print(f"buildVersion {previous} -> {version['buildVersion']}")
