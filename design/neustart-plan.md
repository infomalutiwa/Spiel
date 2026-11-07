# Talwacht – Neustart-Plan

Stand: 7. November 2026 · Grundlage: dein Spieltest + Code-Durchsicht

## 1. Warum es sich „billig" anfühlt (Ursachen, nicht Symptome)

| Was du gemerkt hast | Eigentliche Ursache |
|---|---|
| Gegner brauchen ewig bis zur Burg | Karten zu groß, Wege 3–4 Minuten lang, keine klare Bau-/Kampf-Taktung |
| Anfang zu leicht, später chancenlos | Wellenstärke wächst nach Wellennummer, nicht nach deiner Stärke; „Welle rufen" erlaubt Durchskippen ohne Gegenwert; Boss ruft Leibwache ohne Obergrenze/Vorwarnung |
| Gegner laufen durch Mauer und Burg | Mauer- und Burgteile sind für die Wegfindung keine festen Hindernisse; schwache Mauerstücke werden zur Abkürzung neben dem Tor; die Burg hat keinen Kollisionskörper |
| Anklicken/Verbessern auf dem Handy unsauber | Klick trifft nur exakt das 3D-Modell, kleine Buttons, Menü verdeckt das Ziel |
| Kein Überblick über Ressourcen | 4 Ressourcen (Holz, Stein, Nahrung, Gold), keine Einnahmen pro Minute, keine Aufschlüsselung |
| Keine Ahnung, wo Wirtschaftsgebäude hin sollen | Kein Hinweis auf Ertrag beim Platzieren, Ressourcenfelder kaum sichtbar |
| Emojis statt Symbolen | Platzhalter wurden nie ersetzt |
| Burg hässlich | Ein einzelnes Modell statt einer gestalteten Anlage |

**Fazit:** Das Fundament (Netzwerk, Server, Modelle, Gelände) trägt, aber Spielregeln, Bedienung und Optik müssen neu entworfen und neu gebaut werden. Flicken bringt nichts.

## 2. Grundentscheidung: Technik

**Empfehlung: Browser-Spiel bleibt (TypeScript + Three.js + Node-Server), Spiellogik und Oberfläche werden neu geschrieben.**

- iPhone-Safari ist das schwierigste Ziel. Godot-Web-Exporte sind dort groß (30–40 MB), laden langsam und haben Audio-/Speicherprobleme.
- Koop über das Internet läuft bereits stabil und wird übernommen.
- Übernommen werden nur geprüfte Teile: Netzwerkschicht, Speicherstände, Modell-Pipeline (Blender-Skript), Geländegenerator.
- Alles andere (Regeln, Wellen, Gebäude, Bedienung, HUD, Burg) wird neu gebaut.

Alternative: Godot 4. Lohnt sich nur, wenn du später eine App im Store willst.

## 3. Das neue Spiel in einem Satz

*Ein kompaktes Tal, das du in 20–25 Minuten gegen 12 Wellen hältst – jede Welle siehst du kommen, jede Entscheidung merkst du sofort.*

### Säulen
1. **Klar lesbar:** Jede Zahl, jedes Gebäude, jeder Gegner ist auf einen Blick verständlich.
2. **Fühlt sich wertig an:** Bauen, Treffer und Siege haben sichtbares und hörbares Gewicht.
3. **Fair schwer:** Man verliert, weil man falsch geplant hat, nie wegen eines unsichtbaren Sprungs.
4. **Handy zuerst:** Alles ist mit dem Daumen bedienbar.

## 4. Spielregeln neu

### Taktung
- Eine Runde hat 12 Wellen und dauert 20–25 Minuten.
- Kleinere Karten: Gegner erreichen die Mauer in 40–60 Sekunden.
- **Bauphase** (45 s, Countdown sichtbar) → **Angriff** → kurze Auswertung (Beute, Verluste).
- „Sofort starten" verkürzt nur die Bauphase und gibt dafür Bonus-Gold. Die Stärke der nächsten Welle bleibt gleich, es gibt also keinen Vorteil oder Nachteil beim Skippen außer Zeit.

