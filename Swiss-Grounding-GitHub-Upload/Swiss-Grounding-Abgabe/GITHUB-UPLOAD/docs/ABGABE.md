# Submission package — V7.8 / 0.6.0

Upload this repository's contents to the project repository. The top level must contain README.md, package.json, src/, data/, scripts/, tests/, reports/ and web/. The README begins with the evaluator's thirteen-point quick start. Do not upload the outer ZIP or put the whole project inside a second directory.

Submit the GitHub repository URL in the event submission form and ensure evaluator access. Record the submitted main commit SHA after upload. This package does not publish a repository, create a commit or submit the event form.

Included: source, pinned lockfile, public data/provenance, rebuild scripts, synthetic test fixtures, tests and public fixed-scenario reports, optional web demo and optional Apertus smoke-test helper. No API key is required for MCP. No key is shipped.

Excluded: node_modules, environment secrets, private conversations, temporary logs, source-research copies and the separate desktop-demo START-WINDOWS.cmd launcher. For the optional web demo, run npm ci followed by npm run web; use the URL printed by the server and keep its terminal open.

Validation: 275 automated tests passed in a clean extraction before submission packaging, plus eight live-source V7.8 MCP scenarios. The submission preparation changes documentation and .gitignore only; executable code, tests, bundled data, package.json and package-lock.json remain byte-identical to the tested release. Live Apertus, Windows execution and visual browser rendering were not verified in that run. See TESTBERICHT.md.

Do not claim coverage beyond the declared scope, an available hosted MCP endpoint, a live Apertus pass, or universal absence of defects.
