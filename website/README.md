# Opaline website

English prelaunch landing page for Opaline, a premium commercial database client, built with Next.js App Router, Tailwind CSS 4, and shadcn/ui (Base UI). Product sections show genuine captures of the desktop application with fictional sample data, not interactive tutorials. The previous standalone demo remains available for development, but is neither embedded nor promoted on the landing page. The Tauri desktop build is unchanged. Pricing will be announced before launch; the website does not specify a price or billing model.

The visual direction is cinematic graphite and amber: a machined optical aperture around the opening product story, large typography, and editorial workflow sections. The accent matches the desktop app (`#dfbb79`); teal remains a semantic color inside the real interface. Decorative motion introduces the product without taking control of scrolling.

The opening message is **A database client built around your projects.** Both **Beta access** actions lead to the pending beta section; the hero's secondary **See the app** action leads to the real workspace showcase. A single **Coming soon** status supplies availability context in the hero. Direct connections, the system credential store, and local profiles follow the main capture; the everyday feature list adds SQL history/bookmarks, JSON inspection, backup/restore, and export alongside the dedicated schema and keyboard stories.

## Run locally

Use Node.js 22.13+ within the 22.x series, or Node.js 24+. Install dependencies in both the repository root and `website`; the demo uses the root application's source and build tools. From the repository root:

```sh
npm ci
cd website
npm ci
npm run dev
```

Open http://localhost:3000. For a production preview, run `npm run build` followed by `npm run start`. The `predev` and `prebuild` scripts type-check and compile the retained standalone demo to `public/demo` before Next.js starts. After editing desktop components or `demo/` while the development server is running, run `npm run demo:build` and reload the standalone demo page. Generated demo assets are not committed.

Set `SITE_URL` to the full public origin, including `https://`, before building for a chosen deployment. It supplies the metadata base, canonical URL, and Open Graph page URL. Without it, local previews use `http://localhost:3000` for social image URLs and omit canonical/page URLs; no production hostname is assumed. The same variable overrides the smoke test's target URL, so set it to the running site when testing. `app/opengraph-image.tsx` generates a 1200×630 graphite-and-amber PNG using the authentic workspace capture; Open Graph and Twitter use that image with descriptive alt text and a large-image card.

## Verify

```sh
npm run lint
npm run build
# With the development or production server running:
npm test
```

For local-only timing diagnostics, build with `OPALINE_PERFORMANCE_AUDIT=1 npm run build` and run the production server. The console reports supported Web Vitals under `[opaline:performance]`; nothing is sent to a server. Leave the variable unset for a normal build. Local timings are not field performance results. See [the September 24 verification notes](docs/landing-quality-2026-09-24.md) for the tested scope and limitations.

Tests cover the project-focused hero, both **Beta access** links to `#beta`, the **See the app** link to `#product`, one informational **Coming soon** status, the pending beta waitlist and its disabled controls, the non-link contact placeholder, absence of invented contact details or stale download/licensing promotion, metadata and the fetched 1200×630 social PNG, the vision section's position and explicit future availability, its roadmap link, local demo adapter, motion lifecycle, focusable skip target, genuine 1280×720 screenshot assets, and the absence of tutorial embeds and links. For the layout/motion and data checks without a server, run `node --experimental-strip-types scripts/motion.test.mjs` and `node --experimental-strip-types scripts/demo-data.test.mjs`. Before publishing, manually verify:

