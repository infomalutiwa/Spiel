# Talwacht – Design (Arbeitstitel)

Stand: 2026-11-06. Neues Koop-Spiel im selben Repo wie Burgwacht. Netzwerk, Server-Raumsystem, Modell-Pipeline und Handy-Layout werden übernommen; Spielregeln, Karte und Simulation sind neu.

Bilder zur Richtung (gestellte Szenen mit den vorhandenen Modellen, kein Spielcode): Übersicht V-Tal und Nahansicht „Mauer besetzen“ aus dem Brainstorming vom 2026-11-06.

---

## 1. Verstandenes Ziel

**Gesagt:**
- Zwei Personen (du und deine Freundin) spielen zusammen im Browser, jede auf ihrem Handy (iPhone + Android), online über einen Link.
- Ihr verteidigt eine Burg, **die ihr selbst aufbaut und ausbaut**. Ihr verschanzt euch und „campt“: Mauern, Türme, Fallen, Schicht für Schicht.
- Die Burg liegt **hinten in einem natürlich wirkenden Tal**. Angriffe kommen **nur von vorn**. Rücken und Flanken sind durch Gelände geschützt, dahinter kann man in Ruhe aufbauen.
- **Wellen werden immer schwieriger** und abwechslungsreicher. Die Gegner sind schlauer und entwickeln sich weiter, z. B. die Schildkröten-Formation mit Rammbock, gegen die Bogenschützen allein nicht helfen.
- Truppen werden **dauerhaft ausgebildet** (Kaserne/Trainingslager). Jede führt bis etwa 100 Truppen.
- Wirtschaft mit Rohstoffen, verschiedene Fallen, Türme mit fester Besatzung (2–4 Bogenschützen, die nicht zur Armee zählen).
- Steuerung am Handy: Trupp antippen, Ziel antippen. Ein Tipp auf eine Mauer stellt Fernkämpfer **sofort sauber verteilt** auf die Mauerkrone.
- **Gemeinsame Kasse**, jede führt ihre eigenen Trupps.
- Raster-Bauen, Speichern, Fortschritt über Runden (Karten, Truppen/Gebäude freischalten, kleine Dauer-Boni), Schwierigkeitsstufen.
- Eine Runde dauert 30–60 Minuten.
- Bunter Low-Poly-Stil, aber **sauber**: Mauern, Tore und Türme müssen ordentlich zusammenpassen, nichts verdreht oder abgeschnitten.

**Angenommen (bitte prüfen):**
- Die Gegner sind menschliche Armeen (Raubritter, Söldner, Fürstenheer), keine Fantasy-Wesen.
- Die Wellen folgen einer festen Zeitleiste. Gebaut wird jederzeit, auch im Kampf. Mit ⏩ holt man die nächste Welle früher und bekommt dafür Bonus-Gold.
- Kein Nebel des Krieges und kein PvP.

---

## 2. Kernschleife und Rundenablauf

**Minute für Minute:** Rohstoffe fließen → ihr baut und bildet aus → die Zeitleiste zeigt die nächste Welle (Zeitpunkt, Weg, Gegnerarten) → die Welle schlägt an eure Verteidigung → ihr reagiert (Trupps verschieben, Fallen auslösen, reparieren) → Beute, und es geht weiter.

**Runde (30–60 Min):**
| Abschnitt | Wellen | Was passiert |
|---|---|---|
| Aufbau | 1–5 | Kleine Plünderertrupps, ein Anmarschweg. Bergfried, erste Palisade, Holz und Nahrung. |
| Ausbau | 6–14 | Zweiter und dritter Weg öffnen sich. Steinmauern, Türme, erste Schildträger und Rammen. Boss in Welle 10. |
| Belagerung | 15–24 | Schildkröten, Belagerungstürme, Trebuchets, Mineure. Der Gegner passt sich an eure Verteidigung an. Boss in Welle 15 und 20. |
| Großer Sturm | 25 (–30 auf Schwer) | Alles auf einmal über alle Wege, angeführt vom Kriegsfürsten. Wer überlebt, gewinnt die Runde. |

