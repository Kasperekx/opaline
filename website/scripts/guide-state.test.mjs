import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGuide,
  guidePhase,
  initialGuideProgress,
} from "../demo/guide-state.ts";

const idle = {
  signature: null,
  editing: false,
  reviewing: false,
  saved: false,
};
const pending = { ...idle, signature: "member:1|role:editor" };
const reviewed = { ...pending, reviewing: true };
const saved = { ...idle, saved: true };

test("real edits progress through stage, review, and confirmed save", () => {
  let progress = initialGuideProgress;
  assert.equal(guidePhase(progress, idle), "edit");
  assert.equal(guidePhase(progress, { ...pending, editing: true }), "edit");
  assert.equal(guidePhase(progress, pending), "review");

  progress = advanceGuide(progress, reviewed);
  assert.equal(progress.reviewedSignature, pending.signature);
  assert.equal(guidePhase(progress, pending), "save");

  progress = advanceGuide(progress, saved);
  assert.equal(guidePhase(progress, saved), "done");
  assert.equal(progress.reviewedSignature, null);
});

test("completion survives expiry of the native saved notice", () => {
  const completed = advanceGuide(initialGuideProgress, saved);
  assert.equal(completed.completed, true);
  assert.strictEqual(advanceGuide(completed, idle), completed);
  assert.equal(guidePhase(completed, idle), "done");
});

test("opening an editor after completion returns to edit even with a saved notice", () => {
  const completed = advanceGuide(initialGuideProgress, saved);
  const editing = { ...saved, editing: true };
  const progress = advanceGuide(completed, editing);
  assert.equal(progress.completed, false);
  assert.equal(guidePhase(completed, editing), "edit");
  assert.equal(guidePhase(progress, idle), "edit");
  assert.equal(advanceGuide(completed, pending).completed, false);
  assert.equal(guidePhase(completed, pending), "review");
});

test("a changed draft must be reviewed again, including when returning to an earlier value", () => {
  const progress = advanceGuide(initialGuideProgress, reviewed);
  const modified = { ...pending, signature: "member:1|role:viewer" };
  const invalidated = advanceGuide(progress, modified);
  assert.equal(invalidated.reviewedSignature, null);
  assert.equal(guidePhase(progress, modified), "review");
  assert.equal(guidePhase(invalidated, pending), "review");
  const reReviewed = advanceGuide(invalidated, {
    ...modified,
    reviewing: true,
  });
  assert.equal(guidePhase(reReviewed, modified), "save");
});

test("discard clears the reviewed draft without completing the guide", () => {
  const progress = advanceGuide(initialGuideProgress, reviewed);
  const discarded = advanceGuide(progress, idle);
  assert.deepEqual(discarded, initialGuideProgress);
  assert.equal(guidePhase(progress, idle), "edit");
  assert.equal(guidePhase(discarded, pending), "review");
});

test("a confirmed direct save completes; pending or active edits cannot complete", () => {
  assert.equal(guidePhase(initialGuideProgress, saved), "done");
  const directSave = advanceGuide(initialGuideProgress, saved);
  assert.equal(directSave.completed, true);
  const stillPending = { ...pending, saved: true };
  assert.equal(advanceGuide(directSave, stillPending).completed, false);
  assert.equal(guidePhase(directSave, stillPending), "review");
});

test("unchanged snapshots preserve identity and never mutate initial progress", () => {
  assert.strictEqual(
    advanceGuide(initialGuideProgress, idle),
    initialGuideProgress,
  );
  assert.strictEqual(
    advanceGuide(initialGuideProgress, pending),
    initialGuideProgress,
  );
  const progress = advanceGuide(initialGuideProgress, reviewed);
  assert.strictEqual(advanceGuide(progress, reviewed), progress);
  assert.strictEqual(advanceGuide(progress, pending), progress);
  assert.deepEqual(initialGuideProgress, {
    reviewedSignature: null,
    completed: false,
  });
});
