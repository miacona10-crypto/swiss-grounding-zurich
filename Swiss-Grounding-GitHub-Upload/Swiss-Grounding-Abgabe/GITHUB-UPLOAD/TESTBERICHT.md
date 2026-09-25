# Testbericht — Zürich V7.8

25.09.2026 · Version 0.6.0

## Änderung und Abnahme

- Die bisherigen 162 Tests aus V7.5 bleiben als fachliche Regressionen bestehen. Assertions für die drei absichtlich entfernten MCP-Werkzeuge wurden auf den primären Einstieg umgestellt, nicht als alte Fünf-Werkzeuge-Erwartung beibehalten.
- Der MCP-Server veröffentlicht genau zwei Werkzeuge. Sowohl der SDK-Client als auch ein unabhängiger JSON-RPC-Client prüfen das reale Protokoll.
- `pending_question` benennt das offene Feld und den Grund. Getestet werden mehrere Formen von Stadtbestätigung, Hausnummer, Herkunftskorrektur, Materialwechsel, Staatsangehörigkeit, Themenwechsel und widersprüchliche Angaben. Herkunft wird nicht zu Staatsangehörigkeit umgedeutet.
- Die optionale Modellaufbereitung verwendet eine überprüfte Komposition vollständiger Server-Textblöcke. Neue oder geänderte Aussagen, fehlende Einschränkungen und unzulässige Umordnungen werden verworfen. Freies Paraphrasieren mit angeblicher Null-Fehler-Garantie ist nicht implementiert.
- Die Browserantwort enthält aufklappbare originale Fakten und Quellen; Karte und Standorte stammen weiterhin aus geprüften Koordinaten. Ursprung des Werkzeugaufrufs bleibt getrennt sichtbar.
- Der Live-Apertus-Modus schreibt fünf Szenariozeilen, behandelt Fehler pro Fall und redigiert den Schlüssel. Eine fehlende Berechtigung oder fehlender Schlüssel wird nicht als Erfolg ausgegeben.

## Nachweise

**275 automatisierte Tests bestanden; keine fehlgeschlagen oder übersprungen.** Die Browser-/Karten-Sichtprüfung war durch die fehlende Browserlaufzeit blockiert; der Download dieser Laufzeit scheiterte ebenfalls. Das ist ausdrücklich kein visueller Erfolgsnachweis. Die HTTP-Tests prüfen den Antwortfluss und die Kartendaten mit echtem MCP und simuliertem Modell.

Die genaue Testzahl und Ergebnisse stehen in `reports/test-summary.json`, `reports/tests.tap` und `reports/clean-tests.tap`. `reports/clean-install-check.json` dokumentiert die Prüfung des frisch entpackten Pakets.

Zehn bisherige Dialoge und zwölf neue Fälle bestanden mit echtem MCP-Prozess und live abgerufenen offiziellen Stadtquellen: `reports/dialogues-live.json` und `reports/extended-live.json`. Diese Prüfung verwendet kein Sprachmodell.

`reports/apertus-live.json` zeigt den tatsächlichen lokalen Laufstatus. Für diesen Entwicklungsdurchlauf war **kein Event-Key verfügbar**: fünf Szenarien sind ausdrücklich `not_run`. Tests der Fehler-/Erfolgsbehandlung mit simulierten Providerantworten ersetzen keinen echten Apertus-Lauf.

Die Browserprüfung und ihre Bedingungen werden gesondert in `reports/ui-check.json` protokolliert. Ein CLI-Test kann eine sichtbare Karte nicht bestätigen: `mapRendered:null` ist deshalb korrekt, während `mapDataAvailable` die Koordinaten bezeichnet.

## Grenzen

