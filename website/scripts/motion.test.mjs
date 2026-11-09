import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { observeReveal } from "../lib/reveal.ts";
import { animateHero } from "../lib/hero-motion.ts";
import { observeAmbientMotion } from "../lib/ambient-motion.ts";

// Use the existing compiler to check JSX ancestry, not a brittle source regex.
const page = ts.createSourceFile(
  "page.tsx",
  readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let previews = 0,
  apertures = 0,
  focusableMain = false,
  heroScene = false;
function checkLayout(node) {
  const opening = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;
  if (opening) {
    const tag = opening.tagName.getText(page);
    const attribute = (name) =>
      opening.attributes.properties.find(
        (property) =>
          ts.isJsxAttribute(property) && property.name.getText(page) === name,
      )?.initializer;
    if (tag === "ProductPreview") {
      previews++;
    }
    if (tag === "HeroAperture") apertures++;
    if (
      tag === "section" &&
      attribute("className")?.text?.split(" ").includes("hero-scene")
    )
      heroScene = true;
    if (tag === "main" && attribute("id")?.text === "main") {
      const tabIndex = attribute("tabIndex");
      focusableMain = Boolean(
        tabIndex &&
        ts.isJsxExpression(tabIndex) &&
        tabIndex.expression?.getText(page) === "-1",
      );
    }
  }
  ts.forEachChild(node, checkLayout);
}
checkLayout(page);
assert.equal(previews, 1, "Keep one main workspace showcase");
assert.equal(
  apertures,
  1,
  "The cinematic hero includes its decorative aperture",
);
assert.ok(heroScene, "The aperture and product story share a hero scene");
assert.ok(focusableMain, "The skip-link target must accept keyboard focus");

// Native-DOM stand-ins keep the entrance lifecycle test dependency-free.
const preference = new EventTarget();
preference.matches = false;
let intersect, options, disconnected, frames, timing, paused, played, cancelled;
class Observer {
  constructor(callback, config) {
    intersect = callback;
    options = config;
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}
globalThis.IntersectionObserver = Observer;
globalThis.window = {
  innerHeight: 900,
  matchMedia: () => preference,
  IntersectionObserver: Observer,
};
globalThis.getComputedStyle = () => ({
  getPropertyValue: () => "cubic-bezier(0.23, 1, 0.32, 1)",
});
const element = new EventTarget();
let top = 1000;
element.getBoundingClientRect = () => ({ top });
const animation = {
  pause() {
    paused = true;
  },
  play() {
    played = true;
  },
  cancel() {
    cancelled = true;
  },
};
element.animate = (keyframes, config) => {
  frames = keyframes;
  timing = config;
  return animation;
};

top = 200;
assert.equal(observeReveal(element, "content", 0), undefined);
assert.equal(
  frames,
  undefined,
  "Already-visible content must not blink on hydration",
);
top = 1000;
preference.matches = true;
assert.equal(observeReveal(element, "content", 0), undefined);
assert.equal(frames, undefined, "Reduced motion must not arm an entrance");
preference.matches = false;
const cleanup = observeReveal(element, "screen", 60);
assert.equal(
  paused,
  true,
  "Offscreen content starts at the first frame, not at intersection",
);
assert.equal(frames[0].opacity, 0);
assert.equal(timing.delay, 60);
assert.equal(timing.fill, "both");
assert.equal(options.threshold, 0);
assert.equal(options.rootMargin, "0px 0px 80px 0px");
intersect([{ isIntersecting: false }]);
assert.equal(played, undefined);
intersect([{ isIntersecting: true }]);
assert.ok(played && disconnected);
element.dispatchEvent(new Event("focusin"));
assert.equal(cancelled, true, "Keyboard focus must immediately expose content");
cancelled = false;
preference.matches = true;
preference.dispatchEvent(new Event("change"));
assert.equal(cancelled, true, "Reduced motion takes effect during an entrance");
cleanup();
cancelled = false;
element.dispatchEvent(new Event("focusin"));
preference.dispatchEvent(new Event("change"));
assert.equal(cancelled, false, "Cleanup removes listeners");
console.log(
  "Layout/motion checks passed: workspace showcase, hero, skip target, hydration, stagger, focus, reduced motion, cleanup.",
);

// Hero motion uses the same native lifecycle, with a deterministic frame queue.
const reduced = new EventTarget();
const fine = new EventTarget();
reduced.matches = true;
fine.matches = true;
const scene = new EventTarget();
scene.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  width: 1000,
  height: 800,
});
const doc = new EventTarget();
doc.hidden = false;
const attributes = new Set();
const aperture = {
  parentElement: scene,
  ownerDocument: doc,
  setAttribute: (name) => attributes.add(name),
  toggleAttribute(name, enabled) {
    if (enabled) attributes.add(name);
    else attributes.delete(name);
  },
  removeAttribute: (name) => attributes.delete(name),
};
const plane = { style: { transform: "" } };
let heroIntersection,
  heroDisconnected = false,
  observedTarget = scene,
  nextFrame = 0,
  time = 0;
