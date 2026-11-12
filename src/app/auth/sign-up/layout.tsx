import { pageTitle } from '@/lib/page-meta'

export async function generateMetadata() {
  return pageTitle('Meta.titles', 'signUp', { noindex: true })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