- Regex und endliche Wertemengen bleiben Kern der Spracherkennung. Der Resolver organisiert und validiert Antworten; er ist kein universelles Sprachverständnis.
- Keine verifizierte nächste Batterie-/PET-/Plastikfiliale und keine Filialöffnungszeiten. Eine allgemeine Batterie-Rückgaberegel bleibt von konkreten Annahmestellen getrennt.
- Luftlinie statt Fusswegrouting; keine aktuellen Betriebsmeldungen.
- Andere Landessprachen sind nicht Ende zu Ende geprüft.
- Windows-Ausführung steht in dieser Linux-Umgebung nicht zur Verfügung.
- Kein Nachweis für jedes denkbare Modell oder jeden MCP-Client. Andere Clients müssen den Kontext-Token fortsetzen und Quellenbedingungen erhalten.
- Native Apertus-Werkzeugwahl ist von einer durch die Anwendung abgesicherten MCP-Abfrage unterschieden. Beide Pfade sind technisch getestet, die Providerantworten in automatischen Tests simuliert.
- Kein automatisches GitHub-Publishing oder Einreichen bei der Jury erfolgt.

## Erweiterung V7.7

- Alle 192 Tests des Ausgangsstands bleiben erhalten, dazu 35 neue Tests. Genau zwei öffentliche MCP-Werkzeuge.
- Neue source-gated Regeln für Sperrgut/Coupons, Elektrogeräte, Züri-Sack, Papier, Bioabfall, Kunststoff, PET, Sonderabfall, Hofadressen/regelmässige Zeiten und Kalenderzugang.
- Inerte amtliche Preistabellen werden begrenzt als Text ausgewertet. Geänderte Preise oder fehlende Klauseln erzeugen Teilantworten; keine Ausführung fremden Komponentencodes.
- 22 reale MCP-/Quellenprüfungen bestanden. Zwei davon prüfen ausdrücklich Abgrenzung statt einer Sachauskunft.
- Andere Gemeinde, Kanton und bekannte nichtschweizerische Ziele werden getrennt behandelt. Satzzeichen nach Zürich und „nach meinem Umzug nach Konstanz“ sind Regressionen.
- Sprachabsagen sind heuristisch. Dialekt wird nicht pauschal abgelehnt; eine vollständige Dialekt- oder Fremdsprachenunterstützung ist nicht belegt.
- Die promptseitige Angabe „10 Arbeitstage“ wurde anhand der Quelle auf drei Arbeitstage **Empfehlung** korrigiert. Der mobile Recyclinghof ist nicht pauschal kostenpflichtig. Herkunft Deutschland impliziert keine Staatsangehörigkeit.
- Postalische Nachsendung, private Adressmeldungen, Übergabeprotokolle und Militär/Zivildienst/Zivilschutz sind **nicht** als neue verifizierte Verfahren ausgeliefert. Der Server benennt die Lücke, statt frühere Anmeldeantworten zu wiederholen.
- Zusätzliche Quellen sind elf Seiten derselben städtischen Domain, keine neuen externen APIs oder Abhängigkeiten. Das vollständige Nachsendepaket aus dem widersprüchlichen Brief ist damit ausdrücklich nicht behauptet.
- Keine Berechnung des nächsten Recyclinghofs; veröffentlichte Hofzeiten sind keine Live-Öffnungsprüfung. Kein Anspruch auf Fehlerfreiheit oder garantierten Wettbewerbserfolg.


## Hotfix V7.7.1: Langstrasse und erforderliche Ortsgenauigkeit

Der gemeldete Fehler wurde mit dem bisherigen Server ohne Apertus reproduziert. Die Nummern 56/102/130/145 fehlen sowohl im gespeicherten als auch im erneut vollständig abgerufenen amtlichen Adressbestand (59 358 Rohdatensätze; davon 56 709 Status real). Dies beweist keine Nichtexistenz einer Adresse. Ursache der Schleife: Der Kalender durchlief unnötig die strenge Adressprüfung für Entfernungen; der Ablehnungstext behandelte eine Datenlücke falsch.

Kartontermine brauchen jetzt nur die PLZ. Eindeutige Strassen werden direkt zugeordnet, die Langstrasse fragt nach 8004/8005. Hausnummern werden in diesem Pfad nicht geprüft. Eine Auswahl führt zum Kalender; keine Koordinaten werden aus einer PLZ erfunden. Für Nähe-Suchen bleiben genaue Adressen nötig. Allgemeine Regeln brauchen keine Adresse. Papiertermine sind weiterhin nicht integriert; aus Kartonterminen werden keine Papiertermine abgeleitet.

