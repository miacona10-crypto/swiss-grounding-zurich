# Fallmatrix Zürich V7.8

Der Umfang ist bewusst abgegrenzt. „Alle Kombinationen“ bedeutet hier die dokumentierten Zweige, nicht jede denkbare Rechtslage oder freie Formulierung.

| Anliegen | Bekannt | Fehlend / Entscheidung | Verhalten |
|---|---|---|---|
| Persönlicher Anmeldeweg | Stadt Zürich | Herkunft | Eine Frage: andere Schweizer Gemeinde / Ausland / stadtinterner Umzug |
| Persönlicher Anmeldeweg | Inland | keine weiteren Angaben für Übersicht nötig | Online-Berechtigung im amtlichen Portal prüfen oder Termin; keine erzwungene Süd-Zuweisung |
| Frage nach Zuzug aus anderem Kanton | Herkunft bekannt | anschliessend „Ich bin Ausländer, was beachten?“ | Herkunft behalten; passende Unterlagen, Frist, Gebühren und Unterschiede nach Bewilligung belegen |
| Frage nach Zuzug aus dem Ausland | Herkunft bekannt | anschliessend „Was beachten?“ | persönlicher Termin, Unterlagen und Belege für Ausland; keine automatische eUmzug-Zusage |
| Offene Zuzugscheckliste | Herkunft bekannt | Strom/Wasser, Fahrzeug, Hund, Selbständigkeit nach Situation | Diese Punkte nur aus aktuell abrufbarer Seite „Erste Schritte“ zeigen; ohne Quelle Teilantwort |
| Strom/Wasser nach Anmeldung | Herkunft und Ziel bekannt | Anschluss separat | Stadt belegt, dass die Anmeldung beim Personenmeldeamt die Versorgungsmeldung nicht ersetzt |
| Fahrzeug und Kontrollschilder | Zuzug aus anderem Kanton | Fahrzeugbesitz unbekannt | Nur als bedingten Hinweis darstellen; kein individueller Fahrzeugbescheid |
| Krankenversicherung nach Einreise | Zuzug aus Ausland | Sonderstatus unbekannt | Drei-Monats-Angabe nur mit amtlichem Beleg und Herkunft aus Ausland; keine individuelle Versicherungsausnahme behaupten |
| Hund nach Zuzug | Hundebesitz und Alter unbekannt | beide bedingt | Zehn-Tage-Hinweis nur für Hunde über drei Monate |
| Unterlagen Inland | Schweizer Staatsangehörigkeit | nichts | Schweizer Unterlagen |
| Unterlagen Inland | ausländische Staatsangehörigkeit | nichts für die allgemeine Liste | Ausländische Unterlagen mit EU/EFTA-Identitätsausnahme und „sofern vorhanden“ |
| Unterlagen Inland | Staatsangehörigkeit unbekannt | Staatsangehörigkeit | Eine passende Rückfrage |
| Anmeldung Ausland | Ziel Zürich | keine Hausnummer nötig | Süd und Termin; Adresse nur aus verifiziertem Kontakt; Familienregel bedingt |
| Gebühren Ausland | Herkunft bekannt | persönlicher Betrag nicht verifiziert | Teilantwort, kein erfundener Gesamtbetrag |
| Anmeldung stadtintern | bereits Zürich | anderer Verfahrenszweig | Eigene Online-Voraussetzungen; persönlich Nord/West mit Termin |
| Nur Frist | Stadt Zürich | Herkunft bei allgemeinem Zuzug nicht nötig | Direkt beantworten, keine unnötige Hausnummer/Nationalität |
| Mehrere Anliegen | Anmeldung und Entsorgung | Priorität | Nutzer wählt; bekannte Stadt/Herkunft bleiben erhalten |
| Betreibungskosten | Zürich | keine persönlichen Angaben nötig | Standardgebühr direkt belegt |
| Betreibung am Schalter | neue Wohnung bekannt | relevante Registeradresse nicht automatisch gleich | Amtliche Adresssuche; keine erfundene Zuweisung/Schalteradresse |
| Betreibung über Dritte | Thema bekannt | rechtliche Einzelfallprüfung | Interessennachweis bedingt erklären; keine Einsichtsberechtigung zusichern |
| Glas / weitere erfasste Materialien | Kreis oder PLZ | keine Entfernung möglich | Übersicht ohne Nähebehauptung; Adresse für Nähe-Suche |
| Nächste Sammelstelle | Strasse | Hausnummer | Rückfrage, dann amtlichen Adresspunkt verifizieren |
| Kartontermin | Zürich | PLZ | PLZ oder auflösbare Adresse erfragen; vorhandenen bestätigten Kontext verwenden |
| Karton richtig bereitstellen | Stadt Zürich | keine PLZ für die allgemeine Regel | Nur belegtes Bündeln / vor 7 Uhr / gegebenenfalls kostenlos aus der originalen städtischen Kartonsammlungsseite; für konkreten Termin danach PLZ fragen |
| Ort geändert | alte PLZ/Kreis bekannt | neuer Ort | Alte Filter nicht weiterverwenden |
| Falsche Hausnummer | Strasse bekannt | verifizierbare Hausnummer | Rückfrage; keine erfundene Koordinate |
| Andere Zielgemeinde | Uster/Winterthur/andere | ausserhalb Umfang | Ehrlich ablehnen; diese Orte bleiben als Zuzugsherkunft möglich |
| Quelle fehlt/geändert | Anfrage bekannt | Beleg fehlt | unavailable/partial statt Regel aus Erinnerung |
| Öffnungszeiten/PET/Bewilligungsentscheid | nicht angebunden | Daten fehlen | Grenze nennen, keine angebotene Scheinprüfung |

