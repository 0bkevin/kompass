const snapshot = (draft) =>
  JSON.stringify(
    Object.keys(draft).sort().map((key) => [key, draft[key]]),
  );

/** Tracks the source form independently of renders and pending save requests. */
export function createSourceDraftGuard({ confirmDiscard, onDiscard }) {
  let draft = null;
  let baseline = null;
  let busy = false;
  let saving = false;

  const guard = {
    sync(nextDraft, nextBusy) {
      draft = nextDraft;
      busy = nextBusy;
    },
    open(nextDraft) {
      if (busy || saving || (draft && !guard.confirmLeave())) return false;
      draft = nextDraft;
      baseline = snapshot(nextDraft);
      return true;
    },
    isDirty() {
      return draft !== null && (busy || saving || snapshot(draft) !== baseline);
    },
    confirmLeave() {
      if (draft === null) return true;
      if (busy || saving) return false;
      if (guard.isDirty() && !confirmDiscard()) return false;
      guard.discard();
      return true;
    },
    discard() {
      draft = null;
      baseline = null;
      saving = false;
      onDiscard();
    },
    beginSave() {
      if (draft === null || busy || saving) return false;
      saving = true;
      return true;
    },
    endSave() {
      saving = false;
    },
  };
  return guard;
}