- The **Your database. In focus.** section shows the real workspace, open table tabs, and populated orders. Check its restrained entrance, bottom fade, readable mobile crop, and **View full workspace** link. The caption identifies sample data; no controls imply that the image itself is interactive.
- Header and hero **Beta access** actions should lead to the pending beta section, whose controls remain disabled. The secondary **See the app** action and Product navigation item lead to the workspace showcase. FAQ copy must describe the actual screenshots accurately.
- Use **Skip to content**, section navigation, screenshot links, and FAQ disclosures with the keyboard. Deep links should arrive below the sticky header without hiding their headings.
- Pause and resume the hero background with its motion control. The 22-second light sweep and 32-second rim drift stop when the hero leaves the viewport or the tab is hidden; an explicit pause stays paused on return. Mouse movement adds a bounded spring offset to the artwork only, never the text or demo. Touch input does not track.
- With reduced motion enabled, the hero is static, readable, and complete, and its unnecessary motion control is hidden. In browsers without CSS scroll-timeline support, artwork and content must remain visible, and the page must still scroll normally. Check a short viewport and a 320px-wide viewport for clipping or page-level horizontal overflow.
- In the providers section, PostgreSQL is the database provider planned for launch, with amber beams. MySQL and SQLite appear as later providers with static dashed paths and explicit **Coming soon** labels, not active connections. This section is database-only. No release dates are promised. Check pause/resume, offscreen pausing, and the static reduced-motion fallback.
- The **Starting with databases. Connecting your workflow.** vision follows providers and precedes the roadmap. Databases/PostgreSQL is labelled **First release**; API requests and Logs & traces are **Exploring**. Keep the conceptual-workflow caption visible and the **See the roadmap** link working. This describes a future direction, not implemented HTTP or diagnostics capabilities.
- The developer workflow cycles through three real macOS shortcuts: Command–Shift–P for commands, Command–Shift–] for the next tab, and Command–Enter to run SQL. Check that the highlighted list item matches the keycaps, pause/resume freezes the entire illustration, and reduced motion leaves a static first illustration with all three shortcuts readable. No browser shortcuts should be intercepted.
- The schema showcase layers genuine Atlas commerce diagram and orders Structure captures. Check desktop overlap, narrow-width readability, and both full-resolution links. Edge fades must not obscure the central table names or imply nonexistent app controls.
- At the **Beta sign-ups open soon.** preview, the email field and **Opening soon** button are disabled. The notice must clearly state that sign-ups are not open and no email addresses are collected. Check narrow widths and text readability.
- The footer shows **Contact details coming soon** as text. Replace it only when a real public contact is chosen. Inspect the social preview at `/opengraph-image` and confirm its headline and product crop are readable at sharing-card size.

## Content and boundaries

