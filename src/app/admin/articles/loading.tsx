/**
 * Shown while the article list or one article is being fetched.
 *
 * A skeleton rather than a spinner: the shape of what is coming is already
 * known, and a page that keeps its layout while loading does not jump when
 * the content lands.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading articles">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-96 max-w-full bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-32 bg-gray-200 rounded-xl" />
      </div>

      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="h-4 w-20 bg-gray-100 rounded-full" />
            <div className="h-4 w-2/3 bg-gray-200 rounded mt-3" />
            <div className="h-3 w-40 bg-gray-100 rounded mt-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
