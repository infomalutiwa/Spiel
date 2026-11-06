# Talwacht – Asset-Auswahl

Alle Quellen CC0.

| Kategorie | Quelle | Datei/Ort |
|---|---|---|
| Burg (Mauern, Tore, Türme) | **prozedurales Baukasten-System** (`talwacht/client/src/render/castlekit.ts`) – Mauerstücke aus Mittelpfosten + Armen je Nachbar, dadurch keine Dreh-/Pivot-Fehler; gleiche Wehrganghöhe für Mauer, Turm, Tor | Code |
| Belagerungsgeräte, Ballista, Katapult | Kenney Castle Kit 2.0 `siege-*` | `client/public/assets/models` |
| Häuser, Wirtschaft, Militärgebäude | KayKit Medieval Hexagon `building_*_blue` | `client/public/assets/hex` |
| Bäume, Felsen, Felder | Kenney Nature Kit, KayKit hex | `client/public/assets/models`, `hex` |
| Eigene Truppen | KayKit Adventurers (gebacken): knight, spearman, archer, crossbowman, cavalry, healer, **engineer**, **halberdier** | `client/public/assets/units` |
| Gegner (menschlich) | KayKit Adventurers (gebacken): **e_raider** (Barbar, Axt), **e_soldier** (Ritter, Rundschild), **e_shield** (Ritter, Rechteckschild – Schildkröte), **e_pioneer** (Schurke, Messer), **e_warlord** (Ritter, Zweihänder); Armbrust/Reiter = crossbowman/cavalry in Gegnerfarben | dito |
| Ram, Belagerungsturm, Leiter, Pavese, Schildkrötenschilde, Fallen | prozedural im Client, gleiche Palette | Code |

Bake: `KAYKIT_DIR=<dir mit geklontem KayKit-Character-Pack-Adventures-1.0> node tools/bake/run.mjs e_raider e_soldier e_shield e_pioneer e_warlord engineer halberdier`