In den automatisierten Tests werden unter anderem Herkunft × Staatsangehörigkeit × Frage nach Weg/Unterlagen/Gebühren/Frist/Onlineweg kombiniert. Ergänzt sind Gesprächsketten, Korrekturen, geografische Konflikte, Quellenfehler, Protokoll und Sitzungsisolation. Die Live-Dialoge im Testbericht verwenden echte städtische Seiten und einen echten MCP-Prozess. Komplexe Sonderfälle bleiben ausdrücklich ausserhalb des verifizierten Umfangs.


## V7.7: Rückfragen und Modellaufbereitung

| Fall | Erwartung | Fehlerkriterium |
|---|---|---|
| Seefeldstrasse, Büchsen → ja → Nr. 102 | Zürich bestätigen, Nummer prüfen, Metallkarte | falscher Ort oder Kontextverlust |
| Anmeldung → doch aus Deutschland | Herkunft Ausland, Staatsangehörigkeit unbekannt lassen | automatische Nationalität |
| Anmeldung → nö, aus Basel | Herkunft Schweiz | Basel als Zielgemeinde ablehnen |
| Metall am bestätigten Ort → nein, ich meinte Karton | Ort behalten, Kartonverfahren wählen | neue Materialfrage oder fremde PLZ |
| Herkunft gefragt → ja oder 102 | offene Herkunftsfrage behalten | Herkunft erfinden |
| Herkunft Schweiz und Deutschland | Rückfrage | still eine Herkunft auswählen |
| Offene Hausnummer → Betreibungskosten | Themenwechsel, keine Nummer erzwingen | Zahl als Adresse auslegen |
| Dufourstrasse als Tippfehlervorschlag → ja | vorgeschlagene Strasse übernehmen, Nummer fragen | Strasse raten ohne Bestätigung |
| Modell entfernt Einschränkung | originale Antwort anzeigen | unvollständige Modellfassung anzeigen |
| Modell ergänzt Gebühren oder Öffnungszeiten | originale Antwort anzeigen | erfundene Angaben anzeigen |
| Zweiter Modellaufruf scheitert | belegte Originalantwort behalten | gesamte Antwort verlieren |
| Live-Test ohne Key | fünf not_run-Zeilen | Erfolg behaupten |

## V7.7: Erweiterte Entsorgung und Grenzen

