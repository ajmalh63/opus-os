// Workspace brand logo image wrapper for the navigation shell.
export default function WorkspaceLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/opus-logo.svg"
        alt="Opus Overseas"
        className={compact ? "h-7 w-auto" : "h-7 w-auto"}
        style={{ display: 'block' }}
      />
      {!compact && (
        <span className="font-display text-sm font-extrabold tracking-wider text-white">
          OPUS<span className="text-brand-gold">OS</span>
        </span>
      )}
    </div>
  );
}
