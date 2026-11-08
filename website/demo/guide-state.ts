export type GuideProgress = {
  reviewedSignature: string | null;
  completed: boolean;
};

export type GuideSnapshot = {
  signature: string | null;
  editing: boolean;
  reviewing: boolean;
  saved: boolean;
};

export const initialGuideProgress: GuideProgress = {
  reviewedSignature: null,
  completed: false,
};

export function advanceGuide(
  progress: GuideProgress,
  snapshot: GuideSnapshot,
): GuideProgress {
  const { signature, editing, reviewing, saved } = snapshot;
  const reviewedSignature =
    signature !== null && reviewing
      ? signature
      : progress.reviewedSignature === signature
        ? progress.reviewedSignature
        : null;
  // The native saved notice expires; the guide remembers a confirmed save
  // until another edit begins. A pending draft always takes precedence.
  const completed =
    editing || signature !== null ? false : saved || progress.completed;

  return reviewedSignature === progress.reviewedSignature &&
    completed === progress.completed
    ? progress
    : { reviewedSignature, completed };
}

export function guidePhase(
  progress: GuideProgress,
  snapshot: GuideSnapshot,
): "edit" | "review" | "save" | "done" {
  const current = advanceGuide(progress, snapshot);
  if (snapshot.editing) return "edit";
  if (snapshot.signature !== null)
    return current.reviewedSignature === snapshot.signature ? "save" : "review";
  return current.completed ? "done" : "edit";
}
