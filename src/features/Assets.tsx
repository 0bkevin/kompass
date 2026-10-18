import { useRef, useState } from "react";
import {
  Download,
  FileText,
  FolderOpen,
  Image,
  Music,
  Plus,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { api, uploadAsset } from "../lib/api";
import { uploadFilesIndividually } from "../lib/workflow-recovery.mjs";
import { Badge, Button, EmptyState, IconButton, Modal } from "../components/ui";
import type { Asset } from "../lib/types";
import { dateLabel } from "../lib/format";
const icons = { image: Image, video: Video, audio: Music, document: FileText };
export default function Assets() {
  const { state, refresh, notify, search } = useWorkspace();
  const [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Asset | null>(null),
    [uploadResults, setUploadResults] = useState<
      Awaited<ReturnType<typeof uploadFilesIndividually>>
    >([]),
    [refreshPending, setRefreshPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const assets = state.assets
    .filter((a) => filter === "all" || a.type === filter)
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
  async function upload(files: FileList | null) {
    if (!files || refreshPending) return;
    setBusy(true);
    setUploadResults([]);
    try {
      const results = await uploadFilesIndividually(
        Array.from(files),
        async (file) => {
          if (file.size > 25 * 1024 * 1024)
            throw new Error(`${file.name} supera el límite de 25 MB.`);
          await uploadAsset(state.brand.id, file);
        },
      );
      setUploadResults(results);
      const uploadedCount = results.filter(
        (result) => result.status === "uploaded",
      ).length;
      const failedCount = results.length - uploadedCount;

      if (uploadedCount > 0) {
        try {
          await refresh();
          setRefreshPending(false);
          notify(
            failedCount
              ? `Se guardaron ${uploadedCount} archivo(s); ${failedCount} no se pudieron subir. Revisa el resultado por archivo.`
              : `${uploadedCount} archivo(s) guardado(s) en tu biblioteca.`,
            failedCount ? "error" : "success",
          );
        } catch {
          setRefreshPending(true);
          notify(
            `Se guardaron ${uploadedCount} archivo(s), pero no se pudo actualizar la biblioteca. Reintenta la actualización; no vuelvas a subirlos.`,
            "error",
          );
        }
      } else {
        notify(
          results.length
            ? `No se pudo subir ningún archivo. Revisa el resultado por archivo.`
            : "Selecciona al menos un archivo.",
          "error",
        );
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function retryRefresh() {
    if (!refreshPending || busy) return;
    setBusy(true);
    try {
      await refresh();
      setRefreshPending(false);
      notify(
        "Biblioteca actualizada. Los archivos guardados ya están visibles.",
      );
    } catch {
      notify(
        "No pudimos actualizar la biblioteca. Vuelve a intentar la actualización; los archivos no se volverán a subir.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOS RECURSOS DE TU MARCA</p>
          <h1>Todo lo que necesitas para crear.</h1>
          <p>
            Imágenes, videos, documentos y referencias, con acceso para tu
            equipo.
          </p>
        </div>
        <Button
          variant="primary"
          busy={busy}
          disabled={state.brand.role === "reviewer" || refreshPending}
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          Subir archivos
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*,.pdf,.txt,.md"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {uploadResults.length > 0 && (
        <section className="card upload-results" aria-live="polite">
          <h2>Resultado de la carga</h2>
          <ul>
            {uploadResults.map((result, index) => (
              <li key={`${result.fileName}-${index}`}>
                <strong>{result.fileName}</strong>:{" "}
                {result.status === "uploaded" ? (
                  <span>Guardado</span>
                ) : (
                  <span>No se pudo subir — {result.message}</span>
                )}
              </li>
            ))}
          </ul>
          {refreshPending && (
            <div role="alert">
              <p>
                Los archivos guardados no se volverán a subir. Reintenta solo la
                actualización de la biblioteca.
              </p>
              <Button busy={busy} onClick={() => void retryRefresh()}>
                Reintentar actualización
              </Button>
            </div>
          )}
        </section>
      )}
      <div className="tabs library-tabs">
        {[
          ["all", "Todos"],
          ["image", "Imágenes"],
          ["video", "Videos"],
          ["document", "Documentos"],
          ["audio", "Audio"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {assets.length ? (
        <div className="asset-grid">
          {assets.map((asset) => {
            const Icon = icons[asset.type];
            return (
              <article className="card asset-card" key={asset.id}>
                <button
                  className="asset-preview"
                  onClick={() => setSelected(asset)}
                >
                  {asset.type === "image" ? (
                    <img src={asset.url} alt={asset.name} />
                  ) : asset.type === "video" ? (
                    <>
                      <video src={asset.url} preload="metadata" />
                      <Video className="asset-video-icon" size={32} />
                    </>
                  ) : (
                    <Icon size={40} />
                  )}
                </button>
                <div className="asset-info">
                  <strong>{asset.name}</strong>
                  <small>
                    {(asset.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                    {dateLabel(asset.createdAt)}
                  </small>
                  <div className="row">
                    <Badge>
                      {asset.type === "image"
                        ? "Imagen"
                        : asset.type === "video"
                          ? "Video"
                          : asset.type === "audio"
                            ? "Audio"
                            : "Documento"}
                    </Badge>
                    <a
                      className="icon-button"
                      title="Descargar archivo"
                      href={asset.url}
                      download={asset.name}
                    >
                      <Download size={16} />
                    </a>
                    <IconButton
                      label="Eliminar archivo"
                      disabled={state.brand.role === "reviewer"}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `¿Eliminar ${asset.name} de la biblioteca?`,
                          )
                        )
                          return;
                        try {
                          await api(
                            `/api/brands/${state.brand.id}/assets/${asset.id}`,
                            { method: "DELETE" },
                          );
                          await refresh();
                          notify("Archivo eliminado.");
                        } catch (e) {
                          notify((e as Error).message, "error");
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen size={30} />}
          title="Dale un lugar a tus recursos"
          action={
            <Button
              disabled={
                state.brand.role === "reviewer" || refreshPending || busy
              }
              onClick={() => input.current?.click()}
            >
              <Plus size={16} />
              Subir mis primeros archivos
            </Button>
          }
        >
          Sube material de marca o referencias. Puedes asociarlos a tus piezas
          desde el estudio. Hasta 25 MB por archivo.
        </EmptyState>
      )}
      <div className="callout">
        <Video size={20} />
        <p>
          La biblioteca admite videos como material de referencia. El editor y
          la generación de video están previstos en el backlog.
        </p>
      </div>
      {selected && (
        <Modal wide title={selected.name} onClose={() => setSelected(null)}>
          <div className="asset-full">
            {selected.type === "image" ? (
              <img src={selected.url} alt={selected.name} />
            ) : selected.type === "video" ? (
              <video src={selected.url} controls />
            ) : selected.type === "audio" ? (
              <audio src={selected.url} controls />
            ) : (
              <FileText size={60} />
            )}
          </div>
          <a
            className="button primary"
            href={selected.url}
            download={selected.name}
          >
            <Download size={16} />
            Descargar original
          </a>
        </Modal>
      )}
    </div>
  );
}
