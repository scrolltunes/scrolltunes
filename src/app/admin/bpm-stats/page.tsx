"use client"

import { springs } from "@/animations"
import { BpmErrorBreakdown } from "@/components/admin/BpmErrorBreakdown"
import { BpmFailuresList } from "@/components/admin/BpmFailuresList"
import { BpmMissingSongs } from "@/components/admin/BpmMissingSongs"
import { BpmProviderTable } from "@/components/admin/BpmProviderTable"
import { BpmSongDetail } from "@/components/admin/BpmSongDetail"
import { BpmStatsCards } from "@/components/admin/BpmStatsCards"
import { BpmTimeSeriesChart } from "@/components/admin/BpmTimeSeriesChart"
import { useAccount, useIsAdmin } from "@/core"
import { ArrowLeft, ShieldWarning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useCallback, useState } from "react"

function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-4xl mx-auto h-full px-4 flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 transition-colors hover:brightness-125"
          style={{ color: "var(--color-text3)" }}
        >
          <ArrowLeft size={20} />
          <span>Admin</span>
        </Link>
        <span style={{ color: "var(--color-border)" }}>|</span>
        <span className="font-medium" style={{ color: "var(--color-text)" }}>
          BPM Analytics
        </span>
      </div>
    </header>
  )
}

function AccessDenied() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="text-center max-w-sm"
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-sm flex items-center justify-center"
            style={{ background: "var(--color-surface1)" }}
          >
            <ShieldWarning size={32} style={{ color: "var(--color-text-muted)" }} />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="mb-6" style={{ color: "var(--color-text3)" }}>
            You don't have permission to view this page
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            Go home
          </Link>
        </motion.div>
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div
              className="h-8 w-48 rounded animate-pulse mb-2"
              style={{ background: "var(--color-surface2)" }}
            />
            <div
              className="h-5 w-64 rounded animate-pulse"
              style={{ background: "var(--color-surface2)" }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

interface SongDetailState {
  isOpen: boolean
  lrclibId: number | null
  title: string
  artist: string
}

export default function BpmStatsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()
  const [songDetail, setSongDetail] = useState<SongDetailState>({
    isOpen: false,
    lrclibId: null,
    title: "",
    artist: "",
  })

  const handleSongClick = useCallback(
    (lrclibId: number | null, _songId: string | null, title: string, artist: string) => {
      if (lrclibId !== null) {
        setSongDetail({
          isOpen: true,
          lrclibId,
          title,
          artist,
        })
      }
    },
    [],
  )

  const handleFailureSongClick = useCallback((lrclibId: number, title: string, artist: string) => {
    setSongDetail({
      isOpen: true,
      lrclibId,
      title,
      artist,
    })
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSongDetail(prev => ({ ...prev, isOpen: false }))
  }, [])

  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Page Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold mb-1">BPM Analytics</h1>
            <p style={{ color: "var(--color-text3)" }}>
              Track BPM fetch attempts, provider performance, and coverage gaps
            </p>
          </motion.div>

          {/* Summary Cards */}
          <section className="mb-8">
            <BpmStatsCards />
          </section>

          {/* Provider Breakdown */}
          <section className="mb-8">
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springs.default, delay: 0.1 }}
              className="text-lg font-medium mb-4"
              style={{ color: "var(--color-text)" }}
            >
              Provider breakdown
            </motion.h2>
            <BpmProviderTable />
          </section>

          {/* Time Series Chart */}
          <section className="mb-8">
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springs.default, delay: 0.15 }}
              className="text-lg font-medium mb-4"
              style={{ color: "var(--color-text)" }}
            >
              Activity over time
            </motion.h2>
            <BpmTimeSeriesChart />
          </section>

          {/* Two-column layout for failures and missing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Recent Failures */}
            <section>
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...springs.default, delay: 0.2 }}
                className="text-lg font-medium mb-4"
                style={{ color: "var(--color-text)" }}
              >
                Recent failures
              </motion.h2>
              <BpmFailuresList onSongClick={handleFailureSongClick} />
            </section>

            {/* Songs Missing BPM */}
            <section>
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...springs.default, delay: 0.25 }}
                className="text-lg font-medium mb-4"
                style={{ color: "var(--color-text)" }}
              >
                Songs missing BPM
              </motion.h2>
              <BpmMissingSongs onSongClick={handleSongClick} />
            </section>
          </div>

          {/* Error Breakdown */}
          <section className="mb-8">
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springs.default, delay: 0.3 }}
              className="text-lg font-medium mb-4"
              style={{ color: "var(--color-text)" }}
            >
              Error breakdown by provider
            </motion.h2>
            <BpmErrorBreakdown />
          </section>
        </div>
      </main>

      {/* Song Detail Modal */}
      <BpmSongDetail
        isOpen={songDetail.isOpen}
        onClose={handleCloseDetail}
        lrclibId={songDetail.lrclibId}
        title={songDetail.title}
        artist={songDetail.artist}
      />
    </div>
  )
}
