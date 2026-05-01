import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("..", import.meta.url);
const page = (path) => readFile(new URL(path, root), "utf8");

const requiredPages = [
  "src/pages/index.astro",
  "src/pages/how-it-works.astro",
  "src/pages/methodology.astro",
  "src/pages/vendor-database.astro",
  "src/pages/alternatives.astro",
  "src/pages/trust-model.astro",
  "src/pages/release-notes.astro",
  "src/pages/contributing.astro",
  "src/pages/sample-report.astro",
  "src/pages/cli-quickstart.astro",
  "src/pages/faq.astro"
];

for (const requiredPage of requiredPages) {
  await assert.doesNotReject(() => page(requiredPage), `Missing required page: ${requiredPage}`);
}

const homepage = await page("src/pages/index.astro");
assert.match(
  homepage,
  /Understand your software stack’s external dependencies before someone asks\./,
  "Homepage hero copy must appear."
);
assert.match(homepage, /Free and MIT-licensed · Local-first · Offline by default · No telemetry/, "Homepage trust strip must appear.");
assert.match(homepage, /href="\/cli-quickstart\/">Run a local scan/, "Homepage primary CTA must link to CLI quickstart.");
assert.match(homepage, /href="\/methodology\/">Read the methodology/, "Homepage secondary CTA must link to methodology.");
assert.match(homepage, /href: "\/trust-model\/"/, "Homepage must visibly link to the trust model.");

const quickstart = await page("src/pages/cli-quickstart.astro");
assert.match(quickstart, /npm install -g @scaneur\/cli/, "CLI quickstart must include install command.");
assert.match(quickstart, /scaneur scan \./, "CLI quickstart must include scan command.");
assert.match(quickstart, /node packages\/cli\/src\/index\.js scan examples\/node-next-sentry-stripe/, "CLI quickstart must include source-checkout command.");
assert.match(quickstart, /Read the CLI docs/, "Quickstart must link to CLI docs.");
assert.match(quickstart, /href="\/how-it-works\/"/, "Quickstart CLI docs link must resolve to the how-it-works docs page.");

const releaseNotes = await page("src/pages/release-notes.astro");
assert.match(releaseNotes, /v0\.1\.0 Local CLI MVP/, "Release notes page must identify the MVP release.");
assert.match(releaseNotes, /offline default behavior, no telemetry/, "Release notes must preserve trust commitments.");
assert.match(releaseNotes, /The release test command is <code>npm test<\/code>/, "Release notes must include test command.");

const layout = await page("src/layouts/BaseLayout.astro");
const astroConfig = await page("astro.config.mjs");
assert.match(layout, /Vendor database/, "Vendor database page must be visible in site navigation or footer.");
assert.match(layout, /Alternatives/, "Alternatives page must be visible in site navigation or footer.");
assert.match(layout, /Trust model/, "Trust model page must be visible in site navigation or footer.");
assert.match(layout, /Methodology/, "Methodology page must be visible in site navigation or footer.");
assert.match(layout, /Release notes/, "Release notes page must be visible in site navigation or footer.");
assert.doesNotMatch(
  homepage + quickstart + layout,
  /affiliate commission|sponsored claim|compliance guaranteed/i,
  "Docs must avoid affiliate, sponsored, or legal overclaiming language."
);
assert.match(astroConfig, /site: "https:\/\/scaneur\.dev"/, "Docs app must include Astro site configuration.");
assert.match(astroConfig, /output: "static"/, "Docs app must build as a static Astro site.");
