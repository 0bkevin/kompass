import type { Asset } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "El servidor devolvió una respuesta inesperada." }));
  if (!response.ok)
    throw new ApiError(
      data.error || `Error ${response.status}`,
      response.status,
    );
  return data as T;
}
export const json = (value: unknown) => JSON.stringify(value);
export function uploadAsset(brandId: string, file: File, pieceId?: string) {
  const body = new FormData();
  body.append("file", file);
  if (pieceId) body.append("pieceId", pieceId);
  return api<Asset>(`/api/brands/${brandId}/assets`, { method: "POST", body });
}