- **Zeitleiste:** Oben eine Leiste mit den nächsten 3 Wellen. Jede zeigt Symbol, Weg (links/Mitte/rechts) und **Spähbericht** („viele Schilde“, „Belagerungsturm“). Zwischen zwei Wellen liegen 60–120 s, je nach Schwierigkeit.
- **⏩ Welle rufen:** Bringt die nächste Welle sofort und gibt Gold für die restliche Zeit. Das ist das Tempo-Werkzeug für geübte Spielerinnen.
- **Niederlage:** Der Bergfried fällt. Fällt nur eine Mauerlinie, ist das noch keine Niederlage, man zieht sich auf die nächste zurück.
- **Schwierigkeit:** Leicht (gemütlich, 25 Wellen, mehr Rohstoffe) / Normal / Schwer (30 Wellen, schlauere KI, weniger Puffer).

---

## 3. Die Karte: natürliches Tal

**Grundform:** ein **Trichtertal**. Hinten ist es eng, nach vorn öffnet es sich. Es soll aber **nicht geometrisch wie ein V** wirken, sondern natürlich:
- Talränder aus unregelmäßigen Felsklippen, bewaldeten Hängen, Geröll und Vorsprüngen. Sie sind mal steil, mal gestuft, es gibt Buchten und Engstellen.
- Hinter der Burg liegt ein Bergmassiv mit Wasserfall o. ä. Die Kartengrenze ist nie als Kante sichtbar: Hinter dem Talrand geht das Gelände als Kulisse weiter (Berge, Wald, Nebel in der Ferne).
- Im Tal gibt es Hügel, einen Bach, Felsgruppen, Waldstücke und Wiesen. Das sind spielrelevante Merkmale: Wald gibt Holz, Felsen geben Stein, Wiesen sind gut für Höfe, Hügel geben Fernkämpfern mehr Reichweite.
- **Anmarsch:** 2–3 Wege kommen von vorn durch die offene Talseite und laufen erst spät zusammen. Sie öffnen sich im Lauf der Runde (zuerst Mitte, dann links, dann rechts).

**Größe:** etwa 500 × 600 m Spielfläche (so viel wie im Übersichtsbild), davon ca. 60 % bebaubar.

**Karten (handgestaltet, als Daten):**
1. **Grüntal** – Einstieg: breites Wiesental mit Bach, drei sanfte Wege.
2. **Klamm** – enge Schlucht mit Holzbrücke, Engstellen und hohen Klippen. Fallen und Steinlawinen lohnen sich hier besonders.
3. **Flusstal** – ein Fluss quert das Tal, es gibt zwei Furten und eine Brücke. Die Brücke kann man abreißen.
4. **Winterpass** – verschneit, mit einem Hang, an dem Baumstamm-Fallen gut funktionieren. Freischaltbar.

**Technik:** Jede Karte besteht aus einer Höhenkarte (von Hand modelliert über Kontrollpunkte und Spline-Talränder, dazu Rauschen für Details), Zonenmasken (bebaubar, Wald, Fels, Wasser, Weg), Wege-Splines für die Anmarschrouten und Platzierungen der Kulisse. Kein Zufallsstreuen ohne Regeln: Bäume stehen in Gruppen mit Waldrand, Felsen am Hangfuß.

---

## 4. Bauen

**Raster:** 4-m-Zellen für Gebäude, Mauern und Türme, 2-m-Unterzellen für Fallen. Das Raster ist nur im Bau-Modus sichtbar.

**Bedienung am Handy:**
- Bauleiste unten (Kategorien: Mauern · Türme · Fallen · Wirtschaft · Militär).
- **Mauern ziehen:** Finger vom Start- zum Endpunkt ziehen. Die Vorschau zeigt grüne und rote Felder, Kosten und Bauzeit, dann ✔ tippen.
- Einzelgebäude: antippen, Geist-Vorschau verschieben, drehen, ✔.
- Die Mitspielerin sieht deine Vorschau live (rosa bzw. blau eingefärbt).

**Mauern (das muss gut aussehen):**
- **Automatisches Zusammensetzen:** Jede Mauerzelle wählt ihr Modell nach den Nachbarn: Gerade, Ecke, T-Stück, Kreuzung, Ende, Anschluss an Turm oder Tor, Anschluss an Felsen. Das löst die verdrehten Mauern aus den Entwürfen: Ausrichtung und Drehpunkt kommen aus einer geprüften Tabelle, nicht aus Raten.
- Mauern schließen sauber an die Talklippen an (Anschlussstück, das im Fels verschwindet).
- **Stufen:** Holzpalisade → Steinmauer → verstärkte Mauer (mehr Leben, breiterer Wehrgang). Das Aussehen ändert sich pro Stufe.
- Auf Steinmauern gibt es einen **Wehrgang mit Zinnen**. Die Plätze (Zinnen) sind feste Stellplätze für Fernkämpfer, 1 pro 2 m. Treppen entstehen automatisch an der Innenseite.
- **Tore:** Holztor → beschlagenes Tor → Torhaus mit Fallgitter und Pechnase. Tore öffnen sich für eigene Truppen (Ausfall!) und schließen bei Feindkontakt automatisch.
- **Schaden sichtbar:** Risse, abgebrochene Zinnen, Trümmer. Zerstörte Stücke werden zu Schutt, der Gegner kann durch die Lücke.

