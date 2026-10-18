import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { X, ArrowUpRight, LoaderCircle } from "lucide-react";
export function Button({
  children,
  variant = "secondary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ""}`}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function IconButton({
  children,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      type="button"
      title={label}
      aria-label={label}
      className={`icon-button ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Field({
  label,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon || <ArrowUpRight />}
      </div>
      <div className="empty-copy">
        <h3>{title}</h3>
        <p>{children}</p>
        {action && <div className="empty-action">{action}</div>}
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function focusableElements() {
      return Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.tabIndex >= 0 &&
          element.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          element.getAttribute("aria-disabled") !== "true" &&
          !element.closest('[inert],[aria-hidden="true"]')
        );
      });
    }
    function isTopmostVisibleModal() {
      const visibleBackdrops = Array.from(
        document.querySelectorAll<HTMLElement>("[data-modal-backdrop]"),
      ).filter((backdrop) => {
        const style = window.getComputedStyle(backdrop);
        return (
          backdrop.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !backdrop.closest('[inert],[aria-hidden="true"]')
        );
      });
      return visibleBackdrops.at(-1)?.contains(ref.current) ?? false;
    }
    const listener = (e: KeyboardEvent) => {
      if (!isTopmostVisibleModal()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === "Tab") {
        const elements = focusableElements();
        if (!elements.length) {
          e.preventDefault();
          ref.current?.focus();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        const active = document.activeElement as HTMLElement;
        const activeIsFocusable = elements.includes(active);
        if (e.shiftKey && (active === first || !activeIsFocusable)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !activeIsFocusable)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      if (prev?.isConnected) prev.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      data-modal-backdrop
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
