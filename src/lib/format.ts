import type { Piece } from "./types";
export const statusNames: Record<Piece["status"], string> = {
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
};
export const saturationNames = {
  low: "Poco explorado",
  medium: "En conversación",
  high: "Muy repetido",
  unknown: "Sin evidencia suficiente",
};
export const formatNames: Record<string, string> = {
  reel: "Reel",
  carousel: "Carrusel",
  post: "Post",
  video: "Video",
  newsletter: "Newsletter",
  article: "Artículo",
  discussion: "Conversación",
  link: "Enlace",
  image: "Imagen",
};
export function timeAgo(value?: string) {
  if (!value) return "Sin observar";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60000) return "Ahora";
  if (delta < 3600000) return `Hace ${Math.floor(delta / 60000)} min`;
  if (delta < 86400000) return `Hace ${Math.floor(delta / 3600000)} h`;
  return `Hace ${Math.floor(delta / 86400000)} d`;
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeExternalUrl(value?: string) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
