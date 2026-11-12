import { pageTitle } from '@/lib/page-meta'

export async function generateMetadata() {
  return pageTitle('WaitlistPartner', 'formTitle')
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