**Bauzeit:** Gebäude wachsen über ein Baugerüst (Gerüst → halbfertig → fertig). Reparieren kostet Zeit und Stein und geht auch im Kampf.

**Gegner-Wegfindung:** Die Gegner berechnen ein Flussfeld (Flow-Field) über das Raster. Mauern sind nicht „unpassierbar“, sondern **teuer**: Kosten = Mauerleben × Verteidigung in Reichweite. Gegner suchen also die **schwächste Stelle**. Komplett abriegeln ist erlaubt und gewollt (ihr verschanzt euch), die Gegner brechen dann irgendwo durch.

---

## 5. Türme (mit eigener Besatzung)

Turmbesatzungen **zählen nicht zur Armee** und werden nach jeder Welle kostenlos aufgefüllt (nach Wellenende, mit kurzer Verzögerung).

| Turm | Besatzung | Stärke | Stufen |
|---|---|---|---|
| **Bogenturm** | 2 → 3 → 4 Bogenschützen | Dauerbeschuss, günstig | St. 3: Brandpfeile (zünden Pech) |
| **Armbrustturm** | 2 → 3 Armbrustschützen | Panzerbrechend, gut gegen Schwere | St. 3: Durchschlag |
| **Ballista** | 2 Bediener | Durchschlägt Linien, ideal gegen Schildkröten von der Seite | St. 2: Kettengeschoss |
| **Katapultturm** | 3 Bediener | Flächenschaden, zerreißt Formationen, braucht Stein als Munition | St. 2: Brandtöpfe |
| **Pechnase** (auf Tor/Mauer) | 1 | Gießt Pech direkt vor das Tor: **der Konter gegen die Schildkröte** | St. 2: brennendes Pech |
| **Wachturm/Signalfeuer** | – | Sicht weiter, Zeitleiste zeigt Spähbericht genauer, leichter Bonus auf Moral | – |

Türme stehen **in** der Mauerlinie (dann verbinden sich die Wehrgänge) oder frei. Eigene Fernkämpfer können zusätzlich einen Turm besetzen (2 Plätze extra).

---

### Rollen der Türme (Pflicht: jeder Turm hat einen klaren Nutzen)
| Turm | Feuerrate | Schaden/Treffer | Reichweite | Fläche | Bester Einsatz | Schwach gegen |
|---|---|---|---|---|---|---|
| Bogenturm | hoch (1 Schuss/0,9 s je Schütze) | niedrig, Stich | mittel | nein | Massen leichter Gegner, Pioniere | Schilde, schwere Rüstung |
| Armbrustturm | langsam (1/2,2 s) | hoch (≈ 3× Bogen), panzerbrechend | mittel-weit | nein | Schwere, Bosse, Rammbock-Bediener | große Massen |
| Ballista | sehr langsam (1/4 s) | sehr hoch, **durchschlägt bis zu 6 Ziele in Linie** und ignoriert Schilde | weit | Linie | Schildkröte von der Seite, Belagerungsturm, Kolonnen auf geraden Wegen | einzelne, verstreute Ziele |
| Katapultturm | langsam (1/5 s), Steinmunition | hoch, **großer Flächenschaden (Radius 6 m)**, **bricht Formationen** (Schildkröte löst sich für 6 s auf) | sehr weit, Mindestabstand | ja | Schildkröte, dichte Gruppen, Trebuchets | schnelle Reiter, nahe Ziele |
| Pechnase | kurz | Brand-Fläche direkt vor Tor/Mauer, ignoriert Schilde von oben | sehr kurz | ja | Rammbock + Schildkröte am Tor | alles, was nicht am Tor steht |

