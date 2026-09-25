# Swiss Grounding — Zürich V7.8

**Declared scope:** German-language MCP guidance for selected waste, recycling, moving/registration and debt-register-extract questions in the City of Zürich, using official sources with explicit clarification and coverage limits; no canton-wide or Switzerland-wide coverage, multilingual answer support, comprehensive moving checklist or individual permit decisions.

## Evaluation quick start

1. **Commit to evaluate:** the latest submitted commit on `main`, release **V7.8 / 0.6.0**. Record its exact SHA when beginning evaluation. The archive does not claim an existing GitHub commit.
2. **Transport:** standard MCP over **stdio**. Exactly two public tools: `get_zurich_guidance` and `get_swiss_moving_coverage`.
3. **Runtime:** **Node.js >=20.19 and npm**; no additional system packages. Internet access is required for live official-source retrieval. Automated execution was verified on Node 24/Linux; Windows was not directly executed here.
4. **Setup:** run `npm ci` in the repository root. A clean Linux installation took approximately 11 seconds; installed dependencies occupied about 25 MiB and bundled data about 11 MiB. These are observations, not performance guarantees.
5. **Start command:** `node src/mcp.js`. Configure this as a subprocess in a stdio MCP client, using the absolute script path. It waits for MCP protocol messages, not typed chat questions.
6. **Prebuilt data:** `data/zurich-geo.json`: **180 station records, 56,709 address records, 1,243 cardboard-calendar rows for 2026**. Rebuild with `npm run refresh:geo` followed by `npm run refresh:locations`. Snapshots expire after seven days and must match the current year; refresh before evaluating an expired snapshot. Builders and source metadata are included.
7. **Credentials:** **none for the MCP server**. A Swisscom event key is required only by the optional Apertus web demonstration and live model smoke test. No credentials are included.
8. **Hosted endpoint:** **none**. MCP runs locally over stdio. The optional web demonstration runs on loopback and is not publicly hosted.
9. **Declared scope:** topic **#4 Waste collection & recycling** and **#5 Moving/registration**, selected procedures only, plus debt-register-extract guidance. Geography: **City of Zürich**, not the canton or other municipalities. Answer language: **German (DE)**. Recognized FR/IT/RM input is declined explicitly; recognition is a bounded heuristic, not a multilingual-support guarantee.
10. **Example call:** tool `get_zurich_guidance`, arguments `{"question":"Wo kann ich bei der Seefeldstrasse 102 in der Stadt Zürich Büchsen entsorgen?"}`. With valid data, returns status, answer, three matching metal stations, coordinates, map links and sources. The optional UI renders the map; MCP supplies its data. For follow-ups, pass the latest returned `contextToken` with the next question. Call `get_swiss_moving_coverage` with `{}` for coverage metadata.
11. **Known limits:** no footpath routing, live opening/operating status, verified nearest PET/battery retail branch, automatic eUmzug eligibility decision, permit decision or comprehensive moving checklist. Household-battery guidance includes two source-verified municipal yards and an external finder, not a complete retail-location database. FR/IT/RM answers are unsupported. Live Apertus and visual browser rendering were not verified in this release run.
12. **robots.txt/Terms:** `RESPECT_ROBOTS=true`, `RESPECT_TERMS=true`, `USE_MODE=private` by default. The two respect flags are independently configurable through environment variables for controlled evaluation. Disabling a check does not grant reuse rights; public reuse needs a source-terms review.
13. **Parallel use:** independent conversations use separate context-token chains; carry forward the latest token within the same server process. Tokens expire after one idle hour; context retention is bounded to 200 records per state store. Retrieval uses bounded concurrency and caching. Measured MCP initialization was approximately 223 ms on the local Linux runtime, not a hardware-independent guarantee. Restarting the process invalidates its tokens.

**Verification evidence:** 275 automated tests passed in a clean extracted installation; eight additional V7.8 scenarios passed through a real MCP subprocess and live official sources. Provider responses in automated tests were simulated. See `TESTBERICHT.md`, `reports/test-summary.json`, `reports/clean-install-check.json` and `reports/residence-battery-live.json`. A live Apertus pass is **not** claimed; the included provider report records missing-key/skipped execution.

