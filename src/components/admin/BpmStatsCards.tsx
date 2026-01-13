"use client"

import { springs } from "@/animations"
import { ChartLine, Clock, MusicNote, Target } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

interface SummaryData {
  totalAttempts24h: number
  successRate: number
  songsWithoutBpm: number
  avgLatencyMs: number
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subtext?: string | undefined
  delay: number
}

function StatCard({ icon, label, value, subtext, delay }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.default, delay }}
      className="p-5 rounded-xl"
      style={{ background: "var(--color-surface1)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "var(--color-surface2)", color: "var(--color-accent)" }}
        >
          {icon}
        </div>
        <span className="text-sm" style={{ color: "var(--color-text3)" }}>
          {label}
        </span>
      </div>
      <p className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
      {subtext && (
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          {subtext}
        </p>
      )}
    </motion.div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="p-5 rounded-xl animate-pulse"
          style={{ background: "var(--color-surface1)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full"
              style={{ background: "var(--color-surface2)" }}
            />
            <div className="h-4 w-20 rounded" style={{ background: "var(--color-surface2)" }} />
          </div>
          <div className="h-6 w-24 rounded" style={{ background: "var(--color-surface2)" }} />
        </div>
      ))}
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

export function BpmStatsCards() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSummary() {
      try {
        const response = await fetch("/api/admin/bpm-stats?section=summary&period=24h")
        if (!response.ok) {
          throw new Error("Failed to fetch BPM stats")
        }
        const result = (await response.json()) as SummaryData
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSummary()
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
        Failed to load stats: {error}
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard
        icon={<ChartLine size={20} />}
        label="Total attempts (24h)"
        value={formatNumber(data.totalAttempts24h)}
        delay={0}
      />
      <StatCard
        icon={<Target size={20} />}
        label="Success rate"
        value={`${data.successRate}%`}
        delay={0.05}
      />
      <StatCard
        icon={<MusicNote size={20} />}
        label="Songs without BPM"
        value={formatNumber(data.songsWithoutBpm)}
        delay={0.1}
      />
      <StatCard
        icon={<Clock size={20} />}
        label="Avg latency"
        value={`${data.avgLatencyMs}ms`}
        delay={0.15}
      />
    </div>
  )
}
