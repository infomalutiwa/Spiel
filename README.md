# Burgwacht 🏰

Ein kooperatives 3D-Burgverteidigungsspiel für zwei – gespielt im Browser, jede auf ihrem eigenen Gerät.
Gegnerwellen greifen eure Burg an; ihr kauft Truppen, stellt sie auf und führt sie im Kampf.
Acht Truppentypen mit Stärken und Schwächen (Speerträger gegen Reiter, Reiter gegen Bogenschützen, Armbrust gegen Rüstung …),
Formationen, Fähigkeiten und zwölf Wellen auf drei großen Karten (Sonnenwiese, Waldpass, Burg im Tal) – bis zu 160 Einheiten pro Spielerin gleichzeitig – in einer gemütlichen Low-Poly-Welt.

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

## Online stellen mit Firebase

Firebase Hosting liefert nur statische Dateien – der Spielserver (WebSockets) läuft deshalb als **Cloud Run**-Dienst im selben Google-Cloud-Projekt, den Client liefert Firebase Hosting.

```bash
npm i -g firebase-tools            # einmalig; außerdem die gcloud-CLI
firebase login && gcloud auth login
deploy/firebase-deploy.sh <eure-firebase-projekt-id> [europe-west1]
```

Das Skript aktiviert die nötigen APIs, startet den Server auf Cloud Run (genau eine Instanz, da die Räume im Speicher liegen), baut den Client gegen dessen `wss://`-Adresse und veröffentlicht ihn auf `https://<projekt>.web.app`. Dafür muss im Projekt die Abrechnung (Blaze) aktiv sein. Cloud Run ist für eine dauerhaft laufende Instanz nicht kostenlos – grob ein paar Euro im Monat; wer sparen will, setzt `--min-instances 0` (dann wecken die ersten Spielerinnen den Server auf, laufende Räume gehen beim Einschlafen verloren).
Mit `ALLOWED_ORIGINS` (vom Skript gesetzt) akzeptiert der Server nur Verbindungen von eurer Firebase-Adresse.

## Spielablauf

- **Aufstellphase** (40 s oder bis beide „Bereit" sind): Truppen kaufen (Karte unten anklicken, dann auf die helle Fläche klicken), mit Rechtsklick umplatzieren. Oben seht ihr, was als Nächstes kommt und aus welcher Richtung. Die Minikarte unten rechts zeigt alles und springt per Klick.
- **Kampf**: Truppen auswählen (Klick, Box ziehen, Doppelklick = alle gleichen), mit Rechtsklick bewegen oder angreifen, Formation wählen.
- Nach jeder Welle gibt's Gold, die Truppen werden geheilt. Fällt die Burg, ist das Spiel verloren; überlebt ihr alle 12 Wellen, habt ihr gewonnen.

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
Die Truppen und Gegner sind animierte Figuren aus den KayKit-Paketen *Adventurers* und *Skeletons* (CC0); `tools/bake` rechnet sie in kompakte Animationsframes um, damit hunderte gleichzeitig gezeichnet werden können. Burg, Dörfer, Berge und Wälder stammen aus dem KayKit *Medieval Hexagon Pack*. Gelände, Himmel und Effekte entstehen im Code.

## Wie es weitergeht (Stufen 3–5 der Spec)

Gegnerfraktionen und Bosse, Gelände-Boni, Wetter/Nacht, Upgrade-Baum, Charaktere, Sound und Musik.
