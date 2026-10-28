# Burgwacht – „Clash-Update“: Plan

Stand: 2026-10-28. Grundlage ist das Feedback nach dem ersten Spielen zu zweit (iPhone/Safari).

## 1. Verstandenes Ziel
Ein kooperatives Burgverteidigungs-Spiel für zwei, das 30–45 Minuten pro Runde trägt.
Man baut und verbessert im Stil von Clash of Clans: Kaserne, Türme, Katapulte, Truppen-Upgrades.
Die Karten sind abwechslungsreich (Berg mit Serpentinen-Toren statt Geradeaus).
Die Wellen sind realistisch gestaffelt. Alle Truppentypen sind brauchbar. Es gibt mehrere Modi, inklusive Endlos-Basenbau.

## 2. Fehler zuerst (Phase 0, vor allem anderen)
| # | Meldung | Vermutete Ursache | Vorgehen |
|---|---|---|---|
| F1 | iPhone/Safari: verzogen, gedrückt, Knöpfe tot | `100vh` und Adressleiste, Canvas-Größe nicht an `visualViewport` gekoppelt, Overlay-Layer fangen Touches ab, HUD-Absolutwerte (`top:96px` …) kollidieren bei 375–390 px Höhe | Auf echtem Safari-Profil testen (Playwright WebKit, iPhone 12–15 Viewports 844×390, 667×375, Hochformat-Hinweis). Layout auf `dvh` + `visualViewport`, HUD als Grid/Flex statt absoluter Pixel, `touch-action` und `pointer-events` je Layer prüfen, `click` zusätzlich zu `pointerdown`. Regressionstest als e2e mit WebKit |
| F2 | Eine Zone verloren → Gegner rennen sofort zur nächsten, man kann keine Truppen mehr bauen, Spiel verloren | Das `reached`-Latch lässt Gegner nach Zonenfall sofort weiterlaufen. Rekrutieren ist nur in der Prep-Phase möglich, und Neukäufe erscheinen am Platzierungsfeld statt in der Kaserne | Nachkaufen während der Schlacht erlauben (Kaserne spuckt in Intervallen aus, Warteschlange, Gold-Cooldown). Zonenfall bremst den Gegner (Belagerungs-Pause statt sofortigem Durchlauf), zusätzlich ein „letzter Widerstand“-Fenster. Test: Sim-Szenario „Zone 0 fällt, Spieler kauft nach, Welle wird gehalten“ |
| F3 | Balance: ohne Magier/Heiler/Bogenschütze ist man spätestens ab hohen Wellen verloren | Nahkämpfer haben kein Ziel-/Rollenwerkzeug, Gegner-Fernkämpfer und Wellen sind nicht gegen Nahkampf-Comps getestet | Siehe Abschnitt 6 und Bot-Matrix |

## 3. Wirtschaft und Bauen (Clash-Prinzip)
- **Kaserne**: eigenes Gebäude auf der Karte. Level erhöht die Armee-Kapazität (30 → 40 → 55 → 75 → 100) und die Ausbildungsgeschwindigkeit. Truppen werden dort ausgebildet (Warteschlange) und **laufen von der Kaserne selbst nach vorn** durch die ganze Karte.
- **Gebäude zum Selberbauen** (Bauplätze, Ressourcen Gold + Holz/Stein oder nur Gold, zwei Spieler teilen die Kasse):
  - Bogenschützenturm (stationär, Level 1–3, Feuerpfeile ab 2)
  - Katapult-Stellung (stationär, Flächenschaden, langsam)
  - Ballista (Einzelziel, durchschlägt Rüstung)
  - Schmiede (schaltet Truppen-Upgrades frei)
  - Lazarett (heilt Truppen im Radius)
  - Goldmine/Markt (passives Einkommen, in Endlos wichtig)
  - Mauern/Tore/Türme wie bisher upgradebar, plus Reparatur zwischen den Wellen
- **Bauzeit** läuft in der Vorbereitung weiter und während der Welle, dadurch gibt es echte Entscheidungen.
- Kosten und Einkommen als Tabelle in `shared/src/data/economy.ts`, per Bot-Simulation auf „knapp, aber schaffbar“ abgestimmt.

## 4. Truppen-Upgrades (Level + Spezialisierung)
- Jede Truppe hat Level 1–3 (Schmiede-Stufe als Voraussetzung). Das erhöht HP/Schaden und zeigt sich im Modell (Rüstung, Umhang, Helm).
- Je Truppe **ein Zweig mit Wahl** ab Level 2 (zu zweit besprechbar):
  - Bogenschütze → *Feuerpfeile* (Brandschaden über Zeit 3 s) **oder** *Durchschlag*
  - Schwertkämpfer → *Schildwall* (blockt Pfeile) **oder** *Berserker*
  - Speerträger → *Pikenwall* (Reiterabwehr) **oder** *Wurfspeere*
  - Reiter → *Lanzenangriff* **oder** *Flankenläufer*
  - Magier → *Kettenblitz* **oder** *Frost*
  - Heiler → *Aura* **oder** *Wiederbelebung*
