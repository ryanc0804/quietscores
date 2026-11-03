export function ScoreCardSkeleton() {
  return (
    <div className="score-card skeleton-card" aria-hidden="true">
      <div className="sk-row">
        <span className="sk sk-pill" />
        <span className="sk sk-pill short" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="sk-row team">
          <span className="sk sk-circle" />
          <span className="sk sk-line" />
          <span className="sk sk-score" />
        </div>
      ))}
    </div>
  )
}

export function ScoresSkeleton({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => <ScoreCardSkeleton key={i} />)}
      <span className="visually-hidden" role="status">Loading scores…</span>
    </>
  )
}

export function SummarySkeleton() {
  return (
    <div className="summary-skeleton" aria-hidden="true">
      <div className="sk-header">
        <span className="sk sk-circle lg" />
        <span className="sk sk-block" />
        <span className="sk sk-circle lg" />
      </div>
      <div className="sk-tabs">
        {[0, 1, 2, 3].map((i) => <span key={i} className="sk sk-pill" />)}
      </div>
      <div className="sk-panels">
        <span className="sk sk-panel" />
        <span className="sk sk-panel short" />
      </div>
    </div>
  )
}
