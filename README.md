# Burgwacht 🏰

Ein kooperatives 3D-Festungsspiel für zwei – gespielt im Browser (Handy, Tablet oder Rechner), jede auf ihrem eigenen Gerät.
Die Angreifer kommen über **eine** Straße zum Tor eurer Festung. Ihr stellt **Trupps** auf die Mauerkrone und ans Tor, baut die Mauern aus,
und wenn das Tor bricht, verteidigt ihr drei Kontrollpunkte bis zum König. Acht Truppentypen, drei Karten, zwölf Wellen, gemütliche Low-Poly-Welt.

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

## Kostenlos online stellen (Render)

Ein einziger Dienst liefert Client und Spielserver, ohne eigene Domain und ohne Kreditkarte:

1. Auf https://render.com mit dem GitHub-Konto anmelden.
2. **New → Blueprint**, das Repo `Spiel` wählen (die `render.yaml` wird erkannt), **Apply**.
3. Nach dem Build läuft das Spiel unter `https://burgwacht-xxxx.onrender.com`. Den Link schickst du deiner Freundin.

Der Gratis-Tarif schläft nach ca. 15 Minuten ohne Verkehr ein; das erste Laden danach dauert etwa eine Minute. Während ihr spielt, bleibt er wach. Beim Einschlafen gehen offene Räume verloren.

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

- **Aufstellphase** (40 s oder bis beide „Bereit" sind): Truppen werden als **Trupps** gekauft (10 Bogenschützen, 8 Speerträger, 6 Ritter, 5 Reiter, 6 Armbrustschützen, 4 Magier, 3 Heiler, 1 Katapult). Karte unten antippen, dann in den Hof tippen – oder bei Fernkämpfern auf die **goldene Mauerkrone**. Pro Spielerin gibt es **30 Armee-Plätze** (ein Katapult zählt drei). Oben seht ihr, was als Nächstes kommt.
- **Die Festung:** zwei Mauerringe mit je einem Tor und Türmen. Gegner kommen nicht durch, solange Mauer und Tor stehen. Fußvolk greift das **Tor** an, **Rammen** und **Wurfmaschinen** auch Mauern und Türme. Mauer, Tor und Turm antippen: **verbessern** (Stufe 1–3), **reparieren** (auch im Kampf), **wiederaufbauen** (nur in der Aufstellphase).
- **Mauerkrone:** Fernkämpfer auf einer Mauer oder einem Turm schießen 30 % weiter, treffen 10 % härter, haben Deckung gegen Fernkampf, und Schwertkämpfer kommen nicht an sie heran. Fällt das Mauerstück, stürzen sie hinunter.
- **Katapulte** stehen hinter der Mauer und schießen über sie hinweg (Reichweite 30) – besonders gegen Rammen und Gruppen am Tor.
- **Kontrollpunkte:** ① Vorhof, ② Schlossplatz, ③ Thronvorplatz. Die Gegner erobern sie der Reihe nach: Stehen mehr von ihnen als von euch in der Zone, füllt sich der Balken. Fällt der letzte Punkt oder die Burg, ist die Welle verloren. Zwischen den Wellen sind alle Punkte wieder frei, Trupps könnt ihr für Gold **auffüllen** (＋ am Trupp-Symbol).
- **Kampf:** Trupps auswählen (Tippen, Box ziehen oder Trupp-Leiste links), bewegen, angreifen, Formation wählen. Nach jeder Welle gibt's Gold, die Truppen werden geheilt, die Gebäude flicken ein Drittel selbst. Überlebt ihr alle 12 Wellen, habt ihr gewonnen.

### Rollen und Mechaniken

- **Reiter:** Sturmangriff aus dem Anlauf (≈ 1 s Laufen) richtet über doppelten Schaden an, im **Keil** (`2`) noch mehr. Sie jagen Bogenschützen, Magier und Heiler – die Reserve im Hof, wenn der Feind durchbricht.
- **Speerträger:** In **Halten** (`H`) bilden sie einen Speerwall am Tor, der Reiter fast ganz abprallen lässt.
- **Bogenschützen:** weichen beim Nachladen zurück, schießen in der **Linie** (`1`) 15 % härter. Schwere Rüstung (Eisenwachen, Grobiane) macht ihnen zu schaffen – dafür sind **Armbrust** und **Magier** da.
- **Block** (`3`): Nahkämpfer nehmen 15 % weniger Schaden.
- Gegner werden mit jeder Welle zahlreicher und ab Welle 4 und 7 erfahrener (Sterne über dem Kopf); wer zu lange herumsteht, bekommt Besuch von Eisenwachen, Rammen und Schamanen.

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
shared/   Typen und Datentabellen (Truppen, Trupps, Mauern, Konter, Wellen, Karten)
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

## Tag und Nacht

Mit jeder Welle wird es dunkler (Abend → Nacht): Sterne, Mond, Fackeln an Mauern und Toren, Lagerfeuer, Glühwürmchen. Zum Ansehen: `?night=0..1` an die URL hängen (z. B. `?night=1`).