**Nachweise für diesen Hotfix:**

- 247 automatisierte Tests, 0 fehlgeschlagen, 0 übersprungen. 20 neue Fälle zusätzlich zur vorherigen Suite mit 227 Fällen.
- Die zwei bisherigen Fehlerbehandlungs-Tests der optionalen Modellaufbereitung verwenden jetzt eine Teilantwort als Fixture, weil Rückfragen absichtlich keinen zweiten Modellaufruf mehr auslösen. Ein eigener Test prüft genau dieses Verhalten. Die Providerfehler- und Faktenprüfungen wurden nicht entfernt.
- Der gesamte gemeldete Langstrasse-Verlauf läuft im echten HTTP-Chat über den echten MCP-Unterprozess mit simuliertem Provider: PLZ-Auswahl, vier kurze Nummern, anschliessend PLZ 8004 und Kalenderantwort.
- Sechs zusätzliche Szenarien bestehen mit echtem MCP und live abgerufener amtlicher Kartonregel: Langstrasse/8004, Langstrasse/8005, eindeutige Strasse, fehlender Ort, allgemeine Kartonregel und unveränderte Glas-Nähesuche. Nachweis: `reports/postcode-live.json`.
- Die 22 früheren Live-Quellenfälle bleiben als historische Nachweise erhalten und wurden für diesen begrenzten Hotfix nicht erneut als 22 neue Erfolge gezählt.
- Kein Live-Apertus-Aufruf mit Event-Key, keine visuelle Browserprüfung und kein Windows-Lauf auf diesem Entwicklungssystem. Die neue Datei ersetzt keine dieser fehlenden Prüfungen durch eine Erfolgsbehauptung.

Keine neuen Datenquellen, Abhängigkeiten oder Werkzeug-Signaturen. Keine umfassende Fehlerfreiheitsgarantie. Die vorherige Testsuite hatte die unnötige Adressvalidierung und den fehlenden Ausweg im Langstrasse-Fall nicht abgedeckt.


## V7.8: Batterie-Annahme und persönliche Anmeldesituation

28 zusätzliche Regressionen prüfen Staatsangehörigkeit getrennt von Herkunft, B/C/L-Ausweise, fehlende Staatsangehörigkeit, Baby gegenüber B-Bewilligung, Herkunfts-/Staatsangehörigkeitskorrektur, verneinte und abgelaufene Bewilligungen, SEM-Ausfall sowie belegte Batterieannahme, geänderte Annahmetabellen und Ortskontext. Die 247 bisherigen Fälle bleiben erhalten; ein bisheriger Batterie-Datenlückentest injiziert nun explizit eine fehlende Standortquelle.

Acht zusätzliche Abläufe über einen echten MCP-Subprozess und live abgerufene amtliche Quellen bestanden. Bericht: `reports/residence-battery-live.json`. Die Schweizer und kommunale Herkunft der Quellen bleibt im Apertus-Adapter erhalten. Der Lauf testet keine tatsächlichen Modellantworten.

Batterie-Karten zeigen die zwei städtischen Recyclinghöfe für Haushaltsbatterien, keine vollständige Verkaufsstellenliste. Die Zusatzaktion öffnet Recycling-Map; deren Datennutzung durch Dritte setzt laut AGB Absprache voraus. Es wurden keine Daten aus dieser Datenbank kopiert. Beschädigte Akkus, Fahrzeugbatterien und Filialöffnungszeiten sind kein geprüfter Annahmefall. SEM-Regeln gelten im angezeigten Fall für bestehende EU/EFTA-Ausweise beim Wohnortwechsel innerhalb der Schweiz; Gültigkeit, Verlängerung und Sonderfälle werden nicht entschieden.

Die Paketprüfung wurde nach den Änderungen aus einer frischen ZIP-Extraktion durchgeführt. Kartenkoordinaten und der HTTP-/MCP-Antwortfluss sind automatisiert geprüft; keine neue visuelle Browserprüfung und keine Windows-Ausführung möglich. Alle Tests sind begrenzt, keine Fehlerfreiheitsgarantie für beliebige Fragen.
