"use client"

import { springs } from "@/animations"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface TimeSeriesEntry {
  date: string
  provider: string
  attempts: number
  successes: number
}

interface ChartDataPoint {
  date: string
  [provider: string]: string | number
}

const PROVIDER_COLORS: Record<string, string> = {
  Turso: "#3b82f6",
  GetSongBPM: "#22c55e",
  Deezer: "#f59e0b",
  ReccoBeats: "#ec4899",
  RapidAPISpotify: "#8b5cf6",
}

function LoadingSkeleton() {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-surface1)" }}>
      <div
        className="h-5 w-48 rounded mb-4 animate-pulse"
        style={{ background: "var(--color-surface2)" }}
      />
      <div className="h-64 rounded animate-pulse" style={{ background: "var(--color-surface2)" }} />
    </div>
  )
}

function transformData(entries: TimeSeriesEntry[]): {
  chartData: ChartDataPoint[]
  providers: string[]
} {
  const dateMap = new Map<string, Record<string, number>>()
  const providerSet = new Set<string>()

  for (const entry of entries) {
    providerSet.add(entry.provider)
    const existing = dateMap.get(entry.date) ?? {}
    existing[entry.provider] = entry.attempts
    dateMap.set(entry.date, existing)
  }

  const providers = Array.from(providerSet).sort()

  const chartData: ChartDataPoint[] = []
  for (const [date, providerData] of dateMap.entries()) {
    const point: ChartDataPoint = { date: formatDate(date) }
    for (const provider of providers) {
      point[provider] = providerData[provider] ?? 0
    }
    chartData.push(point)
  }

  return { chartData, providers }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function BpmTimeSeriesChart() {
  const [rawData, setRawData] = useState<TimeSeriesEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTimeSeries() {
      try {
        const response = await fetch("/api/admin/bpm-stats?section=timeseries")
        if (!response.ok) {
          throw new Error("Failed to fetch time series data")
        }
        const result = (await response.json()) as TimeSeriesEntry[]
        setRawData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    }

    fetchTimeSeries()
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
        Failed to load time series: {error}
      </div>
    )
  }

  if (rawData.length === 0) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        No time series data available
      </div>
    )
  }

  const { chartData, providers } = transformData(rawData)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="rounded-xl p-4"
      style={{ background: "var(--color-surface1)" }}
    >
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--color-text3)" }}>
        BPM fetch attempts (last 30 days)
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => {
              if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
              return value.toString()
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface2)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "var(--color-text)", fontWeight: 500 }}
            itemStyle={{ color: "var(--color-text2)", padding: "2px 0" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            iconType="square"
            iconSize={10}
          />
          {providers.map(provider => (
            <Bar
              key={provider}
              dataKey={provider}
              stackId="attempts"
              fill={PROVIDER_COLORS[provider] ?? "#6b7280"}
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
