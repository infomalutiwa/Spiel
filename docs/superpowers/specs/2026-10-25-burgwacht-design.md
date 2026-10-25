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
- Start: Ritter (robust), Bogenschützen (Fernkampf, zerbrechlich), Speerträger (stark gegen Reiter), Reiter (schnell, stark gegen Bogenschützen).
- Werte: Leben, Schaden, Reichweite, Tempo, Kosten. Konter-Multiplikatoren in einer Datendatei.
- Gegner: eigene Typen (Fußsoldaten, Katapulte, Bosse mit Sonderverhalten).

## Architektur
- **Client** (Three.js, TypeScript, Vite): Rendering, Kamera, Auswahl/Befehle, UI.
- **Server** (Node.js, Colyseus): autoritativer Spielzustand, Kampf, KI, Wellen. Clients senden Befehle, empfangen Zustand.
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
2. Ritter + Bogenschützen gegen eine einfache Welle (erste spielbare Stufe).
3. Mehr Truppen, Konter-Logik, Gegnerarten.
4. Mehrere Maps, Szenarien, Upgrades, Charaktere.
5. Politur: Animationen, Sound, Effekte.

Dieses Dokument deckt das Gesamtvorhaben ab; jede Stufe bekommt einen eigenen Implementierungsplan.
