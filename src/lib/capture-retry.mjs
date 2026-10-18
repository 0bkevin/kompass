export async function getOrUploadCaptureAsset(file, cache, upload) {
  if (!file) return null;
  if (cache.current?.file === file) return cache.current.asset;

  const asset = await upload(file);
  cache.current = { file, asset };
  return asset;
}
