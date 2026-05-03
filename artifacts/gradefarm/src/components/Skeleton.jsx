const pulse = `
  @keyframes sk-pulse {
    0%   { opacity: 0.45; }
    50%  { opacity: 0.9; }
    100% { opacity: 0.45; }
  }
`

export default function Skeleton({ width = '100%', height = 16, radius = 8, style = {} }) {
  return (
    <>
      <style>{pulse}</style>
      <div
        style={{
          width,
          height,
          borderRadius: radius,
          background: 'rgba(255,255,255,0.07)',
          animation: 'sk-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
          ...style,
        }}
      />
    </>
  )
}

export function SkeletonRow({ theme }) {
  const isDark = theme !== 'light'
  const bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const border = isDark ? 'rgba(255,255,255,0.07)' : '#e2e5f0'
  return (
    <>
      <style>{pulse}</style>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
      }}>
        <Skeleton width={28} height={14} radius={4} />
        <Skeleton width={32} height={32} radius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="55%" height={13} radius={6} />
          <Skeleton width="35%" height={10} radius={6} />
        </div>
        <Skeleton width={64} height={13} radius={6} />
      </div>
    </>
  )
}
