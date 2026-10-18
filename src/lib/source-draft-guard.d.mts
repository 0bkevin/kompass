export function createSourceDraftGuard<Draft extends object>(options: {
  confirmDiscard: () => boolean;
  onDiscard: () => void;
}): {
  sync: (draft: Draft | null, busy: boolean) => void;
  open: (draft: Draft) => boolean;
  isDirty: () => boolean;
  confirmLeave: () => boolean;
  discard: () => void;
  beginSave: () => boolean;
  endSave: () => void;
};
