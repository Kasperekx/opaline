# Landing verification — September 24, 2026

## Hero sizing follow-up

At the owner's request, the hero was enlarged after the initial audit below. It now uses a viewport-aware minimum height, larger type, and a 52px primary action. Verified rendered heights: 682px at 1280×720, 778px at 390×844, and 702px at 320×740, with no page-level horizontal overflow or clipped actions. The earlier image-position and timing measurements below describe the compact version, not this enlarged layout.

## Implemented

- A shorter, project-focused hero and two real **Explore Opaline** links to the workspace section. Availability is a secondary status, not an inert primary button.
- The first workspace image begins approximately 607 CSS pixels below the page top at 1280×720. Trust information now follows the image instead of delaying it.
- Less repeated copy; concrete SQL, JSON, backup, export, local profile, and credential-store details remain.
- All three product images come from the real app using the same synthetic Atlas commerce fixture. No production database or credentials were used. Source JPEGs remain untouched; presentation crops and fades are CSS.
- A generated 1200×630 Open Graph/Twitter image using the authentic workspace capture.
- Explicitly closed beta registration with disabled controls and no email collection. The contact placeholder is plain text, with no invented address.

## Automated checks

- Website lint and production build passed.
- Website tests passed against both the development server and production preview, covering content, links, signup/contact state, screenshot dimensions, social image bytes, demo boundaries, and motion lifecycle/reduced-motion behavior.
- Root TypeScript checks passed.
- Both screenshot fixture test files passed: 7 tests.
- `git diff --check` passed.
- Node reports existing module-type warnings in the TypeScript test scripts; these did not fail tests.

## Browser checks

Tested in the Codex in-app browser at 320×740, 390×844, 768×1024, and the default 1280×720. Document width matched viewport width at every tested size. Checked compact hero, tablet schema composition, the narrow beta layout, and loaded product images. Header and hero CTAs navigate to the product section below the sticky header. FAQ disclosure works. Keyboard **Skip to content** moves focus to `main`. Hero pause updates to resume. A fresh production navigation session recorded no console errors or warnings.

The three original product JPEGs total 273,173 bytes (about 267 KiB): workspace 145,519; diagram 59,824; structure 67,830. The schema and product figures retain explicit dimensions to reserve their layout space. The former interactive demo is not embedded or loaded by the landing page.

## Local timing sample

An opt-in production build used Next.js `useReportWebVitals`, logging only metric names, values, and ratings to the local console. No analytics service was added.

| Viewport | TTFB | FCP | LCP |
| --- | ---: | ---: | ---: |
| 1280×720 | 26.4 ms | 196 ms | 196 ms |
| 390×844 | 7.7 ms | 116 ms | 96 ms |

These are single local, unthrottled browser samples with warmed resources, not mobile-device, CDN, Lighthouse, or field results. CLS and INP did not emit in the captured session, so no claim is made about passing those thresholds. Browser automation also logged an error while navigating to a raw SVG document; it did not recur in the fresh landing-only session. Recheck on the chosen hosting environment and actual target devices before treating performance as a release gate.

## Deliberately pending

- A public contact address, supplied by the owner.
- A beta submission service and the matching collection/privacy text before enabling registration.
- The production origin (`SITE_URL`) and deployment. No hostname was guessed and nothing was published.
- Real-device Safari/mobile and throttled-network validation after hosting is selected.