Version 0.6.0. Local MCP server for the Swisscom Swiss Grounding MCP challenge. The optional Apertus browser interface demonstrates the same server. **Declared geography: City of Zürich only, not the canton.** Uster and Winterthur are not supported destinations; they may be the origin of a move to Zürich.

## Declared coverage

| Topic | Supported answer | Limits |
|---|---|---|
| Registration from another Swiss municipality | Online route to the official eligibility check, appointment route, deadline, case-specific documents, published city fee | No automatic eUmzug eligibility certification, no appointment booking |
| Registration from abroad | Correct personal-registration branch, appointment link, South office address from current official contact data, published documents | No residence-permit decisions, no personal total migration fee |
| First steps after moving | Source-bound conditional checklist for electricity/water, vehicle, dog, self-employment and insurance after arrival from abroad | Not an exhaustive Switzerland-wide checklist; individual exceptions and downstream forms need official confirmation |
| Move within Zürich | Separate city procedure, online prerequisites, deadline, North/West appointment route, documents | No automatic form submission; variable fees not calculated |
| Recycling | Official glass, metal, oil and textile stations by district/postcode or straight-line distance from an official address | No walking routes, opening-hours status, retail PET/plastic acceptance |
| Batteries | Source-backed retailer return rule, two municipal yards verified for household batteries, map coordinates and external finder; prior location retained | Not a complete battery-return database; no verified nearest retail branch or branch hours; ordinary metal containers are not reused |
| Cardboard | Official postcode calendar and separately sourced preparation-time rule | No real-time collection state or building-specific operational exceptions |
| Debt-register extracts | Official order methods, standard fee, third-party-interest condition, correct jurisdiction principle and office-finder link | Does not assign the new flat to a historical register query; exact office address not automatically resolved |
| General waste rules | Source-gated Züri-Sack, paper, bio waste, bulky waste/coupon correction, electronics, hazardous waste, plastic bags and PET return | No invented branches or exact non-cardboard collection dates |
| Recycling yards | Both city yard addresses and published regular hours; household-battery results can order these two yards by air distance from a confirmed address | This limited subset does not establish the nearest acceptance point city-wide; no live open-now status or holiday guarantee |
| Additional moving duties | Explicit evidence gaps for postal forwarding, private address notifications, handover protocols and service obligations | Not silently answered with the registration procedure; these additions are not verified |

German dialogue paths are tested. Recognizable FR/IT/RM/EN input is declined with a language reason; detection is a bounded heuristic, not a universal language detector. The main tool accepts an optional topic hint. Other national languages have **not** received an end-to-end answer-quality evaluation. Geography and language limitations remain separate. Do not claim every possible moving question.

## Quick start

Requires Node.js >=20.19. Open a terminal in this repository root. For the optional browser demonstration:

```sh
npm ci
npm run web
```

`npm run web` defaults to http://127.0.0.1:4173; PORT can override it. Leave the server terminal open while using the page. On Windows PowerShell, use `npm.cmd ci` and `npm.cmd run web` if PowerShell blocks npm.ps1. Enter your Swisscom key only in the local page; it stays in server memory for the session, not a file. The web service binds to loopback only; this is not public hosting.

## MCP setup for evaluators

```sh
npm ci
npm run mcp
```

Or configure a standard stdio client:

```json
{
  "mcpServers": {
    "swiss-grounding-zurich": {
      "command": "node",
      "args": ["/absolute/path/to/Swiss-Grounding-Zuerich-V7.8/src/mcp.js"]
    }
  }
}
```

On Windows, use forward slashes or escape backslashes in JSON. The server needs internet for current administrative source retrieval; **no model API key** is needed by the MCP server. Launch paths work independently of the client's current working directory. Startup and errors use stderr, not the stdio protocol stream.

### Primary tool: `get_zurich_guidance`

Input: `question` (the original current user turn, 1–2000 characters), optional `contextToken` from the previous call, optional `topic` (`registration`, `debt_extract`, `waste`). The token is opaque, local to this server process and expires after one idle hour. It contains no visible personal data. It must not be shared across people/conversations.

Output includes:

