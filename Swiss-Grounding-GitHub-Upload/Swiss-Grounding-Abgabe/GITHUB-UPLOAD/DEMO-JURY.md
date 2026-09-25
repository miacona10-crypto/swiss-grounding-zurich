# Demo für die Jury — Zürich V7.8

## Aussage

„Unser MCP-Server führt eine KI zu belegten Zürcher Auskünften. Er trennt Zuständigkeiten und persönliche Fälle, fragt nur nach entscheidenden fehlenden Angaben und zeigt Grenzen. Die Oberfläche demonstriert dieselben Ergebnisse, die ein anderer MCP-Client erhält.“

## Drei kurze Szenen

1. **Fehler vermeiden:** „Ich möchte mich an der Apollostrasse in Zürich anmelden. Wo muss ich hin?“ → Herkunft klären → Inland. Onlineweg und Termin bleiben getrennt. Frage danach nach Unterlagen und beantworte die nötige Staatsangehörigkeit. Öffne den passenden Beleg.
2. **Ortsbezug beweisen:** „Wo kann ich nahe der Apollostrasse in Zürich Glas entsorgen?“ → „20“. Drei nach Luftlinie sortierte amtliche Standorte und Karte. Danach „Wann kann ich Karton rausstellen?“: bestätigte PLZ wird weiterverwendet.
3. **Ehrlichkeit zeigen:** „Ich ziehe von Zürich nach Uster. Wo anmelden?“ Der Server gibt keine Zürcher Anweisung für Uster. Alternativ eine nicht verifizierte Öffnungszeit fragen.

Zusatz: „Ich ziehe innerhalb der Stadt Zürich um“ zeigt den eigenen Verfahrenszweig. „Wie viel kostet ein Betreibungsauszug in Zürich?“ zeigt eine direkte Antwort ohne unnötige Datenerhebung.

## So wird Qualität sichtbar

Die Demonstration zeigt den MCP-Werkzeugaufruf, fallbezogene Quellen und fehlende Angaben. Administrative Fakten sind an Bedingungen gebunden. Eine Quellenstörung darf keine erinnerte Frist hervorbringen. Der Server braucht keinen Modell-Key; Apertus ist nur der Demo-Client. Die administrativen Antworten werden in unserer Oberfläche aus den Serverfeldern dargestellt, nicht durch einen zweiten freien Modelltext ersetzt.

## Ehrlich deklarieren

Stadt Zürich, begrenzte Themen. Deutsche Gespräche getestet. Luftlinie, keine Fusswege; keine aktuellen Öffnungszeiten, kein komplettes PET-Netz, keine automatische eUmzug-Berechtigungsprüfung, keine vollständige Bewilligungsberatung. Amtssuche bei Betreibung verlinkt, keine automatische historische Zuständigkeitsentscheidung. Echte Anbieter-Modellqualität muss mit dem Eventzugang geprüft werden. Technische Tests sind keine Swisscom-Abnahme.

V7.8: Falls Apertus keinen Werkzeugaufruf liefert, löst die Anwendung den echten MCP-Aufruf aus. Dies steht im aufklappbaren Protokoll. Zeige diesen Pfad als robuste Anwendungsintegration, nicht als Beweis für erfolgreiches natives Tool-Calling des Modells.


V7.8 Zusatzdemo: „Ich ziehe aus Bern nach Zürich. Wo melde ich mich an?“ → „Ich bin Italiener und habe eine B-Bewilligung.“ Zeige die getrennten Stadt-/SEM-Quellen. Bei Batterien die zwei Höfe als begrenzte Auswahl erklären und den externen Verkaufsstellenfinder zeigen; keine Aussage „nächste Stelle der Stadt“.