Die Bot-Matrix (Abschnitt 15) prüft diese Rollen: Jeder Turm muss in seinem Szenario klar besser sein als die anderen, gleiche Kosten vorausgesetzt (z. B. Katapult gegen Schildkröte ≥ 3× so wirksam wie Bogenturm).

## 6. Fallen

| Falle | Wirkung | Besonderheit |
|---|---|---|
| **Stachelgrube** | Schaden + Verlangsamung | billig, zum Anfang |
| **Fallgrube** | verschluckt die ersten 2–3 Fußsoldaten | danach offen und muss zurückgesetzt werden (Holz) |
| **Pechgraben** | erst klebrig, wird angezündet von Brandpfeilen, Brandtöpfen oder per Befehl | Flächenfeuer, stark gegen Schildkröten und Massen |
| **Krähenfüße** | verlangsamt Reiter stark | gegen Kavallerie |
| **Spießwall** | Reiter prallen ab und nehmen Schaden | blockiert für Fußvolk nicht |
| **Baumstamm-Lawine** | an Hängen, rollt per Auslösen bergab | Einmal-Auslöser, Holz zum Nachladen |
| **Steinlawine** | an Klippenrand, Fläche + Betäubung | groß, teuer, lange Abklingzeit |
| **Sprengfass** | Explosion im Radius | auch für Gegner-Pioniere gefährlich zu räumen |
| **Wassergraben** | Gegner langsam, Belagerungstürme und Mineure kommen nicht durch | nur in der Nähe vom Bach baubar |

Gegner-**Pioniere** können Fallen entdecken und räumen und Gräben mit Faschinen füllen. Fallen sind deshalb kein Selbstläufer.

---

## 7. Eigene Truppen und Ausbildung

**Ausbildung permanent:** Gebäude haben Warteschlangen und bilden auch im Kampf weiter aus. Neue Trupps sammeln sich am **Sammelpunkt** (pro Gebäude setzbar, z. B. „direkt aufs Osttor“).

| Gebäude | bildet aus |
|---|---|
| **Kaserne** | Speerträger, Schildträger (Schwert und Schild), Hellebardiere (ab St. 2) |
| **Schießplatz** | Bogenschützen, Armbrustschützen, Langbogen (ab St. 3) |
| **Stall** | Leichte Reiter, Ritter |
| **Feldlager/Lazarett** | Feldscher (heilen), heilt Verwundete in der Nähe |
| **Werkstatt** | Ingenieure (reparieren im Kampf, setzen Fallen zurück, löschen Brände) |
| **Schmiede** | keine Truppen; Upgrades: Rüstung, Waffen, Brandpfeile, Pavesen (Schilde für Schützen) |

- **Armeegrenze:** bis zu 100 pro Spielerin. Die Grenze wächst mit Häusern und Nahrung.
- **Erfahrung:** Trupps steigen durch Kämpfe auf (bis zu 3 Sterne): etwas mehr Leben und Schaden, sichtbar an Umhang und Helmbusch.
- **Trupps:** Truppen kommen als Trupp (6–12 Mann, je nach Typ). Gesteuert wird der Trupp, nicht der einzelne Mann.

**Schlaue Befehle (ein Tipp, der Rest passiert selbst):**
| Antippen von … | mit … | ergibt |
|---|---|---|
| Mauerstück | Fernkämpfern | Sie verteilen sich gleichmäßig auf die freien Zinnen des Abschnitts. Reicht er nicht, nehmen sie die Nachbarstücke dazu (die Vorschau zeigt das vor dem Bestätigen). Fällt ein Stück, wechseln sie auf die nächsten freien Zinnen. |
| Tor (Innenseite) | Nahkämpfern | Block-Formation hinter dem Tor. Bricht das Tor, halten sie die Lücke. |
| Mauerlücke/Bresche | Nahkämpfern | Sie schließen die Lücke als Schildwall. |
| Turm | Fernkämpfern | Besetzen die Extra-Plätze. |
| Gegner | beliebig | Angriff auf dieses Ziel. |
| Boden vor dem Tor | Reitern | **Ausfall**: Tor öffnet sich, die Reiter greifen an und kehren auf Befehl (↩️) zurück. |

Dazu: Halten / Verfolgen / Rückzug und Formationen (Linie, Block, Speerwall).

---

## 8. Gegner: abwechslungsreich und lernfähig