- `app/page.tsx`: product copy, prelaunch statuses, commercial positioning, and working section links.
- `app/layout.tsx` and `app/opengraph-image.tsx`: matching page/social metadata, optional deployment origin, and a generated 1200×630 branded social image. The image reads the local workspace JPEG and needs no image-generation service or external request.
- `components/hero-aperture.tsx` and its CSS module: server-rendered decorative SVG aperture, with a finite entrance, slow CSS rim drift and a light sweep clipped to the metal. It is not a fabricated application screenshot.
- `components/hero-motion.tsx` and `lib/hero-motion.ts`: a small client boundary for pause/resume and a fine-mouse spring. No animation dependency; the pointer loop stops after settling. `lib/ambient-motion.ts` shares visibility, reduced-motion, pause, and cleanup behavior with the provider beams. Without JavaScript or IntersectionObserver, ambient artwork stays static.
- `components/providers.tsx` and `components/animated-beam.tsx`: provider roadmap map, separating PostgreSQL at launch from later integrations. Native SVG masks and CSS transforms create the amber beam, without an animation dependency or per-frame JavaScript. Third-party artwork and trademark/source notes are in `public/providers/`; their own usage terms apply independently of Opaline's licensing. MySQL uses a neutral database glyph, not the permission-restricted dolphin mark. Review the documented trademark conditions before publication.
- `components/product-vision.tsx` and `components/product-vision.module.css`: server-rendered conceptual workflow between providers and roadmap, using the existing `Reveal` entrance. It distinguishes the first database release from API and diagnostics exploration; it is not an application screenshot or working request debugger.
- `components/product-preview.tsx` and its CSS module: one genuine workspace screenshot, a one-shot reveal, restrained amber framing and bottom fade, an intentional narrow-screen crop, and a full-resolution image link. No iframe or tutorial controls. The image uses `unoptimized` to avoid a second lossy compression pass.
- `components/developer-workflow.tsx` and its CSS module: conceptual keyboard illustration replacing the table-editing screenshot chapter. A nine-second CSS sequence explains the existing keyboard workflow, using `observeAmbientMotion` for visibility and pause gates. It is not simulated application UI. Shortcut bindings are currently fixed; the site does not claim customization.
- `components/schema-showcase.tsx` and its CSS module: overlapping real application captures replacing the old connections screenshot chapter. CSS supplies cropping, depth, and edge masks; it does not redraw or fabricate the interface. The images use `unoptimized` to avoid a second lossy compression pass.
- `components/beta-waitlist.tsx` and its CSS module: server-rendered beta waitlist UI replacing the closing **Meet Opaline** section. Its visibly labelled email field and button are disabled, with an explicit sign-ups-closed notice. It has no form, submission action, client state, browser persistence, or network integration.
- `demo/index.tsx`: retained standalone sandbox importing the real desktop table grid, inline editors, change review, pagination, connection rows, and their styles. It is not embedded in the landing page and is not the whole desktop application.
- `demo/GuidedTableGuide.tsx` and `demo/guide-state.ts`: a demo-only **edit → review → save locally** guide. The initial button opens the real enum editor without changing its value. Progress observes the desktop table controller; review is tied to the current draft and completion requires a confirmed save. Keyboard editing stays immediate. The guided view starts unfiltered and leaves the full demo’s saved view preferences alone. No desktop component or persistence boundary is changed.
- `demo/data.ts`: synthetic Atlas profiles and rows, strict command allowlist, validation, atomic in-memory changes, and guarded browser persistence. Only `load_table_page`, `load_table_row`, and `apply_table_changes` are handled. Every other command is rejected; there is no SQL engine, real connection, or credentials form.
- `scripts/build-demo.mjs`: separate Vite build using the existing repository toolchain. `demo/index.html` applies a restrictive Content Security Policy, including `connect-src 'none'` and `form-action 'none'`.
- `public/screenshots/schema-{diagram,structure}.jpg`: original 1280×720 captures of the actual app using the development-only `tests/preview.html?scenario=workspace` route. They share the main capture's Atlas commerce fixture: customers, orders, subscriptions, products, invoices, payments, and events. Structure shows orders, column types, its primary key, defaults, and constraint tabs. The old `public/screenshots/{table,connections}.jpg` files remain as legacy, unused assets; they are no longer shown in the landing page.
- `public/screenshots/workspace-overview.jpg`: original 1280×720 capture of the actual app using `tests/preview.html?scenario=workspace`. The synthetic fixture supplies seven related tables and 28 orders, with customers, statuses, amounts, dates, and JSON. The app UI is not redrawn for marketing.
- `app/globals.css`: cinematic amber composition, responsive layouts, progressive decorative scroll effects, entrance/press motion, and reduced-motion support. Unsupported motion features must fall back to visible static content.
- `components/product-principles.tsx`: original conceptual SVG diagrams explaining context, staged changes, and keyboard flow; not simulated application views.
- `components/reveal.tsx`: one-shot viewport reveals using the native Web Animations API. Content stays visible without JavaScript, and reduced motion disables movement.
- `components/ui`: local shadcn primitives; no dashboard template.
- Fonts are self-hosted by Next.js after the build; the build fetches them from Google Fonts.

### Refreshing the schema screenshots

Start the desktop frontend development server from the repository root and open `/tests/preview.html?scenario=workspace` on its local origin (for example, `http://localhost:1425/tests/preview.html?scenario=workspace`). This fixture renders the real app with the synthetic **Atlas** workspace, **Atlas · Local** connection, and `atlas` database. Its seven commerce tables and matching foreign-key/structure metadata are shared by all three landing-page captures. It does not connect to PostgreSQL or use saved credentials. Screenshot-only data and command responses live in `tests/workspace-showcase-fixture.ts` and the preview entry, not in production application code. The older `scenario=showcase` fixture is not used for the current landing screenshots.

At a 1280×720 viewport:

