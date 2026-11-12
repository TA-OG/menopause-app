import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

// The social preview shown when a link to Aunty Mel is shared. Next serves it
// at /opengraph-image and wires the og:image tags itself; twitter-image.tsx
// re-exports it so both card types use the same artwork.
export const alt = 'Aunty Mel — menopause wellness support'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  // Rendered once at build time, so reading from disk here costs nothing at runtime.
  const logo = await readFile(join(process.cwd(), 'public', 'logo.png'))
  const src = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff5db',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={800} height={224} />
        <div
          style={{
            marginTop: 40,
            fontSize: 44,
            color: '#6b204f',
            fontWeight: 600,
          }}
        >
          Every body needs an Aunty Mel
        </div>
      </div>
    ),
    { ...size }
  )
}
