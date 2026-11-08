import assert from "node:assert/strict";

// Run against either `npm run dev` or `npm run start`.
const origin = process.env.SITE_URL || "http://localhost:3000";
const response = await fetch(origin);
assert.equal(response.status, 200);
const html = await response.text();
const renderedHtml = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
const renderedText = renderedHtml
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal((html.match(/<h1[ >]/g) || []).length, 1, "One primary heading");
const heading = html
  .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(
  heading,
  "A database client built around your projects.",
  "Hero explains the product and its project-focused workflow",
);
for (const text of [
  "Opaline — A database client built around your projects",
  "Beta access",
  "See the app",
  "Keep project connections and queries together.",
  "Next for Opaline.",
  "Coming soon",
  "Pricing will be announced before launch.",
  "Organize your connections",
  "Review before saving",
  "Work from the keyboard",
  "PostgreSQL first.",
  "PostgreSQL at launch",
  "More on the way.",
  "Desktop app coming soon. More providers to follow.",
]) {
  assert.ok(html.includes(text), `Missing content: ${text}`);
}
assert.equal(
  html.match(/<title>([\s\S]*?)<\/title>/)?.[1],
  "Opaline — A database client built around your projects",
  "Page title reflects the commercial product positioning",
);
const metadataTags = [...renderedHtml.matchAll(/<meta\b[^>]*>/g)].map(
  ([tag]) => tag,
);
const metadataValue = (selector) =>
  metadataTags
    .find((tag) => tag.includes(selector))
    ?.match(/\bcontent="([^"]*)"/)?.[1];
