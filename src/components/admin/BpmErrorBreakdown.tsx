"use client"

import { springs } from "@/animations"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

interface ErrorBreakdownData {
  provider: string
  errorReason: string
  count: number
}

interface PivotRow {
  provider: string
  not_found: number
  rate_limit: number
  api_error: number
  timeout: number
  unknown: number
  total: number
}

const ERROR_REASONS = ["not_found", "rate_limit", "api_error", "timeout", "unknown"] as const

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface1)" }}>
      <div className="p-4">
        <div
          className="h-5 w-48 rounded mb-4 animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-4">
              <div
                className="h-4 flex-1 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              {ERROR_REASONS.map(reason => (
                <div
                  key={reason}
                  className="h-4 w-12 rounded animate-pulse"
                  style={{ background: "var(--color-surface2)" }}
                />
              ))}
              <div
                className="h-4 w-14 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

function formatErrorReason(reason: string): string {
  return reason
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function pivotData(data: ErrorBreakdownData[]): PivotRow[] {
  const byProvider = new Map<string, PivotRow>()

  for (const entry of data) {
    let row = byProvider.get(entry.provider)
    if (!row) {
      row = {
        provider: entry.provider,
        not_found: 0,
        rate_limit: 0,
        api_error: 0,
        timeout: 0,
        unknown: 0,
        total: 0,
      }
      byProvider.set(entry.provider, row)
    }

    const reason = entry.errorReason as keyof Omit<PivotRow, "provider" | "total">
    if (reason in row) {
      row[reason] = entry.count
      row.total += entry.count
    }
  }

  return Array.from(byProvider.values()).sort((a, b) => b.total - a.total)
}

export function BpmErrorBreakdown() {
  const [data, setData] = useState<ErrorBreakdownData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchErrors() {
      try {
        const response = await fetch("/api/admin/bpm-stats?section=errors")
        if (!response.ok) {
          throw new Error("Failed to fetch error breakdown")
        }
        const result = (await response.json()) as ErrorBreakdownData[]
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    }

    fetchErrors()
  }, [])

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        Failed to load error breakdown: {error}
      </div>
    )
  }

  const pivotedData = pivotData(data)

  if (pivotedData.length === 0) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        No error data available
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface1)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th className="text-left p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Provider
              </th>
              {ERROR_REASONS.map(reason => (
                <th
                  key={reason}
                  className="text-right p-4 font-medium"
                  style={{ color: "var(--color-text3)" }}
                >
                  {formatErrorReason(reason)}
                </th>
              ))}
              <th className="text-right p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {pivotedData.map((row, index) => (
              <motion.tr
                key={row.provider}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springs.default, delay: index * 0.05 }}
                style={
                  index < pivotedData.length - 1
                    ? { borderBottom: "1px solid var(--color-border)" }
                    : {}
                }
              >
                <td className="p-4" style={{ color: "var(--color-text)" }}>
                  {row.provider}
                </td>
                {ERROR_REASONS.map(reason => {
                  const value = row[reason]
                  return (
                    <td
                      key={reason}
                      className="p-4 text-right tabular-nums"
                      style={{
                        color: value > 0 ? "var(--color-text2)" : "var(--color-text-muted)",
                      }}
                    >
                      {value > 0 ? formatNumber(value) : "-"}
                    </td>
                  )
                })}
                <td className="p-4 text-right tabular-nums font-medium">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      background: "var(--color-error-bg)",
                      color: "var(--color-error)",
                    }}
                  >
                    {formatNumber(row.total)}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
