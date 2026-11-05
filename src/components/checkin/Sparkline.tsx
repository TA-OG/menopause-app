/**
 * A tiny line chart for one metric across the trend window.
 *
 * Decorative by design (aria-hidden): the tile it sits in carries the same
 * information as text, which is what a screen reader gets. Unlogged days are
 * gaps in the line, never zeros — joining across a gap would draw a trend she
 * did not record.
 */

interface SparklineProps {
  values: (number | null)[]
  min: number
  max: number
}

const WIDTH = 120
const HEIGHT = 32
const PADDING = 3

export default function Sparkline({ values, min, max }: SparklineProps) {
  if (values.length === 0) return null

  const step = values.length > 1 ? (WIDTH - PADDING * 2) / (values.length - 1) : 0
  const range = max - min || 1
  const point = (value: number, index: number) => ({
    x: PADDING + index * step,
    y: PADDING + (1 - (Math.min(Math.max(value, min), max) - min) / range) * (HEIGHT - PADDING * 2),
  })

  // Split into runs of consecutive logged days.
  const runs: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) runs.push(current)
      current = []
    } else {
      current.push(point(value, index))
    }
  })
  if (current.length) runs.push(current)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="h-8 w-full text-brand-700"
    >
      {runs.map((run, i) =>
        run.length === 1 ? (
          // A lone day has no neighbour to join, so it is drawn as a dot.
          <circle key={i} cx={run[0].x} cy={run[0].y} r={1.8} fill="currentColor" />
        ) : (
          <polyline
            key={i}
            points={run.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      )}
    </svg>
  )
}
