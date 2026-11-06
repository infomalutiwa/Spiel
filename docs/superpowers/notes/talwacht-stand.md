# Talwacht – Arbeitsstand (Merkzettel)

Branch `claude/zen-bohr-7vfye7`, letzter Commit siehe `git log`. Spec: `docs/superpowers/specs/2026-11-06-talwacht-design.md`, Plan: `docs/superpowers/plans/2026-11-06-talwacht.md`, Ledger (lokal, git-ignoriert): `.superpowers/sdd/2026-11-06-talwacht/progress.md`.

## Fertig
- Plan-Tasks 0–20: Simulation (Bauen, Wirtschaft, Flussfeld-Wegfindung, Trupps/Mauer-Zinnen, Kampf, Türme mit Rollen, 9 Fallen, Belagerung inkl. Schildkröte, lernender Kommandant, Wellen/Bosse/Nacht/Regen, Speichern), Server/Räume, Client (Lobby, HUD, Touch-Steuerung, Minikarte, Endbildschirm, Fortschritt/Sterne/Talente). 104 Unit-Tests grün.
- Karten neu: größer, gewundene Täler mit Seitenkesseln und Felsinseln (`talwacht/shared/src/maps.ts`), Fluss/Wege geglättet (`smoothLine`).
- Grafik: Poly-Haven-PBR-Texturen (`client/public/assets/tex/`), HDRI-Himmel, Fotoboden-Shader, physikalisches Wasser, Blender-Fels `ph_boulder.glb`.
- Blender (`/tmp/claude-0/tools/blender-4.2.3-linux-x64/blender`, bei neuer Sitzung neu laden: Blender 4.2.3 LTS von download.blender.org):
  - `tools/blender/castle_kit.py` → `client/public/assets/models/kit_walls.glb`: Mauerarme/Pfeiler (Stufe 1–3), Bergfried 1–3, Türme, Wachturm, Torhäuser/Tore/Fallgitter, Steinbrücke (AO gebacken).
  - `tools/blender/decimate.py`: glTF dezimieren + Texturen verkleinern.
- Deploy: Dockerfile + render.yaml starten Talwacht (Docker-Build noch nicht getestet). README hat Talwacht-Abschnitt.

## Offen
1. **Truppen:** Nutzerin liefert fertige Modelle (wahrscheinlich Quaternius, CC0). Einbinden über `tools/bake` (Specs in `tools/bake/specs.js`, Ausgabe `client/public/assets/units/`) oder direkt als animierte glTF; Modell-Zuordnung in `talwacht/shared/src/data/troops.ts` / `enemies.ts` (`model`, `scale`).
2. Wirtschafts-/Militärgebäude (noch KayKit) in Blender bauen wie die Burg.
3. Landschaftsbäume in Gebäuden ausblenden; Bäume natürlicher.
4. `e2e/tw-play.mjs` (zwei Handys) wieder grün bekommen (zuletzt Lade-Timeout im Software-Rendering); `e2e/tw-mobile.mjs` war grün.
5. Plan-Task 21 Rest (Sound), Docker-Build testen, abschließende Gesamtprüfung (Review) + finishing-a-development-branch.
