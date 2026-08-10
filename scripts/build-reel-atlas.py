"""Génère la texture d'un rouleau de machine à sous.

Pourquoi un script et pas une image posée à la main : la bande doit rester
alignée sur la table des gains du serveur (`api/src/services/casinoService.js`).
Si un symbole y est ajouté ou repondéré, on relance ce script — l'image et le
code du rouleau restent cohérents avec le serveur, qui reste seul juge du
résultat.

    python scripts/build-reel-atlas.py

Sorties, dans assets/casino/ :
  reel-strip.png       la bande nette (256 × 4096, 16 cases)
  reel-strip-blur.png  la même, filée verticalement

Le flou est CUIT dans une seconde image plutôt que calculé à l'écran : un vrai
flou de mouvement demande une passe de post-traitement, hors de portée du
budget d'un téléphone pour un élément de cette taille. Le tambour affiche la
version nette et la version filée l'une sur l'autre, et fait monter l'opacité
de la seconde avec la vitesse — au-delà de deux tours par seconde, l'œil ne
distingue plus les deux approches.

La hauteur est une puissance de deux : c'est la condition pour que la texture
puisse se répéter sur le pourtour du tambour.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CELL = 256
# 16 cases, réparties à l'image des poids du serveur : la cerise revient
# souvent, le sept est unique. Un rouleau où les six symboles se suivent à
# intervalle régulier se lit comme un jouet — une vraie machine répète les
# symboles faibles.
STRIP = [
    "cherry", "lemon", "cherry", "bell",
    "star", "cherry", "lemon", "diamond",
    "cherry", "bell", "lemon", "star",
    "cherry", "lemon", "bell", "seven",
]
EMOJI = {
    "cherry": "\U0001F352",
    "lemon": "\U0001F34B",
    "bell": "\U0001F514",
    "star": "\u2B50",
    "diamond": "\U0001F48E",
    "seven": "7\ufe0f\u20e3",
}

FACE = (244, 241, 234, 255)      # ivoire : un tambour, pas une feuille blanche
GROOVE = (198, 190, 176, 255)    # rainure entre deux cases
FONT_PATH = r"C:\Windows\Fonts\seguiemj.ttf"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "casino" / "reel-strip.png"
OUT_BLUR = ROOT / "assets" / "casino" / "reel-strip-blur.png"
# Longueur de la traînée, en fraction de case.
BLUR_SPAN = 0.9


def motion_blur(img: Image.Image) -> Image.Image:
    """Filé vertical, en boucle sur la bande.

    La moyenne se fait sur un décalage circulaire : la bande est un anneau, et
    un flou qui s'arrêterait aux bords laisserait une couture visible à chaque
    tour, exactement à l'endroit que l'œil suit.
    """
    span = max(2, round(CELL * BLUR_SPAN))
    acc = Image.new("RGBA", img.size)
    base = None
    for step in range(span):
        offset = step - span // 2
        shifted = Image.new("RGBA", img.size)
        shifted.paste(img, (0, -offset))
        shifted.paste(img, (0, img.height - offset))
        shifted.paste(img, (0, -offset - img.height))
        base = shifted if base is None else Image.blend(base, shifted, 1 / (step + 1))
    acc = base if base is not None else img
    return acc


def main() -> None:
    img = Image.new("RGBA", (CELL, CELL * len(STRIP)), FACE)
    draw = ImageDraw.Draw(img)
    # Segoe UI Emoji n'est net qu'à 109 px (bitmaps CBDT) : on rend à cette
    # taille puis on agrandit, plutôt que de demander une taille arbitraire
    # que la police approximerait.
    font = ImageFont.truetype(FONT_PATH, 109)

    for index, name in enumerate(STRIP):
        top = index * CELL
        draw.line([(0, top), (CELL, top)], fill=GROOVE, width=3)

        glyph = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text(
            (CELL // 2, CELL // 2), EMOJI[name],
            font=font, anchor="mm", embedded_color=True,
        )
        bbox = glyph.getbbox()
        if bbox is None:
            raise SystemExit(f"symbole non rendu : {name}")
        # Recadrage puis mise à l'échelle : les emoji n'ont pas tous la même
        # emprise, et sans ça la cerise paraît deux fois plus petite que le
        # diamant sur le rouleau.
        glyph = glyph.crop(bbox)
        scale = (CELL * 0.62) / max(glyph.size)
        glyph = glyph.resize(
            (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))),
            Image.LANCZOS,
        )
        img.alpha_composite(
            glyph,
            ((CELL - glyph.width) // 2, top + (CELL - glyph.height) // 2),
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    blurred = motion_blur(img)
    blurred.save(OUT_BLUR)
    print(f"{OUT.relative_to(ROOT)} — {img.width}x{img.height}, {len(STRIP)} cases")
    print(f"{OUT_BLUR.relative_to(ROOT)} — file sur {round(CELL * BLUR_SPAN)} px")
    print("bande :", ", ".join(STRIP))


if __name__ == "__main__":
    main()
