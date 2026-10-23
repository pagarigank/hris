import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  secondaryAction?: ReactNode
}

export default function PageHeader({ title, subtitle, action, secondaryAction }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  )
}
