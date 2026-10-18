export type UploadFileResult =
  | { fileName: string; status: "uploaded" }
  | { fileName: string; status: "failed"; message: string };

export function uploadFilesIndividually<TFile extends { name: string }>(
  files: readonly TFile[],
  upload: (file: TFile) => Promise<unknown>,
): Promise<UploadFileResult[]>;

export type CreateThenRefreshResult<TPiece> =
  | { status: "ready"; piece: TPiece }
  | { status: "refresh-failed"; piece: TPiece; error: unknown };

export function createThenRefresh<TPiece>(
  existingPiece: TPiece | null,
  createPiece: () => Promise<TPiece>,
  refresh: () => Promise<void>,
): Promise<CreateThenRefreshResult<TPiece>>;