- Brandschaden ist ein neuer Statuseffekt (DoT) in `combat.ts`. Eventuell kommt später Frost/Gift dazu.

## 5. Wellen realistisch staffeln
- Statt Gruppen-Klumpen: **Marschkolonnen** mit Abstand (Späher → Fußvolk → Schwere → Belagerung → Nachzügler), 25–60 s Spawn-Streuung, mehrere Spawn-Tore pro Karte.
- Gegnerverhalten: Gruppen halten Formation, Fernkämpfer bleiben hinten, Belagerung (Rammbock, Belagerungsturm) zielt auf Tore/Mauern, Banner-Träger erhöhen die Moral.
- **Alle Wellen**: Kampagnen-Länge auf 20–30 Wellen ausbauen, mit Boss-Wellen (5, 10, 15, 20 …) und einem Finale.
- Skalierung weg von „einfach mehr“: neue Gegnertypen pro Meilenstein (Schildträger, Brandpfeil-Schützen, Rammbock, Belagerungsturm, Zauberer, Boss).

## 6. Balancing
- **Bot-Matrix** in `server/scripts/balance.ts`: je Truppe-Mono-Armee, Mischarmeen und leere Armee gegen jede Welle auf jeder Karte, Ausgabe als Siegquote-Tabelle.
- Zielwerte: jede Einzeltruppe in ihrem Fenster nützlich (Gegner-Konter-Tabelle `counters.ts` sauber nutzen), keine Mono-Armee gewinnt alle Wellen, und kein Typ ist ab Welle X Pflicht.
- Nahkampf aufwerten: Tanks brauchen Aggro (Spott), Gegner-Fernkämpfer bekommen Ziele auf Sichtweite, damit Schwertkämpfer nicht ungestraft aufgerieben werden.
- Wirtschaft: Kosten, Belohnungen, Einkommen und Upgrade-Preise fließen in dieselbe Matrix ein (Gold pro Welle vs. Kosten der nächsten Welle).

## 7. Karten (wirklich verschieden)
Jede Karte hat eigenes Gelände, Wegführung, Torfolge und Zonen.
1. **Sonnenwiese** – bleibt der gerade Einstieg, der gemütliche Anfang.
2. **Bergfestung** (neu, Highlight) – spiralförmiger Aufstiegsweg um einen Berg. Die Burg liegt oben, die Tore liegen auf dem Weg in drei bis vier Ringen. Gegner laufen die Serpentine hoch, man kann von oberen Ringen auf untere schießen. Braucht Höhenfeld und Weg als Polylinie statt nur x-Achse. Das ist der größte technische Brocken: Routing und Zonen müssen von „Gerade“ auf „Pfad entlang einer Polylinie“ umgebaut werden.
3. **Waldpass** – gewundener Weg durch Wald, Engstellen, Hinterhalt von der Seite.
4. **Eistal / Schlucht** – Brücke über Schlucht, ein Tor, Katapulte lohnen sich.
5. **Insel / Doppelzugang** – zwei Spawn-Seiten, man muss die Verteidigung aufteilen (stark für Koop).
6. **Wüstenoase** – offene Fläche, viele Bauplätze, Fokus auf Basenbau.
- Gemeinsame Basis: Weg als Polylinie (`path: Vec2[]`), Tore/Zonen als Position entlang des Weges, Höhen-Raster für Berg, Bauplätze als Raster-Slots.

## 8. Spielmodi
- **Kampagne** (Wellen 1–N, siehe oben).
- **Endlos** – Basenbau, Gold-Mine und Markt zählen, Wellen wachsen exponentiell mit Pausen, Highscore „überlebte Wellen“ (nur lokal/pro Raum, kein Konto).
- **Belagerung (Rush)** – kurze Runde, 10 Wellen, alles schnell.
- **Herausforderung** – feste Armee und Gebäude vorgegeben, Rätsel-Karten.
- Modus und Karte werden in der Lobby gewählt (Teil des `create`-Aufrufs, im Snapshot-Protokoll als Raum-Config).

