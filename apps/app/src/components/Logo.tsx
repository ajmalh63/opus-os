export default function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/opus-logo.svg"
      alt="Opus Overseas"
      className={className}
      style={{ display: 'block' }}
    />
  );
}