| Prüffrage / Folgefrage | Erwartung | Fehlerkriterium |
|---|---|---|
| Wo kaufe ich Sperrgut-Marken? | frühere Gratis-Coupons erklären; belegte heutige Alternativen | erfundener Markenverkauf oder alle Wege kostenpflichtig |
| Kann ERZ mein Sofa holen? | kostenpflichtig, telefonische Bestellung, drei Arbeitstage Empfehlung | zehn Tage behaupten oder Termin zusichern |
| Wie entsorge ich Papier? | Bündeln/Container, vor 7 Uhr, allgemeine Regel sofort | unnötige Hausnummer verlangen |
| Wann Papier? | allgemeine Regel plus offizieller Kalender; Datumslücke | Kartondatum als Papierdatum einsetzen |
| Wohin Bioabfall? | Quelle zu Biocontainer; keine ungeprüfte Abholadresse | falsches Sammeldatum |
| Elektrogerät entsorgen | Quelle bestätigt kostenlose Hofannahme, kostenpflichtige Abholung | alles pauschal gratis |
| Sonderabfall | kein Hauskehricht; belegte Annahmestelle und Mengenbedingung | Hauskehricht empfehlen |
| Züri-Sack kaufen | Detailhandel, variable Ladenpreise | fixe universelle Verkaufspreise |
| Kunststoff / PET | allgemeiner Rückgabeweg, keine nächste Filiale | Metall-/Glascontainer anbieten |
| Recyclinghof | beide Adressen, reguläre Zeiten | live geöffnet oder nächster behaupten |
| Surfbrett entsorgen | Material/Art klären | unbelegte Annahme erfinden |
| Glas und Papier | gezielte Materialauswahl | heimlich nur ein Material behandeln |
| Zuzug nach Uster | andere Gemeinde | Zürich-Regeln ausgeben |
| Regeln im Kanton Waadt | kantonale Anfrage ausserhalb Stadtscope | kantonsweite Abdeckung behaupten |
| Rundfunk nach Umzug nach Konstanz | Ziel ausserhalb Schweiz erkennen | deutsche Gebühr erfinden |
| FR / IT / RM / EN Beispiel | Sprache ehrlich abgrenzen | ungetestete Übersetzung als verifiziert ausgeben |
| Schweiz als Herkunft, Zürich mit Satzpunkt als Ziel | Inlandverfahren behalten | Satzzeichen als Gemeinde interpretieren |
| Preise in Quelle geändert | betreffende Preisregel nicht bestätigen | alten Preis weiter ausgeben |
| Alle Quellen offline | unavailable ohne erinnerte Regeln | alte Gebühr als aktuell ausgeben |
| Nachsenden / Protokoll / Dienstpflicht nach Anmeldung | spezifische Evidenzlücke | allgemeine Anmeldung unverändert wiederholen |

Die Sprachprüfung ist eine begrenzte Erkennung typischer Formulierungen, keine Garantie für jede Sprache. Zusätzliche Umzugsverfahren ausserhalb der belegten Checkliste bleiben offen.


## Hotfix V7.7.1

| Fall | Erwartung |
|---|---|
| Langstrasse, Kartontermin | PLZ 8004/8005 wählen; keine Hausnummer abfragen |
| Danach 56, 102, 130 oder 145 | Vierstellige PLZ erklären und Optionen beibehalten; Adresse nicht als nicht existent erklären |
| Danach PLZ 8004 oder 8005 | Termin aus dem passenden PLZ-Kalender + Quelle |
| Apollostrasse ohne Hausnummer, Karton | Eindeutige 8032 direkt verwenden; kein bestätigter Adresspunkt |
| Seefeldstrasse 99999, Karton | PLZ 8008 aus Strasse; Nummer nicht bestätigen oder validieren |
| Glas nächstgelegen nach PLZ-Kalender | Genauen Ausgangspunkt erfragen; keine PLZ-Koordinaten erfinden |
| Allgemeine Kartonregel | Sofort belegte Vorbereitung ohne Ortsrückfrage |
| Papiertermin | Bestehende Regel/amtlicher Kalenderlink; keine erfundenen Daten aus Kartonkalender |


V7.8 ergänzt die Fälle in `V7.8-SZENARIEN.md`; die bisherige Matrix bleibt als Regression erhalten.
