# Burgwacht – Design (Arbeitstitel)

Kooperatives 3D-Burgverteidigungsspiel für zwei Spielerinnen, Online-Multiplayer im Browser.

## Ziel
Zwei Personen verteidigen gemeinsam eine Burg gegen Gegnerwellen. Jede spielt auf einem eigenen Gerät, auch aus der Ferne. Inspiration: Roblox „Commander Army" (verschiedene Truppentypen mit Stärken/Schwächen).
Anspruch: hochwertig, professionell, **cozy** (warme Farben, weiches Licht, freundliche Figuren), viel Spiellogik, mehrere Maps und Szenarien.

## Annahmen
- Läuft im Browser (Link teilen, keine Installation).
- Grafik: stilisiertes Low-Poly mit CC0-Assets (Kenney, Quaternius u. a.), keine Fotorealistik.
- Hosting ist Sache der Nutzerin/des Nutzers; lokal entwickeln wir mit eigenem Node-Server.

## Spielablauf
- Runde = mehrere Wellen. Vor jeder Welle **Aufstell-Phase**: Gold ausgeben, Truppen kaufen und platzieren.
- **Kampfphase**: RTS-Steuerung von oben (Trupp wählen, bewegen, angreifen, Position halten) plus 1–2 Fähigkeiten pro Spielerin (z. B. Pfeilhagel, Heilen).
- Niederlage: Burg zerstört. Sieg: alle Wellen überlebt. Nach jeder Welle Gold für Truppen/Upgrades.

## Truppen und Konter
- Von Anfang an 8 Truppentypen: Ritter (robust, Nahkampf), Bogenschützen (Fernkampf, zerbrechlich), Speerträger (stark gegen Reiter), Reiter (schnell, stark gegen Bogenschützen), Armbrustschützen (hoher Schaden, langsames Nachladen, durchschlägt Rüstung), Magier (Flächenschaden), Heiler (heilt Verbündete im Umkreis), Katapult/Belagerung (Reichweite, stark gegen Gebäude).
- Werte: Leben, Rüstung, Schaden, Reichweite, Tempo, Kosten, Moral. Konter-Multiplikatoren zwischen Schadens- und Rüstungsarten in einer Datendatei.
- Formationen (Linie, Keil, Block), Trupp-Befehle (Angriff, Halten, Rückzug, Verfolgen) und Gelände-Boni (Hügel, Wald, Mauer).
- Aufwertung: Truppen leveln im Kampf, Upgrade-Baum pro Typ.
- Gegner: Fußsoldaten, Bogenschützen, Reiter, Rammböcke, Katapulte, Schamanen (buffen), Bosse mit Sonderverhalten und Phasen. Mehrere Gegnerfraktionen mit eigenem Stil.
- Wellen mit Mischung, Richtungswechseln und Spezialereignissen (Nacht, Nebel, Sturm).

## Architektur
- **Client** (Three.js, TypeScript, Vite): Rendering, Kamera, Auswahl/Befehle, UI.
- **Server** (Node.js, `ws` WebSocket, eigenes Raum-System): autoritativer Spielzustand, Kampf, KI, Wellen. Clients senden Befehle, empfangen Zustand.
- **Shared**: Truppenwerte, Regeln, Wellen- und Map-Definitionen (Datendateien), von beiden Seiten genutzt.
- Verbinden: Raum erstellen, Code/Link teilen.

## Inhalte
- Maps/Szenarien als Datendateien, damit neue Maps wenig Aufwand sind.
- Visueller Stil: warme Palette, weiche Schatten, leichte Tageszeit-Stimmung, freundliche Animationen.

## Tests
- Spiellogik (Kampf, Konter, Wellen) als reine Funktionen mit automatischen Tests, ohne Grafik.
- Multiplayer manuell mit zwei Browserfenstern.

## Stufenplan
1. Grundgerüst: Karte, Burg, Kamera, zwei Spielerinnen im Raum.
2. Erste spielbare Stufe: alle 8 Truppentypen, Konter-Logik, Formationen/Befehle und gemischte Gegnerwellen.
3. Gegnerfraktionen, Bosse, Gelände, Wetter/Ereignisse.
4. Mehrere Maps, Szenarien, Upgrades, Charaktere.
5. Politur: Animationen, Sound, Effekte.

Dieses Dokument deckt das Gesamtvorhaben ab; jede Stufe bekommt einen eigenen Implementierungsplan.