- `status`: `ok`, `partial`, `needs_clarification`, `out_of_scope`, `unavailable`, `no_matches`, or `invalid`.
- `answer`: complete fallback text; custom visual widgets are not required.
- `pending_question`: an explicit `{field, reason, options}` or `null`. Short replies are interpreted only against that field, before normal routing. Origin corrections do not infer citizenship. Invalid replies retain the question; explicit topic changes supersede it.
- `dataAvailability`: when present, identifies missing acceptance/nearest-branch data separately from a geographic scope error.
- `nextQuestion`, `missingFields`, `options`: ask exactly for the missing information; call this tool again with the reply and context token.
- `context`: supplied/confirmed context. An administrative address can still be labelled `user_provided`; proximity answers separately verify the official address.
- `claims`: civic facts, conditions, source URL and passage ID. A successful fetch is not automatically a supported fact.
- `cards`, `actions`, `sourceLinks`: compact display data, verified service links and source provenance.
- `results`, `origin`, `sortMode`, `calendar`: optional official waste/location data, with limits.

Both JSON text content and `structuredContent` are returned. A schema describes the common result fields. Preserve conditions, negative results and uncertainty if translating or rephrasing. Do not turn a source link into a confirmed eligibility decision.

Exactly two MCP tools are registered: `get_zurich_guidance` for every factual question/follow-up and `get_swiss_moving_coverage` for metadata. The three older MCP tool names are intentionally no longer registered. Their internal retrieval/location modules and the direct browser search remain available. **Use the primary tool for a whole conversation.** A legacy client must select this primary tool; its input signature is unchanged.

The server itself selects the procedure and requests missing context. These rules do not depend on our UI or on Apertus. A foreign client remains responsible for forwarding context, preserving conditions and displaying the result faithfully; MCP alone cannot guarantee what every model says. An open checklist question retrieves the official Zürich "Erste Schritte" page; facts are displayed only when their exact supporting clauses are present. A missing page yields a partial answer, not a memorized checklist.

## Evidence and fail-closed behaviour

Administrative rules are matched against current official pages. Inbound domestic, inbound foreign and intra-city procedures have separate conditions. Missing source clauses produce partial/unavailable results instead of remembered legal claims. The original registration failure is a permanent regression test: house number does not replace origin; domestic registration is not falsely forced to Zürich Süd.

The extractor reads visible HTML plus a bounded public `stzh-contact` component address and inert `stzh-datatable` JSON cells. Table rows/cells/strings are capped and parsed as text; nested scripts remain excluded. Scripts are not executed. Source text is untrusted data. It cannot change the fixed registry or request secrets.

Geodata snapshot: 180 published stations, 56,709 existing address records, 12 district boundaries used during import, 1,243 calendar rows for 2026; download time and hashes are in `data/zurich-geo.json`. Source licences: CC0. Address coordinates are label positions, not guaranteed entrances. Ranking is rounded straight-line distance among matching published records, including points across postcode/district boundaries.

Rebuild the shipped data:

```sh
npm run refresh:geo
npm run refresh:locations
```

`DATEN-AKTUALISIEREN.cmd` rebuilds the main geodata/calendar. The second command updates the legacy PLZ adapter. Snapshots expire after seven days and must match the current year. Builders are included; failed updates preserve existing files but do not make stale data fresh.

## Source policies and configuration

`RESPECT_ROBOTS=true` and `RESPECT_TERMS=true` by default. Each can independently be set to `false` for a controlled evaluator run as requested by the challenge. `USE_MODE=private` is the default local-reference mode. Public reuse requires a source-terms review; setting `USE_MODE=public` makes that need explicit. Policy records expire after 90 days. These settings do not grant a licence to third-party HTML.

HTML retrieval is bounded, times out, follows only same-origin redirects and uses a five-minute memory cache. Geodata downloads use an official-host allowlist and atomic replacement. Runtime source failures remain visible. We do not ship copied full administrative pages.

## Optional Apertus demonstration

`APERTUS-TEST.mjs` and the browser chat call the fixed Swisscom endpoint `https://api.swisscom.com/products/swiss-ai-weeks/apertus-1.5-70b/v1/chat/completions`, model `swiss-ai/Apertus-v1.5-70B`. Access depends on your event key and provider availability.