**Gegnertypen (menschliche Armeen):**
| Typ | Rolle | Konter |
|---|---|---|
| Plünderer | Masse, schnell, schwach | Bogenschützen, Stachelgruben |
| Söldner (Schwert/Schild) | solide Front | Speerträger, Katapult |
| Armbrustschützen mit **Pavese** | stellen große Schilde auf und beschießen eure Mauerkrone | Katapult, Ausfall mit Reitern |
| Leichte Reiter | schnell auf Flankenwegen, umgehen Fallen | Speerwall, Krähenfüße, Spießwall |
| **Schildkröte (Testudo)** | 12–20 Schildträger in geschlossener Formation, Schilde nach vorn und oben, **schützen einen Rammbock** auf dem Weg zum Tor. Pfeile von vorn und oben machen fast nichts. | **Pechnase/Pechgraben + Feuer**, Steinlawine, Katapult (bricht die Formation auf), Ballista von der Seite, Fallgrube vor dem Tor, Ausfall mit Hellebardieren in die Flanke |
| Rammbock (allein) | Tor-Schaden | Pech, Fernkampf auf die Bediener |
| **Sturmleitern** | Trupps legen Leitern an die Mauer und kämpfen **auf dem Wehrgang** | Nahkämpfer auf der Mauer, Leitern umstoßen (Befehl bei Nähe) |
| **Belagerungsturm** | rollt an die Mauer und lädt Soldaten direkt auf den Wehrgang | Wassergraben, Brandtöpfe, Katapult |
| **Mineure** | graben unter der Mauer; nach einiger Zeit stürzt das Stück ein | Wassergraben, Gegenmine (Ingenieure), Spähbericht warnt |
| **Pioniere** | räumen Fallen, füllen Gräben mit Faschinen | Fernkampf zuerst auf sie |
| Brandpfeil-Schützen | setzen Holzgebäude und Palisaden in Brand | Steinmauern, Brunnen + Ingenieure löschen |
| **Trebuchet** | Fernbeschuss auf Mauern und Türme aus großer Entfernung | Ausfall (Reiter/Ritter) oder eigenes Katapult mit Reichweite |
| Feldherr/Kriegsfürst (Boss) | Aura (Moral, Tempo), eigene Leibgarde, Phasen | konzentriertes Feuer, Fallen-Kombination |

**Gegner-Kommandant (KI):**
- Jede Welle wird aus einem **Budget** gebaut, das mit den Wellen steigt. Der Kommandant entscheidet, **womit** und **wo** er angreift.
- Vor der Welle bewertet er jeden Anmarschweg: Mauerleben, Türme und Fallen in Reichweite, Truppen dort. Der schwächste Weg bekommt den Hauptstoß, die anderen Ablenkungsangriffe.
- **Er lernt aus euren Verteidigungen** (über die Runde hinweg, sichtbar im Spähbericht):
  - viele Fernkämpfer auf der Mauer → mehr Schildkröten, Pavesen und Trebuchets
  - viele Fallen → Pioniere vorneweg
  - starkes Tor → Sturmleitern, Belagerungsturm, Mineure an der Mauer daneben
  - viel Kavallerie bei euch → Speerträger in der Welle
  - Wassergraben → mehr Trebuchets statt Türmen
- **Technologie-Stufen:** Neue Gegnertypen kommen nach und nach dazu (Welle 1 Plünderer … Welle 8 Schildkröte … Welle 14 Belagerungsturm … Welle 18 Mineure). So bringt jede Phase etwas Neues.
- **Verhalten im Kampf:** Fernkämpfer halten Abstand, Schildkröten bleiben geschlossen, bis das Tor fällt, Reiter weichen Speerwällen aus. Bei hohen Verlusten **ziehen sich Trupps zurück** und schließen sich der nächsten Welle an, statt sinnlos weiterzurennen.

**Spezialwellen (Abwechslung):**
- **Nachtangriff:** wenig Sicht, Fackeln an Mauern und Brandpfeile werden wichtig.
- **Sturmregen:** Feuer geht schlechter, Pech brennt nicht.
- Grundregel: **Angriffe nur von vorn.** Keine Angriffe über Klippen oder von hinten.

---

## 9. Wirtschaft

| Rohstoff | Quelle | Wofür |
|---|---|---|
| 🪵 Holz | Holzfäller am Wald (mehr Bäume in Reichweite = mehr Ertrag; der Wald schrumpft langsam, Förster pflanzt nach) | Palisaden, Gebäude, Fallen, Pfeile |
| 🪨 Stein | Steinbruch an Felsen, Mine an der Klippe | Steinmauern, Türme, Katapult-Munition |
| 🌾 Nahrung | Höfe auf Wiese, Mühle verstärkt | Unterhalt der Armee (pro Minute), Ausbildung |
| 🪙 Gold | Markt, Steuern aus Häusern, Beute pro Welle | Truppen, Upgrades, Ritter |

