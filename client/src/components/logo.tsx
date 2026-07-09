export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Jits Library"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="7" fill="currentColor" opacity="0.12" />
      <path
        d="M9 7h11a5 5 0 0 1 2 9.6L25 25h-4.2l-2.8-7.4H12.6V25H9V7zm3.6 7.2h7.1a2.2 2.2 0 0 0 0-4.4h-7.1v4.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">
        <Logo />
      </span>
      <div className="leading-none">
        <div className="font-display font-bold text-[15px] tracking-tight">
          Jits Library
        </div>
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
          BJJ Instructionals
        </div>
      </div>
    </div>
  );
}
