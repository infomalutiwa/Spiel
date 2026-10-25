# Burgwacht 🏰

Ein kooperatives 3D-Burgverteidigungsspiel für zwei – gespielt im Browser, jede auf ihrem eigenen Gerät.
Gegnerwellen greifen eure Burg an; ihr kauft Truppen, stellt sie auf und führt sie im Kampf.
Acht Truppentypen mit Stärken und Schwächen (Speerträger gegen Reiter, Reiter gegen Bogenschützen, Armbrust gegen Rüstung …),
Formationen, Fähigkeiten und zehn Wellen in einer gemütlichen Low-Poly-Welt.

## Starten

```bash
npm install
npm run dev        # Server (Port 2567) + Client (http://localhost:5173)
```

1. Eine öffnet `http://localhost:5173` und klickt **Neues Spiel starten** → bekommt einen 4-Buchstaben-Code (und einen Link).
2. Die andere öffnet den Link oder gibt den Code unter **Beitreten** ein.
3. Sobald ihr beide drin seid, geht's los. Bricht eine Verbindung ab, pausiert das Spiel; mit demselben Code könnt ihr wieder einsteigen.

Für den echten Betrieb (z. B. auf einem Server, über das Internet):

```bash
npm run build      # baut den Client nach client/dist
PORT=8080 npm start  # ein Prozess: liefert Client + WebSocket auf demselben Port
```

Hinter einem Reverse-Proxy (nginx, Caddy, …) muss WebSocket-Weiterleitung aktiv sein. Bei HTTPS nutzt der Client automatisch `wss://`.

## Spielablauf

- **Aufstellphase** (40 s oder bis beide „Bereit" sind): Truppen kaufen (Karte unten anklicken, dann auf die helle Fläche klicken), mit Rechtsklick umplatzieren. Oben seht ihr, was als Nächstes kommt.
- **Kampf**: Truppen auswählen (Klick, Box ziehen, Doppelklick = alle gleichen), mit Rechtsklick bewegen oder angreifen, Formation wählen.
- Nach jeder Welle gibt's Gold, die Truppen werden geheilt. Fällt die Burg, ist das Spiel verloren; überlebt ihr alle 10 Wellen, habt ihr gewonnen.

| Taste | Aktion |
|---|---|
| Klick / Box ziehen / Doppelklick | auswählen |
| Rechtsklick | bewegen · Feind anklicken = Ziel angreifen · in der Aufstellphase: platzieren |
| `A` + Klick | Angriffsmarsch |
| `H` / `X` | Position halten / Rückzug |
| `1` `2` `3` | Formation Linie / Keil / Block |
| `Q` / `E` | Pfeilregen / Anfeuern (Fähigkeit, Ziel anklicken) |
| `Leertaste` | bereit (Aufstellphase) |
| Pfeiltasten, Mausrand, Mausrad | Kamera |
| `Strg+A`, `Esc` | alle auswählen / abbrechen |

## Aufbau

```
shared/   Typen und Datentabellen (Truppen, Konter, Wellen, Karten)
server/   deterministische Simulation (20 Hz) + WebSocket-Räume (ws)
client/   Three.js-Client (Vite): Szene, Einheiten, Effekte, Steuerung, HUD
e2e/      Zwei-Fenster-Smoketest
docs/     Design-Spec und Implementierungsplan
```

Der Server ist maßgeblich: Clients schicken nur Befehle, der Server rechnet Kampf, KI und Wellen. Neue Truppen, Konter-Werte,
Wellen und Karten sind reine Datendateien in `shared/src/data/`.

## Tests

```bash
npm test                      # Simulation, Server-Räume, Daten, Interpolation, Balance
npm run dev                   # in einem zweiten Terminal …
node e2e/smoke.mjs            # … Zwei-Fenster-Test (braucht playwright + Chromium)
npx tsx server/scripts/balance.ts   # Balance-Bericht mit Beispiel-Armeen
```

`?gallery` an die Client-URL hängen zeigt alle Truppen- und Gegnermodelle nebeneinander.

## Grafik

3D-Modelle für Burg, Bäume, Blumen und Belagerungswaffen: Kenney Castle Kit und Nature Kit (CC0, siehe `client/public/assets/CREDITS.md`).
Truppenfiguren, Gelände, Himmel und Effekte werden im Code erzeugt.

## Wie es weitergeht (Stufen 3–5 der Spec)

Gegnerfraktionen und Bosse, Gelände-Boni, Wetter/Nacht, weitere Karten und Szenarien, Upgrade-Baum, Charaktere, Sound und Musik.