- Alles kommt in die **gemeinsame Kasse**. Ein kleines Protokoll zeigt, wer wofür ausgegeben hat.
- Gebäude außerhalb der vorderen Mauer liefern mehr (bessere Felder/Wald), sind aber gefährdet. Das ist die Abwägung zwischen Verschanzen und Gier.
- Nahrung ist der Unterhalt: Mehr Truppen brauchen mehr Höfe. Bei Hunger sinkt die Moral.

---

## 10. Zusammenspiel zu zweit

- Gemeinsame Kasse, getrennte Trupps (blau und rosa).
- **Ping-Rad:** lange auf die Karte drücken → „Hier verteidigen“, „Hilfe!“, „Bau hier“, „Achtung Schildkröte“.
- Bauvorschau und Kamera-Position der Mitspielerin sind sichtbar (kleiner Marker am Rand).
- Bricht die Verbindung ab, pausiert das Spiel. Mit demselben Code steigt man wieder ein (wie bei Burgwacht).

---

## 11. Speichern und Fortschritt

- **Spielstand:** Der Server schreibt nach jeder Welle einen Spielstand und schickt ihn an beide Handys (Browser-Speicher). Zum Weiterspielen öffnet eine „Fortsetzen“ und lädt ihn hoch. So geht nichts verloren, auch wenn der kostenlose Server einschläft.
- **Fortschritt (pro Gerät gespeichert, mit Export-Code zum Übertragen):**
  - **Sterne** pro Karte und Schwierigkeit (1–3: gewonnen, ohne dass die innere Mauer fiel, auf Schwer).
  - **Freischalten** mit Sternen: Karten 2–4, Truppen (Hellebardiere, Langbogen, Ritter), Türme (Ballista, Katapult), Fallen (Steinlawine, Sprengfass).
  - **Talente** (kleine Dauer-Boni, zum Beispiel +5 % Mauerleben, +10 % Ausbildungstempo, Start mit Palisade). Pro Runde sind 3 Talente aktiv, damit es nicht ausartet.

---

## 12. Grafik und 3D-Modelle (Aufwertung)

**Was in den Entwürfen schlecht aussah und wie wir es lösen:**
| Problem | Lösung |
|---|---|
| Mauern verdreht und stückig | Ein **modularer Burgbaukasten** mit geprüften Drehpunkten. Das Autotiling (siehe 4) setzt die Teile richtig zusammen. Für jedes Teil gibt es eine Kalibrier-Tabelle (Rotation, Versatz, Höhe des Wehrgangs). |
| Tor sah komisch aus | Eigenes **Torhaus** aus Baukastenteilen (zwei Türme + Bogen + Torflügel + Fallgitter), Torflügel animiert |
| Türme passten nicht zur Mauer | Türme aus demselben Baukasten, mit derselben Steinfarbe, Wehrgang auf derselben Höhe wie die Mauer |
| Kartenrand abgeschnitten | Kulissen-Gelände hinter dem Talrand, Fernnebel, Berge als Horizont |
| Zufällig verstreute Häuser und Bäume | Handgestaltete Karten, Wald in Gruppen mit Waldrand, Stadt nach Raster |

**Modelle (alles CC0, Stil Low-Poly, eine gemeinsame Farbpalette):**
- Erster Schritt der Umsetzung ist eine **Asset-Prüfung**:
  - Kandidaten sammeln: KayKit (Medieval Hexagon, Adventurers, weitere Kits), Kenney Castle Kit, Quaternius (Medieval-/Fantasy-Pakete) u. a.
  - Jeden Kandidaten in einer Galerie-Szene nebeneinanderstellen.
  - Nur einen Baukasten für Burgteile wählen, der modular ist und zu den KayKit-Figuren passt.
  - Was fehlt (Wehrgang-Zinnen, Pechnase, Schildkröten-Schilde, Belagerungsturm, Fallen), wird im Code aus einfachen Formen in derselben Palette ergänzt.
