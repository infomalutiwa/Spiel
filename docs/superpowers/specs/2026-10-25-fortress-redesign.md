# Burgwacht – Festungs-Umbau (Design)

Auslöser: Das Spielprinzip trägt, aber das Gefühl nicht. Statt „eine Burg im offenen Feld von allen Seiten" soll es eine echte Festung sein: ein Tor, Mauern, Bogenschützen auf den Zinnen, Katapulte hinter den Mauern, und die Angreifer müssen sich Zone für Zone zum König vorarbeiten.

Vorbilder: *Bad North* (Trupps statt Einzelfiguren, Engstellen, ruhige Taktik), *Total War*-Belagerungen (Tor, Mauern, Eroberungspunkte), *Kingdom Rush* (Wellen, die man vorher sieht), *Command Army / Mini Empires* (Roblox, Truppen kaufen und führen), Outlanders-Stimmung (aufgeräumt, gemütlich).

## Spielprinzip

- **Eine Zugangsstraße.** Gegner kommen nur von Osten, auf einer Straße zum **Außentor**. Berge begrenzen die Karte, rundherum geht es nicht.
- **Zwei Mauerringe**: Außenmauer (Tor + Türme) und Innenmauer (Tor). Mauer, Tor und Turm sind echte Gebäude mit Lebenspunkten; Gegner kommen nicht durch, solange sie stehen.
  - Nur das **Tor** wird von Fußvolk angegriffen; **Rammen** und **Wurfmaschinen** brechen auch Mauern und Türme.
  - Ist ein Mauerstück oder Tor zerstört, ist die Bresche für alle offen.
- **Drei Kontrollpunkte** („Checkpoints"): ① Vorhof (hinter dem Außentor), ② Schlossplatz (hinter dem Innentor), ③ Thronvorplatz (vor dem König). Gegner erobern sie **der Reihe nach**: Stehen mehr Gegner als Verteidiger in der Zone, füllt sich ihr Balken; Verteidiger in der Zone halten ihn auf und drücken ihn zurück. Ist Zone ③ erobert oder die Burg zerstört, ist die Welle verloren. Zwischen den Wellen sind alle Zonen wieder befreit.
- **Truppen kommen als Trupps**: 10 Bogenschützen, 8 Speerträger, 6 Ritter, 5 Reiter, 6 Armbrustschützen, 4 Magier, 3 Heiler, 1 Katapult. Ein Trupp wird als Ganzes gekauft, platziert und befehligt; ein Antippen wählt den ganzen Trupp.
- **Armee-Limit 30 pro Spielerin** (Katapult zählt als 3). Gegnerwellen sind darauf abgestimmt (deutlich kleiner als vorher, dafür härter und mit Belagerungsgerät).
- **Zinnen (Mauerkrone)**: Fernkämpfer, die auf einer Mauer oder einem Turm stehen, bekommen +30 % Reichweite und +10 % Schaden, nehmen von Fernkämpfern 25 % weniger Schaden und können von Nahkämpfern nicht erreicht werden, solange das Mauerstück steht. Fällt es, stürzen sie hinunter (Schaden) und stehen dahinter.
- **Katapulte** stehen hinter den Mauern und schießen darüber hinweg (Reichweite 30), besonders gut gegen Belagerungsgerät und Gruppen am Tor.
- **Mauern ausbauen** (Gold): Stufe 1→3 für Mauer, Tor, Turm (mehr Leben, mehr Rüstung), **reparieren** (auch im Kampf), **wiederaufbauen** zerstörter Teile (nur in der Aufstellphase). Zwischen Wellen heilen Gebäude ein Drittel gratis.
- **Trupp auffüllen** (Aufstellphase): Gefallene Mitglieder eines Trupps werden gegen Gold ersetzt.
- Fähigkeiten (Pfeilregen, Anfeuern), Formationen, Rollenmechaniken (Sturmangriff, Speerwall …) bleiben.

## Karten

Alle drei Karten: Straße von Osten, zwei Mauerringe, drei Zonen, König ganz im Westen.

| Karte | Besonderheit |
|---|---|
| Sonnenwiese | Tore auf einer Achse, gerade Straße – der gemütliche Einstieg |
| Waldpass | Tore versetzt (Zickzack im Vorhof = Todeszone), dichter Wald |
| Bergfeste | Hochgebirge, zusätzliche Türme, härtere Wellen |

## Technik (Kurzfassung)

- Neue Einheitentypen `wall`, `gate`, `tower` (Gebäude, `Unit.slot` = Index in `MapDef.walls`); Stufe = `level`.
- Gegner-Routen: Waypoint-Liste pro Einheit (Tor → Zone → Tor → Zone → König); Kollision Gegner↔Gebäude über Kreise.
- `Unit.squad`, `GameState.zones`, `GameState.squads`; Snapshot bekommt `squad` pro Einheit und `zones`.
- Befehle: `buy` (Trupp), `refill`, `wall` (upgrade / repair / rebuild).
- Zinnen werden aus Position und Gebäudeliste berechnet (`shared/src/deck.ts`), Server und Client rechnen gleich.
- Client: Mauern/Türme/Tore aus dem Kenney-Castle-Kit, Zonenfahnen, Trupp-Leiste, Mauer-Panel, kompaktes Querformat-HUD für iPhone.

## Nicht in diesem Schritt

Belagerungstürme/Leitern, Bosse, Wetter, Upgrade-Baum für Truppen.
