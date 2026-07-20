import { useId } from 'react'

const points = (values = []) => values.map((point) => `${point.x},${point.y}`).join(' ')

export function floorplanBackgroundUrl(floorplan) {
  if (!floorplan?.has_background) return null
  const revision = floorplan.background_revision || floorplan.updated_at || 'current'
  return `/api/floorplan/background?v=${encodeURIComponent(revision)}`
}

export default function FloorplanSvg({ floorplan, className = 'room-shape', interactive = false }) {
  const rawId = useId().replace(/:/g, '')
  const clipId = `floor-clip-${rawId}`
  const wallMaskId = `wall-mask-${rawId}`
  const data = floorplan?.data
  if (!data) return null
  const { width, height } = data.canvas
  const backgroundUrl = floorplanBackgroundUrl(floorplan)
  const strokeWidth = Math.max(width, height) * 0.0035
  const labelSize = Math.max(width, height) * 0.011

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={!interactive}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={points(data.boundary)} />
        </clipPath>
        <mask id={wallMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="white" />
          {(data.doors || []).map((door) => (
            <line
              key={door.id}
              x1={door.x - door.width / 2}
              y1={door.y}
              x2={door.x + door.width / 2}
              y2={door.y}
              stroke="black"
              strokeWidth={strokeWidth * 4}
              transform={`rotate(${door.rotation} ${door.x} ${door.y})`}
            />
          ))}
        </mask>
      </defs>

      <polygon className="room-floor" points={points(data.boundary)} />
      {backgroundUrl && (
        <image
          href={backgroundUrl}
          x="0"
          y="0"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
          opacity={data.background?.opacity ?? 0.35}
          clipPath={`url(#${clipId})`}
        />
      )}

      <g className="room-walls" mask={`url(#${wallMaskId})`}>
        <polygon points={points(data.boundary)} />
        {(data.walls || []).map((wall) => (
          <line key={wall.id} x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} />
        ))}
      </g>

      <g className="room-labels">
        {(data.labels || []).map((label) => (
          <text
            key={label.id}
            x={label.x}
            y={label.y}
            style={{ fontSize: labelSize, letterSpacing: labelSize * 0.14 }}
          >
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  )
}
