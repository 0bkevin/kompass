export function KompassMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="11" height="11" rx="2" fill="currentColor" />
      <rect
        x="18"
        y="1"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="1"
        y="18"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="18" y="18" width="11" height="11" rx="2" fill="currentColor" />
      <path
        d="m10 10 10 10M10 20l10-10"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