const pendingFrames = new Map();
class HeroObserver {
  constructor(callback) {
    heroIntersection = callback;
  }
  observe(target) {
    assert.equal(target, observedTarget);
  }
  disconnect() {
    heroDisconnected = true;
  }
}
globalThis.IntersectionObserver = HeroObserver;
window.IntersectionObserver = HeroObserver;
window.matchMedia = (query) =>
  query.includes("reduced-motion") ? reduced : fine;
globalThis.requestAnimationFrame = (callback) => {
  pendingFrames.set(++nextFrame, callback);
  return nextFrame;
};
globalThis.cancelAnimationFrame = (id) => pendingFrames.delete(id);
const pointer = (pointerType = "mouse") =>
  scene.dispatchEvent(
    Object.assign(new Event("pointermove"), {
      pointerType,
      clientX: 1000,
      clientY: 800,
    }),
  );
const show = (isIntersecting) => heroIntersection([{ isIntersecting }]);
const change = (query, matches) => {
  query.matches = matches;
  query.dispatchEvent(new Event("change"));
};
const visibility = (hidden) => {
  doc.hidden = hidden;
  doc.dispatchEvent(new Event("visibilitychange"));
};
const active = () => attributes.has("data-active");
const hero = animateHero(aperture, plane);
assert.ok(hero);
assert.ok(
  attributes.has("data-managed"),
  "Only hydrated heroes expose motion controls",
);
show(true);
pointer();
assert.equal(active(), false, "Initial reduced motion keeps the hero static");
assert.equal(pendingFrames.size, 0);
change(reduced, false);
assert.equal(active(), true);
assert.equal(pendingFrames.size, 0, "Ambient CSS needs no idle JS frames");
pointer("touch");
assert.equal(pendingFrames.size, 0, "Touch never acquires parallax");
change(fine, false);
pointer();
assert.equal(pendingFrames.size, 0, "Coarse pointers never acquire parallax");
change(fine, true);
pointer();
for (let count = 0; pendingFrames.size && count < 600; count++) {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  time += 1000 / 60;
  callbacks.forEach((callback) => callback(time));
}
assert.equal(
  pendingFrames.size,
  0,
  "The spring settles without an idle RAF loop",
);
assert.equal(plane.style.transform, "translate3d(7.000px, 5.000px, 0)");
scene.dispatchEvent(new Event("pointerleave"));
assert.equal(pendingFrames.size, 1);
hero.setPaused(true);
assert.equal(active(), false);
assert.equal(pendingFrames.size, 0, "Pause cancels in-flight parallax");
visibility(true);
visibility(false);
show(false);
show(true);
assert.equal(
  active(),
  false,
  "Visibility changes must not override user pause",
);
hero.setPaused(false);
assert.equal(active(), true);
pointer();
visibility(true);
assert.equal(active(), false);
assert.equal(pendingFrames.size, 0, "Hidden documents stop JS and CSS motion");
visibility(false);
pointer();
show(false);
assert.equal(active(), false);
assert.equal(pendingFrames.size, 0, "Offscreen heroes stop JS and CSS motion");
show(true);
pointer();
change(reduced, true);
assert.equal(active(), false);
assert.equal(pendingFrames.size, 0, "Live reduced motion cancels the spring");
assert.equal(plane.style.transform, "");
change(reduced, false);
pointer();
scene.dispatchEvent(new Event("focusin"));
assert.equal(
  pendingFrames.size,
  0,
  "Keyboard focus resets mouse offset immediately",
);
assert.equal(plane.style.transform, "");
pointer();
hero.destroy();
assert.equal(heroDisconnected, true);
assert.equal(attributes.has("data-managed"), false);
assert.equal(pendingFrames.size, 0);
assert.equal(plane.style.transform, "");
visibility(false);
change(reduced, false);
change(fine, true);
pointer();
scene.dispatchEvent(new Event("pointerleave"));
assert.equal(
  active(),
  false,
  "Cleanup removes visibility and preference listeners",
);
assert.equal(pendingFrames.size, 0, "Cleanup removes pointer listeners");
console.log(
  "Hero checks passed: spring, pause, visibility, pointers, reduced motion, focus, cleanup.",
);

