const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'Due for Promotion': 'bg-emerald-100 text-emerald-800 ring-emerald-600/30 font-semibold',
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Regular: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',

  Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PendingReview: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'In Progress': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  InProgress: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Probationary: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Processing: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Draft: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'High Potential': 'bg-blue-50 text-blue-700 ring-blue-600/20 font-semibold',
  Endorsed: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  Developing: 'bg-slate-50 text-slate-700 ring-slate-600/20',
  Evaluated: 'bg-teal-50 text-teal-700 ring-teal-600/20',

  Rejected: 'bg-red-50 text-red-700 ring-red-600/20',
  Disqualified: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Suspended: 'bg-red-50 text-red-700 ring-red-600/20',
  Expired: 'bg-red-50 text-red-700 ring-red-600/20',
  Separated: 'bg-red-50 text-red-700 ring-red-600/20',

  'On Leave': 'bg-purple-50 text-purple-700 ring-purple-600/20',
  Contractual: 'bg-purple-50 text-purple-700 ring-purple-600/20',

  Cancelled: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  Inactive: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  Unknown: 'bg-gray-50 text-gray-600 ring-gray-500/20',
}

const DEFAULT_STYLE = 'bg-gray-50 text-gray-600 ring-gray-500/20'

interface StatusBadgeProps {
  status: string
  className?: string
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || DEFAULT_STYLE

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style} ${className}`}
    >
      {status}
    </span>
  )
}