### Ressourcen: nur noch 3
| Ressource | Woher | Wofür |
|---|---|---|
| **Holz** | Holzfäller am Wald | Gebäude, Türme |
| **Stein** | Steinbruch am Fels | Mauern, Tor, Burgausbau |
| **Gold** | Bauernhöfe, Markt, Kopfgeld je Gegner, Wellenbonus | Truppen, Verbesserungen |

- Nahrung entfällt; die Truppenzahl begrenzen Häuser.
- Die Leiste oben zeigt jeden Vorrat plus **„+42/min"**. Ein Tippen öffnet die Aufschlüsselung: welches Gebäude wie viel bringt.

### Gebäude: 12 statt bisher über 20
- **Wirtschaft:** Holzfäller, Steinbruch, Bauernhof, Markt, Haus
- **Militär:** Kaserne (Schwertkämpfer/Speerträger), Schießstand (Bogen/Armbrust), Stall (Reiter)
- **Verteidigung:** Mauer, Tor, Turm (Ausbaupfad Bogen → Armbrust → Balliste), Graben mit Pfählen
- Jedes Gebäude hat 3 Stufen. Jede Stufe ist sichtbar am Modell erkennbar.

### Platzieren mit Sinn
- Ressourcenfelder (Wald, Fels, fruchtbare Wiese) sind auf der Karte klar markiert, mit Umriss und Symbol.
- Beim Platzieren zeigt die Vorschau live **„+18 Holz/min"** sowie Grün/Gelb/Rot.
- Wirtschafts- und Turmbauplätze sind **feste Bauplätze** (empfohlen). Ein Tippen auf einen Bauplatz zeigt die passenden Gebäude. Das ist auf dem Handy viel präziser als freies Raster.
- Mauern werden per Wischgeste entlang einer Linie gezogen, mit Kostenvorschau.

### Kampf und Belagerung – die Fehler, die das Spiel kaputt machen
- **Mauern, Tor und Burg sind feste Hindernisse.** Gegner können nicht durchlaufen. Sie müssen ein Teil zerstören, und das entstandene Loch ist genau ein Feld breit.
- **Das Tor ist das stärkste Teil.** Mauern werden stufenweise gemeinsam verbessert, damit es keine schwache Stelle direkt neben dem Tor gibt.
- **Gegner wählen ihr Ziel sichtbar.** Rammböcke gehen aufs Tor, Leitern an die Mauer. Ein rotes Symbol über dem Ziel zeigt es vorher an.
- **Die Burg** hat feste Mauern, eigene Schützen und Lebenspunkte. Fallen ihre Lebenspunkte auf null, ist die Runde verloren.
- **Boss:** höchstens 8 Leibwächter, 3 Sekunden Vorwarnung mit Horn und Markierung, nur einmal pro Kampf.
- **Obergrenze von 120 Gegnern gleichzeitig.** Spätere Wellen werden stärker durch Elite-Gegner, nicht durch Massen.

### Schwierigkeit
- Vor jeder Welle eine **Vorschau**: wer kommt, wie viele, von welcher Seite.
- Welle 1 verlangt schon einen Turm, Welle 5 Mauern plus Truppen, Welle 9 den ersten Belagerungsangriff, Welle 12 den Boss.
- **Automatischer Balance-Test:** Ein Test-Bot spielt jede Karte durch.
  - Ein „normaler Spieler" muss auf Normal gewinnen.
  - Wer nichts baut, muss bis Welle 4 verlieren.
  - Das läuft bei jeder Änderung mit, damit nie wieder Sprünge wie mit dem Kriegsfürsten entstehen.

## 5. Bedienung auf dem Handy

- **Tippen wählt das nächste Objekt im Umkreis von ca. 1 cm**, nicht nur das exakte Modell. Das gewählte Objekt bekommt einen goldenen Ring und hebt sich leicht an.
- **Unteres Panel (Bottom Sheet)** statt schwebender Menüs:
  - Name, Stufe und Lebenspunkte-Balken.
  - Große Buttons: **Verbessern** (mit Vorher/Nachher-Werten und Kosten), **Reparieren**, **Abreißen**.
  - Das Panel verdeckt nie das gewählte Objekt; die Kamera rückt es automatisch nach oben.
