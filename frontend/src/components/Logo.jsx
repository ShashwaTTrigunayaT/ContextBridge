// The ContextBridge mark: a span carrying weight between two piers, with the
// fact being carried held at the crown. Drawn on a 24px grid in currentColor,
// five shapes only, so it stays legible at 16px in a navigation bar and at
// 32px in a favicon.
export function LogoMark({ size = 24, className, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      focusable="false"
    >
      <path d="M3.7 18.7h16.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7.3 18.7V11.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16.7 18.7V11.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7.3 11.2C7.3 6.6 16.7 6.6 16.7 11.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="2.15" fill="currentColor" />
    </svg>
  );
}
