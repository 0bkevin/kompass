import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Badge, Button, Modal } from "../components/ui";
import { ApiError, api, json } from "../lib/api";
import type {
  Piece,
  PublicationDestination,
  PublicationReceipt,
  PublicationState,
} from "../lib/types";
import { useWorkspace } from "../lib/workspace";
import "./publish-piece.css";

function destinationName(destination: PublicationDestination) {
  return `Webhook · ${destination.url}`;
}

function Receipt({ receipt }: { receipt: PublicationReceipt }) {
  const date = new Date(receipt.publishedAt);
  return (
    <div className="stack" role="status">
      <Badge tone="green">
        {receipt.provider === "legacy"
          ? "Envío anterior registrado"
          : "Webhook aceptó la pieza"}
      </Badge>
      <p>
        {receipt.provider === "legacy"
          ? "Conservamos el recibo histórico de un conector que ya no está disponible."
          : `El endpoint aceptó la solicitud (HTTP ${receipt.status ?? "2xx"}). Comprueba en tu servicio la publicación final en ${receipt.destination?.provider === "webhook" ? "el canal correspondiente" : "el destino"}.`}
      </p>
      <details>
        <summary>Ver recibo del conector</summary>
        <div className="stack small" style={{ overflowWrap: "anywhere" }}>
          {receipt.destination && <p>{destinationName(receipt.destination)}</p>}
          <p>
            {Number.isNaN(date.getTime())
              ? "Fecha no disponible"
              : date.toLocaleString("es", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
          </p>
          {receipt.requestId && <p>Identificador: {receipt.requestId}</p>}
        </div>
      </details>
    </div>
  );
}

export default function PublishPiece({
  piece,
  disabled,
  onBusyChange,
  onPublished,
}: {
  piece: Piece;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onPublished: (piece: Piece) => void;
}) {
  const { state, refresh, notify, navigate } = useWorkspace();
  const [delivery, setDelivery] = useState<PublicationState | null>(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState("");
  const [sendError, setSendError] = useState("");
  const sendingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const endpoint = `/api/brands/${state.brand.id}/pieces/${piece.id}/publish`;

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      setChecking(true);
      try {
        const current = await api<PublicationState>(endpoint, { signal });
        if (signal?.aborted) return null;
        setDelivery(current);
        setReadError("");
        return current;
      } catch {
        if (signal?.aborted) return null;
        setDelivery(null);
        setReadError(
          "No pudimos consultar el estado del envío. Consulta de nuevo antes de enviar para evitar duplicados.",
        );
        return null;
      } finally {
        if (!signal?.aborted) setChecking(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus, piece.status, piece.approvalVersion]);

  useEffect(() => {
    if (open || checking || !triggerRef.current) return;
    const frame = requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      triggerRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, checking]);

  const reviewer = state.brand.role === "reviewer";
  const versionChanged =
    !!delivery && delivery.approvalVersion !== piece.approvalVersion;
  const approvalValid =
    !!delivery && ["approved", "scheduled"].includes(delivery.pieceStatus);
  const pending =
    delivery?.status === "sending" || delivery?.status === "uncertain";
  const canSend =
    !reviewer &&
    !disabled &&
    !checking &&
    !sending &&
    approvalValid &&
    !versionChanged &&
    !!delivery?.destination &&
    ["ready", "failed"].includes(delivery.status);

  async function send() {
    if (!canSend || !delivery || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    onBusyChange(true);
    setSendError("");
    try {
      const saved = await api<Piece>(endpoint, {
        method: "POST",
        body: json({
          expectedApprovalVersion: piece.approvalVersion,
          expectedDestinationKey: delivery.destinationKey,
        }),
      });
      onPublished(saved);
      setDelivery({
        ...delivery,
        status: "delivered",
        pieceStatus: saved.status,
        receipt: saved.publicationReceipt,
      });
      setOpen(false);
      notify(
        "El webhook aceptó la pieza. Comprueba la publicación final en tu servicio.",
      );
      await refresh().catch(() =>
        setReadError(
          "El recibo está guardado. Actualiza el estado para sincronizar Studio.",
        ),
      );
    } catch (error) {
      setSendError(
        error instanceof ApiError
          ? error.message
          : "Se interrumpió la conexión. Consulta el estado para confirmar si el conector recibió la pieza.",
      );
      // A read can reconcile a lost response; it must never repeat the POST.
      const current = await loadStatus();
      if (current?.status === "delivered") {
        setOpen(false);
        await refresh().catch(() =>
          setReadError(
            "El recibo está guardado. Actualiza el estado para sincronizar Studio.",
          ),
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
      onBusyChange(false);
    }
  }

  const feedback = (
    <>
      {readError && (
        <p className="form-error" role="alert">
          {readError}
        </p>
      )}
      {sendError && delivery?.status !== "delivered" && (
        <p className="form-error" role="alert">
          {sendError}
        </p>
      )}
      {pending && (
        <div role="status">
          <Badge tone="amber">
            {delivery.status === "sending"
              ? "Envío en curso"
              : "Envío sin confirmar"}
          </Badge>
          <p>
            Comprueba el destino. El envío puede haberse recibido y está
            bloqueado para evitar duplicados. Consultar el estado no vuelve a
            enviar la pieza.
          </p>
        </div>
      )}
      {delivery?.status === "failed" && (
        <p role="status">
          El conector rechazó el envío. Revisa su configuración y confirma de
          nuevo para reintentarlo.
        </p>
      )}
      {versionChanged && (
        <p className="form-error" role="alert">
          La versión de Studio cambió. Actualiza la pieza y revisa su aprobación
          antes de enviar.
        </p>
      )}
      {delivery && !approvalValid && delivery.status !== "delivered" && (
        <p>La versión actual necesita aprobación antes de enviarse.</p>
      )}
    </>
  );

  return (
    <section
      className="stack publication-actions"
      aria-label="Envío con conector"
      aria-busy={sending}
    >
      {delivery?.status === "delivered" && delivery.receipt ? (
        <>
          <Receipt receipt={delivery.receipt} />
          {readError && (
            <p className="form-error" role="alert">
              {readError}
            </p>
          )}
        </>
      ) : (
        <>
          {delivery?.destination && (
            <p className="small" style={{ overflowWrap: "anywhere" }}>
              <strong>Destino:</strong> {destinationName(delivery.destination)}
            </p>
          )}
          {checking && !delivery && (
            <p role="status">Consultando el estado del conector…</p>
          )}
          {!checking && delivery && !delivery.destination && (
            <>
              <p>
                No hay un conector de envío disponible. Usa «Exportar» para
                llevar esta pieza a tu canal y publicarla allí.
              </p>
              {delivery.unavailableReason && (
                <details>
                  <summary>Ver estado de la conexión</summary>
                  <p>{delivery.unavailableReason}</p>
                </details>
              )}
            </>
          )}
          {reviewer && (
            <p>
              Un propietario o editor puede enviar esta pieza. Puedes consultar
              su estado y recibo.
            </p>
          )}
          {disabled && !sending && (
            <p>
              Resuelve los cambios sin guardar o la operación actual antes de
              enviar la versión aprobada.
            </p>
          )}
          {!open && feedback}
          {!pending && (delivery?.destination || checking || readError) && (
            <Button
              variant="primary"
              disabled={!canSend}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setOpen(true);
                setSendError("");
                void loadStatus();
              }}
            >
              <Send size={16} />
              {delivery?.status === "failed"
                ? "Revisar y reintentar envío"
                : "Enviar ahora"}
            </Button>
          )}
          {!checking && delivery && !delivery.destination && !reviewer && (
            <Button onClick={() => navigate("settings")}>
              Ver opciones de conexión
            </Button>
          )}
        </>
      )}
      {!open && (readError || pending || versionChanged) && (
        <Button
          busy={checking}
          disabled={sending}
          onClick={() => {
            void loadStatus();
            void refresh().catch(() => {});
          }}
        >
          Consultar estado
        </Button>
      )}
      {open && (
        <Modal
          title="Confirmar envío de la pieza"
          onClose={() => {
            if (!sendingRef.current) setOpen(false);
          }}
        >
          <div className="modal-body stack publication-dialog">
            <p>
              <strong>{piece.title}</strong>
            </p>
            {delivery?.destination && (
              <p style={{ overflowWrap: "anywhere" }}>
                <strong>Destino:</strong>{" "}
                {destinationName(delivery.destination)}
              </p>
            )}
            <p>
              El webhook recibirá la pieza aprobada, sus escenas y las
              referencias de sus recursos. Su aceptación no confirma la
              publicación final en {piece.channel}; compruébala en tu servicio.
            </p>
            {delivery?.destination?.provider === "webhook" &&
              delivery.destination.parametersHidden && (
                <p className="small muted">
                  Los parámetros de la URL se omiten aquí por seguridad.
                </p>
              )}
            <p>
              Este envío es inmediato. La fecha de la grilla sólo organiza el
              calendario.
            </p>
            {feedback}
          </div>
          <div className="modal-actions publication-dialog-actions">
            <Button disabled={sending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {(readError || pending || versionChanged) && (
              <Button
                busy={checking}
                disabled={sending}
                onClick={() => {
                  void loadStatus();
                  void refresh().catch(() => {});
                }}
              >
                Consultar estado
              </Button>
            )}
            {!pending && (
              <Button
                variant="primary"
                busy={sending}
                disabled={!canSend}
                onClick={() => void send()}
              >
                {sending
                  ? "Enviando…"
                  : delivery?.status === "failed"
                    ? "Confirmar reintento"
                    : "Confirmar y enviar ahora"}
              </Button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