- **Kamera:** ein Finger verschiebt, zwei Finger zoomen und drehen (Drehung begrenzt), Doppeltipp zentriert. Die Kamera schaut immer aus dem Tal Richtung Burg, kein Berg verdeckt mehr.
- Alle Buttons sind mindestens 48 px groß, Hochformat und Querformat funktionieren.
- **Kurzes Tutorial** in der ersten Runde (3 Schritte: Holzfäller bauen, Turm bauen, Welle starten).

## 6. Neues Aussehen

**Stil:** lebendiges Miniatur-Diorama.
- Warmes Abendlicht, satte aber ruhige Farben, weiche Schatten.
- Klare Silhouetten: eigene Truppen in Blau/Gold, Gegner in Rot/Schwarz.

**Burg:** keine Einzelfigur mehr, sondern eine echte Anlage.
- Bergfried, innerer Ring mit vier Ecktürmen, Torhaus, Fahnen, Fackeln.
- Wächst sichtbar mit den Ausbaustufen.
- Gebaut aus den Quaternius- und Kenney-Bausteinen und vorab in Blender als Bild geprüft.

**Oberfläche:** dunkles Nachtblau mit Goldkanten, Überschriften in einer Kapitälchen-Schrift (Cinzel), Text in Inter.
- **Keine Emojis mehr.** Es gibt einen einheitlichen Symbolsatz als SVG, auf Basis von game-icons.net (frei nutzbar mit Namensnennung) und angepasst.
- **Gebäudebilder:** echte, automatisch per Blender gerenderte Porträts der 3D-Modelle für Baumenü und Infos.

**Spielgefühl:**
- Baugerüst-Animation, Staub, Hammer-Sound.
- Treffer-Blitze, Schadenszahlen, Kamerawackeln bei Rammbock-Stößen.
- Siegesfanfare und Fahnen.

## 7. Arbeitsweise mit „Claude Code Game Studios"

Die Studio-Vorlage wird an Talwacht angepasst und ins Repo übernommen:
- Rollen: Game Designer, UX, Art Director, QA, Balance.
- Feste Abläufe: Design-Dokument vor Code, Review vor Abschluss, Playtest-Bericht.
- Die Vorlage ist für Godot/Unity/Unreal gedacht. Die Engine-Teile werden durch „Three.js/TypeScript" ersetzt.
- Die Regel „vor jeder Datei nachfragen" wird gelockert, damit es zügig vorangeht.

## 8. Phasen

| Phase | Ergebnis | Wann ist sie fertig? |
|---|---|---|
| **0 – Setup & Design** | Studio-Vorlage drin; Spieldesign-Dokument, Art Bible, UI-Entwurf als klickbares Mockup | Du hast Design und Look abgenommen |
| **1 – Spielbarer Kern** | 1 Karte, 3 Ressourcen, 12 Gebäude, 5 Gegnertypen, 12 Wellen, neue Handy-Bedienung, neue Burg, Solo und Koop | Du spielst eine ganze Runde auf dem Handy ohne Frust |
| **2 – Inhalt** | 3 Karten, Boss, Truppen-Upgrades, Tutorial, Sound | Balance-Bot grün auf allen Karten |
| **3 – Feinschliff & Release** | Performance auf älteren Handys, Ladezeit unter 10 s, Speichern/Fortsetzen, Online-Stellung | Du und deine Freundin spielt eine Koop-Runde live |

**Qualitäts-Tore in jeder Phase:**
- Automatische Tests im Handy-Format (iPhone- und Pixel-Größe).
- Balance-Bot.
- Screenshots zur Abnahme.
- Dein Test auf dem echten Handy.

## 9. Offene Entscheidungen

1. Technik: Browser bleibt (empfohlen) oder Godot?
2. Bauplätze fest (empfohlen) oder freies Raster?
3. Bleibt Koop gleich wichtig wie Solo, oder ist Solo zuerst dran?
