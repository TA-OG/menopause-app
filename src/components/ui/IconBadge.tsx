import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * The round icon that sits above a message on empty, confirmation and notice
 * screens. One component so those screens share a size, shape and colour —
 * they used to open with whichever emoji came to mind.
 */
export default function IconBadge({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-800', className)}
    >
      <Icon className="h-7 w-7" />
    </div>
  )
}