// Standalone loops share the same gates without requiring a pointer layer.
observedTarget = aperture;
const changes = [];
const ambient = observeAmbientMotion(aperture, (value) => changes.push(value));
assert.deepEqual(
  changes,
  [false],
  "Ambient loops start static before intersection",
);
show(true);
assert.equal(changes.at(-1), true);
ambient.setPaused(true);
visibility(true);
visibility(false);
assert.equal(active(), false, "Standalone loops preserve explicit pause too");
ambient.setPaused(false);
assert.equal(active(), true);
change(reduced, true);
assert.equal(
  active(),
  false,
  "Standalone loops follow live motion preferences",
);
change(reduced, false);
assert.equal(active(), true);
ambient.destroy();
assert.equal(
  changes.at(-1),
  false,
  "Destroy notifies dependent motion to stop",
);
const callsAfterDestroy = changes.length;
visibility(false);
change(reduced, false);
ambient.setPaused(false);
ambient.destroy();
show(true);
assert.equal(
  changes.length,
  callsAfterDestroy,
  "Destroyed gates cannot restart",
);
window.IntersectionObserver = undefined;
const unsupported = observeAmbientMotion(aperture);
unsupported.setPaused(false);
assert.equal(
  active(),
  false,
  "Missing IntersectionObserver leaves a static fallback",
);
assert.equal(
  attributes.has("data-managed"),
  false,
  "Static fallback exposes no pause control",
);
unsupported.destroy();
console.log(
  "Shared ambient checks passed: default target, gates, teardown, static fallback.",
);

// Each principle watches its own SVG while one control pauses all three loops.
const principleDoc = new EventTarget();
principleDoc.hidden = false;
const principlePreference = new EventTarget();
principlePreference.matches = false;
const principleObservers = [];
class PrincipleObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    principleObservers.push(this);
  }
  observe(target) {
    this.target = target;
  }
  disconnect() {
    this.disconnected = true;
  }
}
window.IntersectionObserver = PrincipleObserver;
window.matchMedia = () => principlePreference;
globalThis.requestAnimationFrame = window.requestAnimationFrame = () =>
  assert.fail("Principle CSS loops must never request JavaScript frames");
const principles = Array.from({ length: 3 }, () => {
  const attributes = new Set();
  return {
    article: {
      ownerDocument: principleDoc,
      setAttribute: (name) => attributes.add(name),
      toggleAttribute(name, enabled) {
        if (enabled) attributes.add(name);
        else attributes.delete(name);
      },
      removeAttribute: (name) => attributes.delete(name),
    },
    svg: {},
    attributes,
    changes: [],
  };
});
const principleControllers = principles.map(({ article, svg, changes }) =>
  observeAmbientMotion(article, (value) => changes.push(value), svg),
);
const principleStates = () =>
  principles.map(({ attributes }) => attributes.has("data-active"));
const showPrinciple = (index, isIntersecting) =>
  principleObservers[index].callback([
    { target: principles[index].svg, isIntersecting },
  ]);
const pausePrinciples = (paused) =>
  principleControllers.forEach((controller) => controller.setPaused(paused));