Apertus is asked to call the primary MCP tool. If it instead returns text without a tool call, the application invokes the same read-only guidance tool itself through the real MCP client. No second model retry is needed. The trace identifies `initiatedBy: model` versus `application_fallback`; a host-initiated call is not claimed as successful native model tool calling. No fabricated assistant/tool-call pairs are sent to the provider. Private conversation tokens are retained locally for both paths. Provider authentication/network errors still surface as errors. The demonstration forwards the actual user turn and ignores invented model arguments. The browser optionally requests a second model call to compose the answer from complete, unchanged server fact blocks. A strict local validator rejects added, omitted or altered blocks, changed conditions/numbers, unexpected fields and unsafe reordering. Neutral introductory phrases are allowlisted; the sources line is generated from server URLs. This is controlled composition, **not arbitrary free paraphrasing**. A prompt alone would not guarantee factual fidelity. The original answer and fields remain expandable in the UI; coordinates/maps remain server-derived. Invalid composition or a second-call provider failure falls back to the original answer. The composition stage has a 20-second provider timeout; it can be switched off in the browser for speed. It does **not** prove that another client's free generation will always obey evidence.

Normal browser/interactive conversations, keys and MCP context stay in memory; the key is not passed to the MCP child. Sessions are separated, expire after one idle hour, and support key removal/reset/cancellation. Requests use origin/host/CSRF checks. A conversation is limited to 20 user turns. User questions and tool evidence are sent to Swisscom; OSM background tiles reveal the displayed map area to OpenStreetMap. Maps show attribution; no offline tile prefetch occurs.

## Verification

```sh
npm test
node scripts/check-package.js
npm run check:mcp-live
npm run check:sources
```

Automated tests use synthetic evidence for case/fault tests and the real CC0 snapshot for geometry; MCP/HTTP transport is real and model responses are simulated. Source snapshots in integration checks intentionally expire; refresh both datasets when needed. The live dialogue script checks official sources through a real MCP subprocess. It uses no LLM or secret and records `reports/dialogues-live.json`.

The V7.7 regression tests reproduce a provider returning no tool calls and the exact Bleicherweg question through the HTTP chat and real MCP process, including city confirmation, house number, nearest-point coordinates, mixed native/host turns, and material changes. This explicitly simulates the provider failure observed in the screenshot, not a live Apertus evaluation.

A second independent JSON-RPC client verifies the exact two-tool list, primary clarification and structured results without the client SDK. These are **not** Swisscom's undisclosed evaluation clients. See `TESTBERICHT.md` and the current reports for actual results and remaining verification limits.

### Live Apertus smoke test

Windows: double-click `APERTUS-LIVE-TEST.cmd`, enter the event key at the hidden prompt, and leave the window open until the report is written. Alternatively, with `SWISSCOM_API_KEY` set locally, run `npm run test:apertus-live` or `node APERTUS-TEST.mjs --live`.

Five scenarios share one conversation; the Seefeldstrasse scenario contains two turns, so there are six fixed user inputs. Real provider calls and the real MCP subprocess are used. The report records caller origin, result status, source presence, map-coordinate availability, formulation validation and metrics. Failures are caught per scenario and do not stop later rows. No key, private context token, free-form private conversation or full provider reply is saved. The explicit smoke test writes only its fixed public questions and result metadata to `reports/apertus-live.json`. No key produces five `not_run` rows and exit code 2, not an alleged pass. Provider/test failure gives exit code 1; a passed smoke run gives 0. A CLI cannot observe a rendered browser map: `mapRendered:null` is deliberate; `mapDataAvailable` is separate. Browser rendering needs a browser check.

The live script alone is not an exhaustive quality evaluation. Initial provider authentication/connectivity failures remain explicit; only an optional formulation failure can fall back to already retrieved MCP facts.

## Submission

Provide a GitHub repository with evaluator access, source, lockfile, data, rebuild scripts, tests and this declared scope. Exclude `node_modules`, credentials and private conversations. Hosted operation is optional; source must run locally. No myAI integration is claimed.

Challenge: https://github.com/Swiss-ai-Weeks/swisscom-2026/tree/main/swiss-grounding-mcp