for (const selector of [
  'name="description"',
  'property="og:description"',
  'name="twitter:description"',
]) {
  assert.equal(
    metadataValue(selector),
    "Keep each project’s connections, SQL tabs, and table changes together in one desktop workspace. PostgreSQL first. macOS coming soon.",
    `Page and social descriptions reflect the forthcoming macOS release: ${selector}`,
  );
}
assert.equal(metadataValue('name="twitter:card"'), "summary_large_image");
const shareImageUrl = metadataValue('property="og:image"');
assert.ok(shareImageUrl, "The landing has a branded Open Graph image");
assert.equal(
  metadataValue('name="twitter:image"'),
  shareImageUrl,
  "Open Graph and Twitter share the branded preview",
);
for (const selector of ['property="og:image:alt"', 'name="twitter:image:alt"']) {
  assert.match(
    metadataValue(selector),
    /Opaline.*built around your projects.*PostgreSQL first.*macOS coming soon/,
    "The social preview has meaningful alt text",
  );
}
assert.equal(metadataValue('property="og:image:width"'), "1200");
assert.equal(metadataValue('property="og:image:height"'), "630");
const shareImageResponse = await fetch(shareImageUrl);
assert.equal(shareImageResponse.status, 200, "The social preview is reachable");
assert.equal(shareImageResponse.headers.get("content-type"), "image/png");
const shareImage = Buffer.from(await shareImageResponse.arrayBuffer());
assert.deepEqual(
  [...shareImage.subarray(0, 8)],
  [137, 80, 78, 71, 13, 10, 26, 10],
  "The social preview is a real PNG",
);
assert.deepEqual(
  [shareImage.readUInt32BE(16), shareImage.readUInt32BE(20)],
  [1200, 630],
  "Social preview dimensions match its metadata",
);
assert.ok(shareImage.length < 5_000_000, "The preview fits social image limits");
const renderedLinks = [
  ...renderedHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g),
];
const primaryActions = renderedLinks.filter(
  ([, , content]) =>
    content.replace(/<[^>]*>/g, " ").trim() === "Beta access",
);
assert.equal(
  primaryActions.length,
  2,
  "The header and hero expose the primary action",
);
for (const [, attributes] of primaryActions) {
  assert.match(
    attributes,
    /\bhref="#beta"/,
    "Beta access reaches the pending registration section",
  );
  assert.doesNotMatch(
    attributes,
    /\baria-disabled="true"|\btabindex="-1"/i,
    "The primary action remains available to keyboard and pointer users",
  );
}
const appActions = renderedLinks.filter(
  ([, , content]) =>
    content.replace(/<[^>]*>/g, " ").trim() === "See the app",
);
assert.equal(appActions.length, 1, "The hero exposes one See the app action");
assert.match(
  appActions[0][1],
  /\bhref="#product"/,
  "See the app reaches the real workspace showcase",
);
const launchStatuses = [
  ...renderedHtml.matchAll(
    /<span\b([^>]*\bdata-launch-status="coming-soon"[^>]*)>([\s\S]*?)<\/span>/g,
  ),
];
assert.equal(
  launchStatuses.length,
  1,
  "The hero has one informational Coming soon status",
);
for (const [, attributes, content] of launchStatuses) {
  assert.match(content, /Coming soon/, "Launch status is readable");
  assert.doesNotMatch(
    attributes,
    /\b(?:href|tabindex|onclick)=|\brole="(?:button|link)"/i,
    "Coming soon is an informational status, not an actionable control",
  );
}
const betaWaitlist = renderedHtml.match(
  /<section\b(?=[^>]*\bid="beta")(?=[^>]*\baria-labelledby="beta-title")[^>]*>[\s\S]*?<\/section>/,
)?.[0];
assert.ok(betaWaitlist, "The beta waitlist preview is server-rendered");
const betaHeading = betaWaitlist
  .match(/<h2\b[^>]*id="beta-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(betaHeading, "Beta sign-ups open soon.");
assert.match(
  betaWaitlist,
  /<label\b[^>]*for="beta-email"[^>]*>\s*Email address\s*<\/label>/,
  "The email preview has a visible, associated label",
);
const betaEmail = betaWaitlist.match(/<input\b[^>]*id="beta-email"[^>]*>/)?.[0];
assert.ok(betaEmail, "The email preview is rendered");
for (const attribute of [
  'type="email"',
  'autocomplete="email"',
  'placeholder="you@company.com"',
]) {
  assert.ok(
    betaEmail.toLowerCase().includes(attribute),
    `Email preview attribute: ${attribute}`,
  );
}
assert.match(betaEmail, /\sdisabled(?:[\s=>])/, "Email collection is disabled");
assert.doesNotMatch(
  betaEmail,
  /\sname=/,
  "The preview has no submission field name",
);
const betaButton = [
  ...betaWaitlist.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
].find(
  ([, , content]) =>
    content.replace(/<[^>]*>/g, " ").trim() === "Opening soon",
);
assert.ok(
  betaButton,
  "The beta waitlist preview clearly states registration is pending",
);
assert.match(
  betaButton[1],
  /\btype="button"/,
  "The preview button cannot submit",
);
assert.match(
  betaButton[1],
  /\sdisabled(?:[\s=]|$)/,
  "Waitlist registration is disabled",
);
assert.match(
  betaWaitlist,
  /\brole="group"/,
  "The disabled controls are grouped",
);
assert.doesNotMatch(
  betaWaitlist,
  /<form\b|\s(?:action|formaction|onclick|onsubmit)=/i,
  "The preview exposes no form, submission action, or event handler",
);
assert.ok(
  betaWaitlist.includes(
    "Sign-ups open soon. No email addresses are collected yet.",
  ),
  "The preview explicitly explains that registration and collection are unavailable",
);
assert.doesNotMatch(
  renderedText,
  /Meet Opaline/,
  "The old closing section is removed",
);
assert.doesNotMatch(
  renderedText,
  /\b(?:open[\s-]+source|free|MIT|GitHub|downloads?|view source|source code)\b/i,
  "The landing page has no free, open-source, source-code, or download promotion",
);
assert.doesNotMatch(
  renderedText,
  /\b(?:experimental beta|(?:beta|download) (?:is )?available|available (?:in |· )?beta|PostgreSQL (?:today|now)|no account required|no subscription|no paid tab limit|not notarized by Apple|installation notes|release notes)\b/i,
  "The landing page does not make stale release or commercial promises",
);
for (const [anchor] of renderedHtml.matchAll(/<a\b[^>]*>/g)) {
  assert.doesNotMatch(
    anchor,
    /\bdownload(?:[\s=>])|href="[^"\s]*(?:github\.com|\/releases(?:\/|["?#])|\.(?:dmg|exe|msi|appimage)(?:["?#]))/i,
    "Landing links do not expose downloads, release pages, or GitHub promotion",
  );
}
assert.doesNotMatch(renderedHtml, /href="mailto:/i, "No public contact is invented");
const footer = renderedHtml.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
assert.ok(footer, "The footer is rendered");
assert.match(
  footer,
  /<span\b[^>]*>Contact details coming soon<\/span>/,
  "The footer contact is an honest, non-actionable placeholder",
);
assert.doesNotMatch(
  footer,
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
  "No placeholder email is published",
);
assert.match(
  html,
  /<section\b[^>]*class="hero-scene"/,
  "Cinematic hero is rendered",
);
assert.match(
  html,
  /<main\b(?=[^>]*\bid="main")(?=[^>]*\btabindex="-1")[^>]*>/i,
  "The rendered skip-link target accepts focus",
);
const developerWorkflow = html.match(
  /<article\b[^>]*id="developer-workflow"[\s\S]*?<\/article>/,
)?.[0];
assert.ok(developerWorkflow, "Developer keyboard workflow is rendered");
const developerHeading = developerWorkflow
  .match(/<h2\b[^>]*id="developer-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(developerHeading, "Less clicking. More momentum.");
for (const shortcut of [
  "Command Shift P",
  "Command Shift Right bracket",
  "Command Enter",
]) {
  assert.ok(
    developerWorkflow.includes(`aria-label="${shortcut}"`),
    `Missing supported macOS shortcut: ${shortcut}`,
  );
}
assert.match(
  developerWorkflow,
  /<button\b[^>]*aria-label="Pause keyboard animation"[^>]*>/,
  "Keyboard animation has a pause control",
);
assert.ok(
  !html.includes("Edit your rows."),
  "The old editing chapter is removed",
);
const schemaShowcase = html.match(
  /<article\b[^>]*id="schema"[\s\S]*?<\/article>/,
)?.[0];
assert.ok(schemaShowcase, "Schema showcase is rendered");
const schemaHeading = schemaShowcase
  .match(/<h2\b[^>]*id="schema-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(schemaHeading, "See how your data fits together.");
const workspaceShowcase = renderedHtml.match(
  /<section\b(?=[^>]*\bid="product")(?=[^>]*\baria-labelledby="product-title")[^>]*>[\s\S]*?<\/section>/,
)?.[0];
assert.ok(workspaceShowcase, "Main product showcase is server-rendered");
assert.match(renderedText, /Your database\. In focus\./);
assert.match(workspaceShowcase, /Real app\. Sample data\./);
assert.match(workspaceShowcase, /View full workspace/);
const trustFacts = renderedHtml.indexOf('aria-label="Opaline at a glance"');
assert.ok(
  trustFacts > renderedHtml.indexOf(workspaceShowcase) + workspaceShowcase.length,
  "Trust facts follow the main product capture",
);
for (const fact of [
  "Direct connections",
  "System credential store",
  "Local profiles",
]) {
  assert.ok(renderedText.includes(fact), `Missing trust fact: ${fact}`);
}
const essentials = renderedHtml.match(
  /<section\b[^>]*aria-labelledby="essentials-title"[^>]*>[\s\S]*?<\/section>/,
)?.[0];
assert.ok(essentials, "Everyday features are rendered");
for (const feature of [
  "History and bookmarks",
  "Inspect JSON",
  "Backup and restore",
  "Export table data as CSV or JSON",
]) {
  assert.ok(essentials.includes(feature), `Missing everyday feature: ${feature}`);
}
assert.doesNotMatch(
  essentials,
  /Database diagrams|Keyboard shortcuts/,
  "Everyday features complement the dedicated diagram and keyboard sections",
);
for (const [name, section] of [
  ["schema-diagram", schemaShowcase],
  ["schema-structure", schemaShowcase],
  ["workspace-overview", workspaceShowcase],
]) {
  const path = `/screenshots/${name}.jpg`;
  assert.ok(section.includes(`href="${path}"`), `Full capture link: ${name}`);
  const imageTag = [...section.matchAll(/<img\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`src="${path}"`));
  assert.ok(
    imageTag,
    `Real screenshot rendered without recompression: ${name}`,
  );
  assert.match(imageTag, /alt="[^"]+"/, `Screenshot description: ${name}`);
  assert.match(imageTag, /width="1280"/, `Rendered source width: ${name}`);
  assert.match(imageTag, /height="720"/, `Rendered source height: ${name}`);
  const image = await fetch(`${origin}${path}`);
  assert.equal(image.status, 200);
  assert.ok(image.headers.get("content-type")?.startsWith("image/jpeg"));
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.readUInt16BE(0), 0xffd8, `JPEG signature: ${name}`);
  let dimensions;
  for (let offset = 2; offset + 9 < bytes.length;) {
    assert.equal(bytes[offset], 0xff, `Valid JPEG marker: ${name}`);
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      dimensions = [
        bytes.readUInt16BE(offset + 7),
        bytes.readUInt16BE(offset + 5),
      ];
      break;
    }
    if (marker === 0xda || marker === 0xd9) break;
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  assert.deepEqual(
    dimensions,
    [1280, 720],
    `Full-size source capture: ${name}`,
  );
}
for (const text of ["One project.", "Every environment."])
  assert.ok(!html.includes(text), `Old connections chapter removed: ${text}`);
assert.ok(!html.includes('src="/screenshots/connections.jpg"'));
for (const [, anchor] of html.matchAll(/href="#([^"\s]+)"/g)) {
  assert.ok(html.includes(`id="${anchor}"`), `Broken anchor: ${anchor}`);
}
assert.equal((await fetch(`${origin}/icon.svg`)).status, 200);
assert.ok(html.includes('id="providers"'));
assert.ok(html.includes('href="/providers/postgresql.svg"'));
assert.ok(html.includes("Pause connection animation"));
const providers = html.match(
  /<section\b[^>]*id="providers"[\s\S]*?<\/section>/,
)?.[0];
assert.ok(providers, "Provider map is rendered");
assert.equal(
  (providers.match(/<span>Coming soon<\/span>/g) || []).length,
  2,
  "Every future database provider is explicitly marked coming soon",
);
for (const name of ["MySQL", "SQLite"])
  assert.ok(
    providers.includes(name),
    `Missing planned database provider: ${name}`,
  );
for (const name of ["Kafka", "Docker"])
  assert.ok(!providers.includes(name), `Non-database provider shown: ${name}`);
assert.equal(
  (providers.match(/<g mask=/g) || []).length,
  2,
  "Only the two PostgreSQL paths carry animated beams",
);
for (const name of ["postgresql", "sqlite"]) {
  assert.ok(providers.includes(`href="/providers/${name}.svg"`));
  const logo = await fetch(`${origin}/providers/${name}.svg`);
  assert.equal(logo.status, 200);
  assert.ok(logo.headers.get("content-type")?.includes("image/svg+xml"));
}
const vision = renderedHtml.match(
  /<section\b(?=[^>]*\bid="vision")(?=[^>]*\baria-labelledby="vision-title")[^>]*>[\s\S]*?<\/section>/,
)?.[0];
assert.ok(vision, "The product vision is server-rendered with a labelled section");
const roadmap = renderedHtml.match(
  /<section\b[^>]*id="roadmap"[^>]*>[\s\S]*?<\/section>/,
)?.[0];
assert.ok(roadmap, "The roadmap is server-rendered");
assert.ok(
  renderedHtml.indexOf(vision) > renderedHtml.indexOf(providers) &&
    renderedHtml.indexOf(vision) < renderedHtml.indexOf(roadmap),
  "Product vision follows providers and precedes the roadmap",
);
const visionHeading = vision
  .match(/<h2\b[^>]*id="vision-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(
  visionHeading,
  "Starting with databases. Connecting your workflow.",
);
const visionText = vision
  .replace(/<[^>]*>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();
for (const text of [
  "Databases",
  "PostgreSQL",
  "API requests",
  "Logs & traces",
  "The goal: follow a request through its SQL and logs, without leaving your project.",
  "Conceptual workflow. API and diagnostics are not available yet.",
]) {
  assert.ok(visionText.includes(text), `Missing product vision content: ${text}`);
}
assert.equal(
  (visionText.match(/\bFirst release\b/g) || []).length,
  1,
  "The database workflow is marked for the first release",
);
assert.equal(
  (visionText.match(/\bExploring\b/g) || []).length,
  2,
  "Both API and diagnostics are marked as exploration",
);
const visionRoadmapLink = [
  ...vision.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g),
].find(
  ([, , content]) =>
    content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() === "See the roadmap",
);
assert.ok(visionRoadmapLink, "The product vision has a readable roadmap link");
assert.match(visionRoadmapLink[1], /\bhref="#roadmap"/);
const requestDebugging = [...roadmap.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)]
  .map(([item]) =>
    item.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  )
  .find((item) => item.includes("Connected request debugging"));
assert.ok(requestDebugging, "Connected request debugging appears in the roadmap");
assert.ok(requestDebugging.includes("Then · exploration"));
assert.ok(
  requestDebugging.includes(
    "Explore HTTP requests alongside their SQL calls, logs, and traces. Kafka and Docker integrations are longer-term directions.",
  ),
  "The request-debugging roadmap describes exploration, not current capabilities",
);
const demoResponse = await fetch(`${origin}/demo/index.html`);
assert.equal(demoResponse.status, 200);
const demo = await demoResponse.text();
assert.ok(
  demo.includes("connect-src 'none'"),
  "Demo cannot contact a database or network API",
);
assert.ok(demo.includes("Content-Security-Policy"));
for (const [, asset] of demo.matchAll(/(?:src|href)="(\.\/assets\/[^" ]+)"/g)) {
  assert.equal(
    (await fetch(new URL(asset, `${origin}/demo/index.html`))).status,
    200,
  );
}
for (const name of ["table", "connections"]) {
  const image = await fetch(`${origin}/screenshots/${name}.jpg`);
  assert.equal(image.status, 200);
  assert.ok(image.headers.get("content-type")?.startsWith("image/"));
}
assert.doesNotMatch(
  renderedHtml,
  /<iframe\b|href="\/demo\//i,
  "The landing no longer embeds or links to the tutorial demo",
);
assert.doesNotMatch(
  renderedText,
  /interactive demo|browser demo|try in your browser|try table editing|try the table editor|Change a role|Make changes\. Stay in control\./i,
  "All copy reflects the non-interactive product showcase",
);
assert.ok(html.includes('id="roadmap"'));
for (const feature of ["Windows", "Linux", "Kafka", "AI"])
  assert.ok(html.includes(feature));
console.log(
  "Landing smoke checks passed: project-focused positioning, working primary actions, pending beta and contact, Atlas commerce captures, social PNG, product vision and roadmap, legacy demo assets and CSP, and icon.",
);
