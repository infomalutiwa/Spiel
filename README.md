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

- **Aufstellphase** (40 s oder bis beide „Bereit" sind): Truppen werden als **Trupps** gekauft (10 Bogenschützen, 8 Speerträger, 6 Ritter, 5 Reiter, 6 Armbrustschützen, 4 Magier, 3 Heiler, 1 Katapult). Karte unten antippen, dann in den Hof tippen – oder bei Fernkämpfern auf die **goldene Mauerkrone**. Oben seht ihr, was als Nächstes kommt.
- **Jede Spielerin hat ihre eigene Kasse:** 🪙 **Gold** (Trupps, Reparaturen, Mauern), 🪨 **Stein** (Katapult-Munition, 3 pro Schuss; gibt es jede Welle, im Shop gegen Gold tauschbar) und 💎 **Edelsteine** (selten: wenige pro Welle, mehr bei Boss-Wellen – bezahlen Truppen-Upgrades und hohe Kaserne-Stufen). Alle Zahlen stehen in `shared/src/data/economy.ts`.
- **Kaserne:** Pro Spielerin eine eigene Kaserne neben der Burg. Stufe 1–5 erhöht die Armee-Plätze (30 → 40 → 55 → 75 → 100) und das Ausbildungstempo. **Im Kampf** könnt ihr jederzeit nachkaufen (Knopf „Ausbilden"): Die Trupps werden in der Kaserne ausgebildet (Warteschlange) und marschieren von dort nach vorn.
- **Ausbau (⚒️):** Jede Truppenart hat Stufe 1–3. Auf Stufe 2 wählt ihr einen **Zweig** (z. B. Bogenschützen: *Feuerpfeile* mit Brandschaden über Zeit oder *Durchschlag*; Ritter: *Schildwall* oder *Berserker*; Magier: *Kettenblitz* oder *Frost* …). Höhere Stufen zeigen sich im Modell (Umhang in Zweigfarbe, Helmbusch silbern/golden).
- **Die Festung:** zwei Mauerringe mit je einem Tor und Türmen. Gegner kommen nicht durch, solange Mauer und Tor stehen. Fußvolk greift das **Tor** an, **Rammen** und **Wurfmaschinen** auch Mauern und Türme. Mauer, Tor und Turm antippen: **verbessern** (Stufe 1–3), **reparieren** (auch im Kampf), **wiederaufbauen** (nur in der Aufstellphase).
- **Mauerkrone:** Fernkämpfer auf einer Mauer oder einem Turm schießen 20 % weiter, treffen 10 % härter, haben Deckung gegen Fernkampf, und Schwertkämpfer kommen nicht an sie heran. Fällt das Mauerstück, stürzen sie hinunter.
- **Katapulte** stehen hinter der Mauer, werfen Steine im hohen Bogen (Flugzeit ≈ 1–2 s, sie führen sich bewegende Ziele vor) und richten **Flächenschaden** an – am meisten gegen Gruppen, Rammen und Belagerung. Sie zielen auf die dichteste Gruppe, treffen nichts näher als 12 und schießen ohne Stein nicht (Hinweis „Kein Stein!").
- **Kontrollpunkte:** ① Vorhof, ② Schlossplatz, ③ Thronvorplatz. Die Gegner erobern sie der Reihe nach: Stehen mehr von ihnen als von euch in der Zone, füllt sich der Balken. Fällt der letzte Punkt oder die Burg, ist die Welle verloren. **Fällt eine Zone, machen die Angreifer eine Belagerungspause** (≈ 22 s) – dann läuft das **Notaufgebot**: Die Kaserne bildet 2,5× so schnell aus. Zwischen den Wellen sind alle Punkte wieder frei, Trupps könnt ihr für Gold **auffüllen** (＋ am Trupp-Symbol, auch im Kampf).
- **Wellen:** 25 Wellen als **Marschkolonnen** – Reiter-Späher, Fußvolk, Bogenschützen, Schwere, Schamanen, Belagerung treffen gestaffelt über 30–60 s ein. Jede fünfte Welle bringt einen **Boss** (Kriegsherr) und mehr Edelsteine.
- **Kampf:** Trupps auswählen (Tippen, Box ziehen oder Trupp-Leiste links), bewegen, angreifen, Formation wählen. Nach jeder Welle gibt's Gold, Stein und Edelsteine, die Truppen werden geheilt, die Gebäude flicken ein Drittel selbst.

### Rollen und Mechaniken

Alle Truppenwerte und Rollen sind in `shared/src/data/troops.ts` dokumentiert.

- **Angriff:** Ein Tipp auf „Angriff" (`A`) schickt die gewählten Trupps gegen die nächste Gegner-Front – ohne Ziel antippen. **Halten** (`H`): Die Trupps bleiben dauerhaft stehen, rücken nie nach (auch nicht in der nächsten Welle) und schießen / schlagen nur, was in Reichweite kommt.
- **Ritter** spotten: Gegnerische Nahkämpfer in der Nähe greifen lieber sie an. Im **Block** (`3`) nehmen sie 15 % weniger Schaden.
- **Bogenschützen / Armbrust / Magier** halten Abstand zu Nahkämpfern („schießen und weichen", nicht in *Halten*) und wählen das verwundbarste Ziel (Schamanen, Heiler, Verwundete); Magier zielen auf die dichteste Gruppe. Schwere Rüstung macht ihnen zu schaffen – dafür sind **Armbrust** und **Magier** da.
- **Heiler** heilen zuerst den am stärksten Verwundeten in Reichweite, Umstehende ein wenig mit.
- **Reiter:** Sturmangriff aus dem Anlauf richtet über doppelten Schaden an, im **Keil** (`2`) noch mehr. Sie schwingen in die Flanke aus und jagen Bogenschützen, Magier und Heiler.
- **Speerträger:** Auf *Halten* bilden sie einen Speerwall, der Reiter fast ganz abprallen lässt, und suchen sich Reiter als Ziel.
- Gegner werden mit jeder Welle zahlreicher, zäher und erfahrener (Sterne über dem Kopf); wer zu lange herumsteht, bekommt Besuch von Eisenwachen, Rammen und Schamanen.

| Taste | Aktion |
|---|---|
| Klick / Box ziehen / Doppelklick | auswählen |
| Rechtsklick | bewegen · Feind anklicken = Ziel angreifen · in der Aufstellphase: platzieren |
| `A` | Angriff auf die nächste Gegner-Front (ohne Ziel) |
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
npx tsx server/scripts/balance.ts   # Balance-Matrix: Mono-Armeen und Mischungen gegen alle Wellen (Optionen siehe Kopf der Datei)
NODE_PATH=$(npm root -g) node e2e/mobile.mjs   # iPhone-Test: Touch-Taps und Erreichbarkeit aller Knöpfe bei 844×390, 667×375, 932×430
```

`?q=low` an die Client-URL hängen schaltet Schatten und Kulissen ab (langsame Geräte, Testbrowser ohne GPU). `?gallery` an die Client-URL hängen zeigt alle Truppen- und Gegnermodelle nebeneinander.

## Grafik

3D-Modelle für Burg, Bäume, Blumen und Belagerungswaffen: Kenney Castle Kit und Nature Kit (CC0, siehe `client/public/assets/CREDITS.md`).
Die Truppen und Gegner sind animierte Figuren aus den KayKit-Paketen *Adventurers* und *Skeletons* (CC0); `tools/bake` rechnet sie in kompakte Animationsframes um, damit hunderte gleichzeitig gezeichnet werden können. Burg, Dörfer, Berge und Wälder stammen aus dem KayKit *Medieval Hexagon Pack*. Gelände, Himmel und Effekte entstehen im Code.

## Wie es weitergeht (Stufen 3–5 der Spec)

Gegnerfraktionen und Bosse, Gelände-Boni, Wetter/Nacht, Upgrade-Baum, Charaktere, Sound und Musik.

## Tag und Nacht

Mit jeder Welle wird es dunkler (Abend → Nacht): Sterne, Mond, Fackeln an Mauern und Toren, Lagerfeuer, Glühwürmchen. Zum Ansehen: `?night=0..1` an die URL hängen (z. B. `?night=1`).
