import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getRecord, UPLOAD_DIR } from "./db.mjs";

export const MAX_PUBLICATION_ASSET_BYTES = 25 * 1024 * 1024;

function unavailable() {
  return Object.assign(
    new Error(
      "No se pudo leer un recurso asociado. Revisa los archivos antes de enviar la pieza.",
    ),
    { status: 409 },
  );
}

// The receiver cannot fetch session-protected asset URLs. Send only the files
// explicitly attached to this approved piece, without credentials or disk paths.
export async function publicationAssets(brandId, piece) {
  const assets = [];
  let total = 0;
  for (const id of new Set(piece.assetIds || [])) {
    const asset = getRecord(brandId, "assets", id);
    if (!asset) throw unavailable();
    const filePath = asset.storageName
      ? path.resolve(UPLOAD_DIR, asset.storageName)
      : asset.filePath && path.resolve(asset.filePath);
    if (!filePath || path.dirname(filePath) !== UPLOAD_DIR) throw unavailable();
    let file;
    try {
      file = await fsp.open(
        filePath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      const info = await file.stat();
      if (!info.isFile()) throw unavailable();
      if (info.size > MAX_PUBLICATION_ASSET_BYTES - total)
        throw Object.assign(
          new Error(
            "Los recursos superan 25 MB en total. Reduce los archivos o descárgalos para publicar manualmente.",
          ),
          { status: 413 },
        );
      const bytes = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!bytesRead) throw unavailable();
        offset += bytesRead;
      }
      if ((await file.read(Buffer.alloc(1), 0, 1, offset)).bytesRead)
        throw unavailable();
      total += bytes.length;
      assets.push({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        mimeType: asset.mimeType,
        size: bytes.length,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
        ...(asset.duration ? { duration: asset.duration } : {}),
        encoding: "base64",
        data: bytes.toString("base64"),
      });
    } catch (error) {
      if ([409, 413].includes(error.status)) throw error;
      throw unavailable();
    } finally {
      await file?.close();
    }
  }
  return assets;
}