1. Connect **Atlas · Local**. Open **Connection actions → Database diagram**, use **Fit** (or **Arrange** to reset positions first), and show the seven related commerce tables. Capture this view as `schema-diagram.jpg`.
2. Open **orders** from the diagram or explorer, then select **Structure → Columns**. Keep the table heading, column types, primary key, and constraint tabs visible. Capture this view as `schema-structure.jpg`.
3. Save the original, full-viewport JPEGs to `public/screenshots/`. Do not paint over the UI or replace it with a mockup; composition, cropping, and edge shadows belong to the showcase CSS. Both full-resolution links must still open the untouched captures.
4. Run `npm test` from `website` with the site running. The smoke check verifies rendered image URLs, original JPEG signatures and 1280×720 dimensions, matching image attributes, the schema heading, the developer section, and the workspace showcase.

### Refreshing the main workspace screenshot

Open `/tests/preview.html?scenario=workspace` on the desktop frontend development server. This uses `tests/workspace-showcase-fixture.ts`, renders the real application, and never connects to a database or loads saved credentials. The normal editable-table interface is visible, but saving changes is rejected by the screenshot adapter.

At a 1280×720 viewport, connect **Atlas · Local** without a password. Open **customers**, **subscriptions**, and then **orders**, leaving orders active and expanded in the explorer. Use the real column resize handles to fit short values and the **Compact** density control to show more rows. Capture the complete viewport with no open popover, tooltip, or selected cell. Save the original JPEG as `public/screenshots/workspace-overview.jpg`; keep the component dimensions and smoke-test expectations aligned if the source capture dimensions change. Cropping and the bottom fade belong in CSS, never painted into the screenshot. The social image uses this same source capture.

### Retained standalone sandbox

The old `/demo/index.html` route and optional `?guided=1` walkthrough remain for development only; the landing page has no link or iframe pointing to them. When changing sandbox code, verify edit → review → save, Escape/discard, invalid input, keyboard navigation, JSON and boolean editing, filters, sorting, sample row creation/deletion, read-only profiles, reload persistence, and reset. Storage failures should preserve in-memory edits and show a warning; corrupt saved data stays untouched until explicit reset.

The roadmap separates the planned PostgreSQL/macOS Apple Silicon launch from later Windows/Linux and more providers. Phase 03, **Connected request debugging**, is marked **Then · exploration**: it explores HTTP requests alongside SQL calls, logs, and traces, with Kafka and Docker integrations as longer-term directions. API, diagnostics, and AI remain future concepts. No delivery dates or AI privacy guarantees are claimed.

The header and hero **Beta access** links navigate to the closing preview; the hero's **See the app** link opens the workspace section. The single **Coming soon** status describes release availability. The closing section says **Beta sign-ups open soon.**, with disabled controls and no email collection. The footer's **Contact details coming soon** text is not a link or invented email address. The site does not publish installer or release links, promote access to the repository, or advertise Opaline as a free or open-source product. Commercial messaging must not invent a price, billing model, launch date, account policy, or paid feature limits. Keep product availability and platform wording aligned with the forthcoming launch. Do not add user counts, performance claims, testimonials, or platform support without evidence. Preserve third-party license, copyright, and trademark notices when updating this copy.

The standalone demo stores only its sample edits under `opaline.website-demo.v1` and desktop view preferences scoped to `website-demo-*` profile IDs. No data is sent to a backend. Its CSP blocks form navigation and network connections. The command allowlist keeps this sample separate from database/native operations. Do not enter sensitive data into the public demo.

The beta waitlist is UI only. Before enabling email entry or registration, connect a real submission service, provide accurate privacy notices at the collection point, and verify the submission, error, and confirmation behavior. Until that integration is complete, keep the controls disabled and retain the explicit no-collection notice.

No analytics, active mailing list, database credentials, or backend services are included. When hosting is chosen, retain the full repository checkout and install both dependency trees before building from `website`; deploying an isolated copy of this directory would omit the desktop source required by the demo. Set `SITE_URL` before that production build so canonical and social URLs use the chosen hostname.