- **Gegner-Figuren:** KayKit-Figuren mit eigener Farbpalette (dunkelrot/schwarz, eigene Wappen), große Rechteckschilde für Schildkröten als eigenes Teil.
- Abnahme: Für jedes Bauteil gibt es einen Galerie-Screenshot (`?gallery=bau`), der vor dem Einbau angeschaut wird.

**Leistung auf dem Handy:** Figuren als vorgebackene Animationsframes mit Instancing (wie Burgwacht). Ziel: bis ca. 400 Figuren gleichzeitig mit 30+ FPS auf einem iPhone 12 / Mittelklasse-Android. Dazu Detailstufen für Bäume und Gebäude und Qualitätsstufen (`?q=low`).

---

## 13. Technik

- **Gleiches Repo, eigene Pakete:** `talwacht/shared` (Daten, Typen), `talwacht/server` (Simulation), `talwacht/client` (Three.js).
- **Übernommen aus Burgwacht** (in ein gemeinsames Paket `common/` herausgelöst):
  - Raum-System und WebSocket-Server
  - Modell-Pipeline `tools/bake`
  - Asset-Loader, Kamera-Steuerung
  - Handy-Layout (`viewport.ts`), Post-Processing, PWA
- **Server ist maßgeblich:** Simulation mit 20 Hz. Clients schicken nur Befehle und interpolieren den Zustand (wie Burgwacht).
- **Neu:** Raster und Bauregeln, Autotiling, Flow-Field-Wegfindung mit Mauerkosten, Formationen (Schildkröte), Gegner-Kommandant, Wirtschaft, Spielstand speichern und laden.
- **Hosting:** Render (wie Burgwacht). Firebase bleibt als Alternative.

---

## 14. Etappen (jede zu zweit spielbar)

0. **Asset-Prüfung und Baukasten:** Burgteile wählen, Kalibrier-Tabelle, Galerie. Ergebnis: Mauern, Ecken, Tor, Turm sehen sauber aus.
1. **Tal und Bauen:** Eine Karte (Grüntal) mit natürlichem Gelände, Raster, Mauern ziehen mit Autotiling, Tore, Bogenturm mit Besatzung, gemeinsame Kasse, zu zweit online.
2. **Kampf-Grundlagen:** Plünderer-Wellen mit Zeitleiste, Flow-Field zur schwächsten Stelle, Kaserne und Schießplatz mit Warteschlange, Trupps steuern, Mauer besetzen (automatisch verteilt).
3. **Wirtschaft:** Holz, Stein, Nahrung, Gold, Unterhalt, Ausbau-Stufen, Reparatur.
4. **Belagerung:** Schildkröte mit Rammbock, Sturmleitern, Belagerungsturm, Pechnase, Pechgraben, Katapult, weitere Fallen, Ausfall.
5. **Gegner-Kommandant:** Budget, Wegwahl, Anpassung, Spähbericht, Technologie-Stufen, Bosse, Spezialwellen.
6. **Speichern und Fortschritt:** Spielstand, Sterne, Freischaltungen, Talente, Schwierigkeitsstufen.
7. **Inhalt und Feinschliff:** Karten 2–4, Balancing per Bot-Simulation, Sound und Musik, Nacht und Wetter.

---

## 15. Tests

- **Simulation ohne Grafik:** Bauregeln, Autotiling-Tabelle, Wegfindung (sucht die schwächste Stelle, kommt bei Vollabriegelung trotzdem durch), Mauer-Verteilung (jede Zinne höchstens ein Schütze, alle in Reichweite), Schildkröte (Pfeile von vorn fast wirkungslos, Pech wirkt), Wirtschaft, Speichern und Laden (Stand bleibt nach dem Laden gleich).
- **Bot-Matrix:** verschiedene Verteidigungs-Strategien (nur Bogen, nur Fallen, gemischt) gegen alle Wellen auf allen Karten. Ziel: Keine Einseitigkeit gewinnt alles, eine gemischte Verteidigung schafft „Normal“.
- **E2E:** Zwei-Fenster-Test und Handy-Viewports (iPhone/Android quer) mit Playwright inkl. WebKit, dazu Screenshot pro Karte und pro Bauteil-Galerie.

---

## 16. Bewusst nicht drin (vorerst)

PvP, Nebel des Krieges, Heldenfiguren mit eigenem Inventar, mehrere Gegnerfraktionen, Fantasy-Gegner, mehr als zwei Spielerinnen. Das kann später kommen, wenn das Grundspiel Spaß macht.