const principleVisibility = (hidden) => {
  principleDoc.hidden = hidden;
  principleDoc.dispatchEvent(new Event("visibilitychange"));
};
assert.equal(principleObservers.length, 3);
principleObservers.forEach((observer, index) => {
  assert.equal(observer.target, principles[index].svg);
  assert.ok(principles[index].attributes.has("data-managed"));
  assert.deepEqual(principles[index].changes, [false]);
});
assert.deepEqual(principleStates(), [false, false, false]);
assert.equal(getEventListeners(principleDoc, "visibilitychange").length, 3);
assert.equal(getEventListeners(principlePreference, "change").length, 3);
showPrinciple(0, true);
assert.deepEqual(principleStates(), [true, false, false]);
showPrinciple(1, true);
showPrinciple(0, false);
assert.deepEqual(
  principleStates(),
  [false, true, false],
  "Each SVG intersection gates only its own article",
);
showPrinciple(2, true);
assert.deepEqual(principleStates(), [false, true, true]);
principleVisibility(true);
assert.deepEqual(principleStates(), [false, false, false]);
principleVisibility(false);
assert.deepEqual(
  principleStates(),
  [false, true, true],
  "Returning to the tab restores only visible principles",
);
change(principlePreference, true);
assert.deepEqual(principleStates(), [false, false, false]);
change(principlePreference, false);
assert.deepEqual(principleStates(), [false, true, true]);
pausePrinciples(true);
assert.deepEqual(principleStates(), [false, false, false]);
principleVisibility(true);
principleVisibility(false);
change(principlePreference, true);
change(principlePreference, false);
principles.forEach((_, index) => {
  showPrinciple(index, false);
  showPrinciple(index, true);
});
assert.deepEqual(
  principleStates(),
  [false, false, false],
  "Shared explicit pause survives tab, preference, and intersection changes",
);
showPrinciple(1, false);
pausePrinciples(false);
assert.deepEqual(
  principleStates(),
  [true, false, true],
  "Shared resume still respects each SVG's visibility",
);
principleControllers[0].destroy();
assert.equal(principleObservers[0].disconnected, true);
assert.equal(getEventListeners(principleDoc, "visibilitychange").length, 2);
assert.equal(getEventListeners(principlePreference, "change").length, 2);
assert.deepEqual(principleStates(), [false, false, true]);
showPrinciple(1, true);
assert.deepEqual(
  principleStates(),
  [false, true, true],
  "Destroying one principle leaves the other controllers working",
);
principleControllers.forEach((controller) => controller.destroy());
const principleCallsAfterDestroy = principles.map(({ changes }) => changes.length);
assert.ok(principleObservers.every((observer) => observer.disconnected));
assert.equal(getEventListeners(principleDoc, "visibilitychange").length, 0);
assert.equal(getEventListeners(principlePreference, "change").length, 0);
assert.ok(principles.every(({ attributes }) => attributes.size === 0));
assert.ok(principles.every(({ changes }) => changes.at(-1) === false));
principleVisibility(false);
change(principlePreference, false);
pausePrinciples(false);
principles.forEach((_, index) => showPrinciple(index, true));
principleControllers.forEach((controller) => controller.destroy());
assert.deepEqual(
  principles.map(({ changes }) => changes.length),
  principleCallsAfterDestroy,
  "Unmounted principles ignore queued observer callbacks and repeated cleanup",
);
window.IntersectionObserver = undefined;
const staticPrinciples = principles.map(({ article, svg }) =>
  observeAmbientMotion(article, undefined, svg),
);
staticPrinciples.forEach((controller) => {
  controller.setPaused(true);
  controller.setPaused(false);
});
principleVisibility(true);
principleVisibility(false);
change(principlePreference, true);
change(principlePreference, false);
assert.deepEqual(principleStates(), [false, false, false]);
assert.ok(
  principles.every(({ attributes }) => !attributes.has("data-managed")),
  "Unavailable intersection observation keeps all principle controls hidden",
);
assert.equal(getEventListeners(principleDoc, "visibilitychange").length, 0);
assert.equal(getEventListeners(principlePreference, "change").length, 0);
assert.equal(principleObservers.length, 3);
staticPrinciples.forEach((controller) => controller.destroy());
console.log(
  "Principle motion checks passed: independent SVG gates, shared pause, visibility, reduced motion, cleanup, no RAF, static fallback.",
);
