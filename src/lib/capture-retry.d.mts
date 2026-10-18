export interface CaptureAssetCache<TFile extends object, TAsset> {
  current: { file: TFile; asset: TAsset } | null;
}

export function getOrUploadCaptureAsset<TFile extends object, TAsset>(
  file: TFile | null,
  cache: CaptureAssetCache<TFile, TAsset>,
  upload: (file: TFile) => Promise<TAsset>,
): Promise<TAsset | null>;
