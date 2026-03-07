import { useState } from 'react'

type Illust3DProps = {
  fallback: string
  src?: string
  size?: number
  className?: string
}

export default function Illust3D({
  fallback,
  src,
  size = 48,
  className = '',
}: Illust3DProps) {
  const [imgError, setImgError] = useState(!src)

  if (!imgError && src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`illust-3d ${className}`}
        style={{
          objectFit: 'contain',
          borderRadius: size * 0.22,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      className={`illust-3d flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'linear-gradient(145deg, var(--color-accent-dim) 0%, var(--color-surface-dim) 100%)',
        boxShadow: '0 4px 16px rgba(107, 78, 232, 0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: size * 0.48, color: 'var(--color-accent)' }}
      >
        {fallback}
      </span>
    </div>
  )
}
