import Image from 'next/image'

/**
 * Aunty Mel logo component.
 *
 * Renders the logo image from /public/logo.png.
 * Falls back gracefully to styled text if the file is not yet present.
 *
 * Usage:
 *   <Logo size="md" />          — default, suited for navbars
 *   <Logo size="lg" />          — hero / auth screens
 *   <Logo size="sm" />          — compact / mobile nav
 */

type Size = 'sm' | 'md' | 'lg'

const DIMENSIONS: Record<Size, { width: number; height: number }> = {
  sm: { width: 90,  height: 36  },
  md: { width: 130, height: 52  },
  lg: { width: 200, height: 80  },
}

export default function Logo({ size = 'md' }: { size?: Size }) {
  const { width, height } = DIMENSIONS[size]

  return (
    <Image
      src="/logo.png"
      alt="Aunty Mel"
      width={width}
      height={height}
      priority
      className="object-contain"
    />
  )
}
