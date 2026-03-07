/** Thin full-width progress bar — accent fill over muted track */
export default function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height: 3, backgroundColor: 'var(--color-muted)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: 'var(--color-accent)',
          transition: 'width 300ms ease',
        }}
      />
    </div>
  )
}