### V7.7 clarification and evidence decisions

General waste rules answer for the explicitly declared Zürich scope without asking for a house number. A precise collection date/nearest station still requires the applicable location. Different materials can be selected one at a time; source-backed general advice and missing location data are separate. A supplied place outside Zürich is never silently replaced by Zürich.

Scope errors distinguish another municipality, a canton-wide request and recognized non-Swiss destinations. Origin countries never imply citizenship. A foreign-language question is not treated as a foreign municipality.

Eleven additional pages from the **same municipal authority** use the existing registry, retrieval policy and source-matching code. No new dependencies, external map/geocoding services or retailer APIs were added. This resolves the input brief's conflicting requests to expand source-backed topics while adding no sources: breadth is limited to those municipal pages, and unsupported additional moving procedures are explicitly left as evidence gaps.

Corrections to the supplied brief: the city recommends **three** working days' lead time for paid pickup; abolished free coupons are not automatically equivalent to sold disposal stickers; the mobile recycling service can be free subject to conditions. Source clauses, not prompt assumptions, decide the answer.

The optional smoke scenarios are domestic move, foreign nationality follow-up, Seefeldstrasse → 102, bulky-waste coupons and Konstanz. Battery follow-up remains in the automated and source-integration regressions.


## Hotfix V7.7.1: minimum location needed by the task

- General cardboard preparation needs no personal address. Existing other general waste rules keep their separate source-backed path.
- Cardboard dates use a **postcode**. One postcode for a known street is resolved automatically; a multi-postcode street (Langstrasse: 8004/8005) offers postcode buttons. House numbers are not validated for this path. A previously confirmed map point can be retained but is not required.
- Nearest glass/metal/oil/textile points still require a verified address for coordinates. A missing address record is a data gap, not evidence that the address does not exist. A postcode overview is offered as an alternative without distance ranking.
- `locationResolution` documents `none`, `postcode` or `address` in waste results; `calendar.locationBasis` distinguishes a confirmed prior point, a street postcode and a user postcode. A postcode calendar does not certify an unverified house number. The original MCP signatures and two-tool registry remain unchanged.
- Clarifications skip the optional second model call. The original question, choices, source links and execution trace remain available.
- **Scope correction to the patch brief:** paper/bio/household-waste dates are not in the loaded cardboard calendar. Their existing rules link to the official personal calendar; this hotfix adds no date dataset and does not promise postcode-derived paper dates. No new `complete` status: existing `ok`/`partial` semantics remain.

Reproduce: `Wann kann ich an der Langstrasse Karton entsorgen?` → select `PLZ 8004` or `PLZ 8005` → dated calendar result. The missing house numbers 56/102/130/145 must never block this path. Run `npm run check:postcode-live` for the real MCP/current-source regression without a model key.


## V7.8: batteries, citizenship, permits and children

Household-battery answers now fetch the municipal recycling-yard acceptance table and contacts. If both are verified, Looächer and Werdhölzli are shown with exact official address points. Distances, when a confirmed origin exists, sort this **two-yard subset only**, not all battery collection locations. Retailers may be closer. A Recycling-Map action opens its own search; choose the material there. No retailer database is copied: Recycling-Map's data-reuse terms require an agreement with IGORA. No agreement is assumed. No address is sent to that website by the server; a validated postcode is included only in the link opened by the user.

Registration tracks Swiss/foreign origin, explicitly stated citizenship group, permit type and children separately. A baby does not mean permit B. Italian citizenship plus an existing B/C/L permit and a Swiss origin activates an additional live, clause-gated SEM mobility/address-update card. Origin alone does not establish citizenship. Other permit categories and non-EU cases are explicitly incomplete and referred to the Migrationsamt; no personal eligibility, validity or renewal is decided. Children's birth certificates are named when supported by the municipal document list.

New SEM source: public HTML FAQ, source attribution and retrieval date retained, in-memory reference retrieval through the same robots/terms checks. Fixed URL only. No form submissions. SEM authority is preserved in the optional Apertus adapter. See `docs/V7.8-SZENARIEN.md` and `reports/residence-battery-live.json` for the exact test scope.
