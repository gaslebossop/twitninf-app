"""Incremente buildVersion et rafraichit taille/date dans apps.json du gist
AltStore, apres qu'un nouvel IPA y a ete copie en TwitNinf.ipa.

buildVersion est le seul champ qu'AltStore compare pour detecter une
nouvelle version disponible ; il doit strictement augmenter a chaque
publication. "version" reste un simple libelle humain, laisse tel quel.

Usage: python3 update_gist.py <chemin_vers_gist-repo> <chemin_vers_ipa>
"""
import datetime
import json
import os
import sys

gist_dir, ipa_path = sys.argv[1], sys.argv[2]
apps_json_path = os.path.join(gist_dir, "apps.json")

with open(apps_json_path) as f:
    data = json.load(f)

version = data["apps"][0]["versions"][0]
version["buildVersion"] = str(int(version["buildVersion"]) + 1)
version["date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
version["size"] = os.path.getsize(ipa_path)

with open(apps_json_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print(f"buildVersion -> {version['buildVersion']}")
