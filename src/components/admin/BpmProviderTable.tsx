"use client"

import { springs } from "@/animations"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

interface ProviderData {
  provider: string
  attempts: number
  successes: number
  rate: number
  avgLatencyMs: number
}

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface1)" }}>
      <div className="p-4">
        <div
          className="h-5 w-40 rounded mb-4 animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-4">
              <div
                className="h-4 flex-1 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-16 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-16 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-12 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-16 rounded animate-pulse"
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

export function BpmProviderTable() {
  const [data, setData] = useState<ProviderData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProviders() {
      try {
        const response = await fetch("/api/admin/bpm-stats?section=providers")
        if (!response.ok) {
          throw new Error("Failed to fetch provider stats")
        }
        const result = (await response.json()) as ProviderData[]
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    }

    fetchProviders()
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
        Failed to load provider stats: {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        No provider data available
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
              <th className="text-right p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Attempts
              </th>
              <th className="text-right p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Successes
              </th>
              <th className="text-right p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Rate
              </th>
              <th className="text-right p-4 font-medium" style={{ color: "var(--color-text3)" }}>
                Avg Latency
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <motion.tr
                key={row.provider}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springs.default, delay: index * 0.05 }}
                style={
                  index < data.length - 1 ? { borderBottom: "1px solid var(--color-border)" } : {}
                }
              >
                <td className="p-4" style={{ color: "var(--color-text)" }}>
                  {row.provider}
                </td>
                <td className="p-4 text-right tabular-nums" style={{ color: "var(--color-text2)" }}>
                  {formatNumber(row.attempts)}
                </td>
                <td className="p-4 text-right tabular-nums" style={{ color: "var(--color-text2)" }}>
                  {formatNumber(row.successes)}
                </td>
                <td className="p-4 text-right tabular-nums">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      background:
                        row.rate >= 70
                          ? "var(--color-success-bg)"
                          : row.rate >= 40
                            ? "var(--color-warning-bg)"
                            : "var(--color-error-bg)",
                      color:
                        row.rate >= 70
                          ? "var(--color-success)"
                          : row.rate >= 40
                            ? "var(--color-warning)"
                            : "var(--color-error)",
                    }}
                  >
                    {row.rate}%
                  </span>
                </td>
                <td
                  className="p-4 text-right tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {row.avgLatencyMs}ms
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
