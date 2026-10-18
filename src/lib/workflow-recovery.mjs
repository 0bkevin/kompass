export async function uploadFilesIndividually(files, upload) {
  const results = [];
  for (const file of files) {
    try {
      await upload(file);
      results.push({ fileName: file.name, status: "uploaded" });
    } catch (error) {
      results.push({
        fileName: file.name,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export async function createThenRefresh(existingPiece, createPiece, refresh) {
  const piece = existingPiece ?? (await createPiece());
  try {
    await refresh();
    return { status: "ready", piece };
  } catch (error) {
    return { status: "refresh-failed", piece, error };
  }
}
