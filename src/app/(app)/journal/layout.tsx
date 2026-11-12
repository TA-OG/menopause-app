import { pageTitle } from '@/lib/page-meta'

export async function generateMetadata() {
  return pageTitle('Journal')
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
