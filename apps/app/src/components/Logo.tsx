export default function Logo({
  className = '',
  variant = 'header',
}: {
  className?: string;
  variant?: 'header' | 'footer';
}) {
  const src = variant === 'footer' ? '/Footer.svg' : '/Header.svg';
  return (
    <img
      src={src}
      alt="Opus Overseas"
      className={className}
      style={{ display: 'block' }}
    />
  );
}