## 9. Grafik und Modelle
- Neue, hochwertigere Modelle (low-poly, aber mit Detail): Rüstungsstufen, Umhänge, Banner, Waffenvarianten je Level; Gegner mit klaren Silhouetten.
- Gebäude: Kaserne, Schmiede, Türme, Katapult, Ballista, Mine mit je eigenem Baustufen-Look (Gerüst während der Bauzeit).
- Materialien: Normal-/Roughness-Detail per prozeduralen Texturen (Canvas-Texturen, keine großen Downloads, damit der Free-Hosting-Rahmen hält), bessere Beleuchtung (Schatten, Dunst, Partikel für Feuerpfeile, Funken).
- Terrain: Höhenfeld mit Pfaden, Felsen, Vegetation je Thema. Wetter pro Karte (Nebel, Schnee, Staub).
- Wichtig: Mobil-Performance. Instancing für Truppen, LOD, dynamische Qualitätsstufe nach Framerate.

## 10. Mobile UX (zusammen mit F1)
- Querformat-Pflicht mit freundlichem Hinweis im Hochformat.
- HUD neu: untere Befehlsleiste, links Truppen/Gebäude-Karten, oben Zustand. Alles aus dem Safe-Area-Rahmen, nichts mit festen Pixelabständen.
- Bau-Menü als Auswahlkarten (große Tippflächen ≥ 44 pt), Platzierung per Tippen auf Bauplatz.

## 11. Reihenfolge und Lieferpakete
Jedes Paket ist für sich spielbar und wird auf den Branch gepusht.
1. **Paket A – Stabilität**: F1 (iPhone) + F2 (Nachkaufen/Zonenfall) + e2e-Tests mit WebKit.
2. **Paket B – Balance & Wellen**: Bot-Matrix, Kolonnen-Wellen, Gegner-Konter, Nahkampf-Aufwertung.
3. **Paket C – Kaserne & Upgrades**: Kaserne-Level, Ausbildungsschlange, Truppen laufen von der Kaserne aus, Truppen-Level und Zweige (Feuerpfeile zuerst).
4. **Paket D – Bauen**: Bauplätze, Türme/Katapult/Ballista/Mine/Schmiede/Lazarett, Bauzeit.
5. **Paket E – Pfad-Karten**: Weg-Polylinie im Sim, dann Bergfestung, danach die übrigen Karten.
6. **Paket F – Modi**: Endlos, Rush, Herausforderung, Lobby-Auswahl.
7. **Paket G – Grafik**: Modelle, Texturen, Beleuchtung, Performance.
- Danach: Bosse, Belagerungsgegner, Achievements (nur lokal).

## 12. Risiken
- Der Pfad-Umbau (Paket E) berührt Routing, Zonen, Mauern und den Renderer. Deshalb zuerst die Sim-Tests anpassen.
- Der Snapshot-Codec (17 Byte pro Einheit) muss für Level/Zweig/Statuseffekte erweitert werden. Wir führen eine Protokollversion ein.
- Umfang: Das sind viele Pakete. Jedes Paket einzeln liefern, statt alles auf einmal.
- Kein Server-Zustand außer dem Raum im Speicher (Render Free schläft ein). Highscores sind daher nur lokal.

## 13. Offene Fragen
1. Ressourcen: nur Gold, oder zusätzlich Holz/Stein?
2. Soll die Bergfestung das erste große Paket nach der Stabilität sein, oder lieber erst Kaserne/Upgrades?
3. Gleichzeitiges Bauen: dürfen beide Spieler dasselbe Gebäude upgraden (gemeinsame Kasse) oder hat jeder eine eigene Kasse?

## 14. Entscheidungen (Antworten auf Abschnitt 13) und Umsetzungsstand

- **Ressourcen:** Gold, **Stein** (Katapult-Munition, 3 pro Schuss; pro Welle ein Einkommen, gegen Gold tauschbar) und **Edelsteine** (selten, Upgrades). Alles steht in `shared/src/data/economy.ts`.
- **Kassen:** Jede Spielerin hat eine **eigene** Kasse (Gold, Stein, Edelsteine, Kaserne-Stufe, Truppen-Upgrades). Nur die Burg und die Mauern gehören beiden.
- **Umgesetzt (Branch `claude/game-brainstorm-friends-9a7zro`):** Paket A (iPhone-Layout, Nachkaufen im Kampf, Belagerungspause nach Zonenfall), Wirtschaft, Katapult mit Flächenschaden und Flugbahn, Truppenlogik (Halten / Angriff ohne Ziel, Kiten, Spott, Heiler), Kaserne-Stufen mit Ausbildungsschlange, Truppen-Level 1–3 mit Zweigen (Feuerpfeile u. a.), 25 Wellen als Marschkolonnen mit Bossen, Balance-Matrix (`server/scripts/balance.ts`).
- **Noch offen:** Ballista (Modell vorhanden, noch keine Truppe), Schmiede / Lazarett / Mine als Bauplätze (Paket D), Pfad-Karten und Bergfestung (Paket E), weitere Modi (F), neue Modelle und Texturen (G), echte WebKit-Tests (hier nur Chromium mit iPhone-Emulation und Touch).
