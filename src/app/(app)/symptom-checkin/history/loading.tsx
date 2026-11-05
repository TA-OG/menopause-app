/** Skeleton in the shape of the loaded page, so nothing jumps when it arrives. */
export default function CheckinHistoryLoading() {
  return (
    <div aria-busy="true" className="space-y-5 py-4">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )
}
