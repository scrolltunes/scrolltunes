"use client"

import { springs } from "@/animations"
import { useAccount, useIsAdmin } from "@/core"
import {
  ArrowLeft,
  ArrowSquareOut,
  ChartBar,
  Heart,
  ListChecks,
  MusicNote,
  ShieldWarning,
  Users,
  UsersThree,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"

interface FavoriteSong {
  title: string
  artist: string
  favoriteCount: number
}

interface AdminStats {
  topFavorites: FavoriteSong[]
  totalUsers: number
  lastJoinedUser: {
    email: string
    joinedAt: string
  } | null
}

type AdminSection = "analytics" | "users"

const sections: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "analytics", label: "Analytics", icon: <ChartBar size={20} /> },
  { id: "users", label: "User Management", icon: <UsersThree size={20} /> },
]

function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-4xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/"
          className="flex items-center gap-2 transition-colors hover:brightness-125"
          style={{ color: "var(--color-text3)" }}
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </Link>
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
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
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

function StatCard({
  icon,
  label,
  value,
  subtext,
  delay,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtext?: string | undefined
  delay: number
}) {
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

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function AnalyticsSection({ stats, isLoading }: { stats: AdminStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="p-5 rounded-xl animate-pulse"
            style={{ background: "var(--color-surface1)" }}
          >
            <div
              className="h-10 w-32 rounded mb-3"
              style={{ background: "var(--color-surface2)" }}
            />
            <div className="h-6 w-48 rounded" style={{ background: "var(--color-surface2)" }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.default, delay: 0.1 }}
        className="p-5 rounded-xl"
        style={{ background: "var(--color-surface1)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-surface2)" }}
          >
            <Heart size={20} style={{ color: "var(--color-favorite)" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--color-text3)" }}>
            Top 5 favorite songs
          </span>
        </div>
        {stats?.topFavorites && stats.topFavorites.length > 0 ? (
          <ol className="space-y-3">
            {stats.topFavorites.map((song, index) => (
              <li key={`${song.title}-${song.artist}`} className="flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ background: "var(--color-surface2)", color: "var(--color-text3)" }}
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ color: "var(--color-text)" }}>
                    {song.title}
                  </p>
                  <p className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>
                    {song.artist}
                  </p>
                </div>
                <span className="text-sm" style={{ color: "var(--color-text3)" }}>
                  {song.favoriteCount} {song.favoriteCount === 1 ? "fav" : "favs"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: "var(--color-text-muted)" }}>No favorites yet</p>
        )}
      </motion.div>

      <StatCard
        icon={<Users size={20} />}
        label="Total users"
        value={stats?.totalUsers.toString() ?? "0"}
        subtext={
          stats?.lastJoinedUser
            ? `Last joined: ${stats.lastJoinedUser.email} (${formatRelativeTime(stats.lastJoinedUser.joinedAt)})`
            : undefined
        }
        delay={0.2}
      />

      <StatCard icon={<ListChecks size={20} />} label="TODO" value="Coming soon" delay={0.3} />
    </div>
  )
}

function ComingSoonSection({ title }: { title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div
        className="w-16 h-16 mb-4 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--color-surface1)" }}
      >
        <ListChecks size={32} style={{ color: "var(--color-text-muted)" }} />
      </div>
      <h3 className="text-lg font-medium mb-2" style={{ color: "var(--color-text2)" }}>
        {title}
      </h3>
      <p style={{ color: "var(--color-text-muted)" }}>This section is under development</p>
    </motion.div>
  )
}

function MobileTabs({
  activeSection,
  onSectionChange,
}: {
  activeSection: AdminSection
  onSectionChange: (section: AdminSection) => void
}) {
  return (
    <nav className="md:hidden mb-6 -mx-4 px-4 overflow-x-auto">
      <div className="flex gap-2 min-w-max pb-2">
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionChange(section.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
            style={
              activeSection === section.id
                ? { background: "var(--color-accent)", color: "white" }
                : { background: "var(--color-surface1)", color: "var(--color-text3)" }
            }
          >
            {section.icon}
            <span>{section.label}</span>
          </button>
        ))}
        <Link
          href="/admin/songs"
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors hover:brightness-125"
          style={{ background: "var(--color-surface1)", color: "var(--color-text3)" }}
        >
          <MusicNote size={20} />
          <span>Songs</span>
        </Link>
      </div>
    </nav>
  )
}

function Sidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: AdminSection
  onSectionChange: (section: AdminSection) => void
}) {
  return (
    <nav className="hidden md:block w-64 flex-shrink-0">
      <ul className="space-y-1">
        {sections.map(section => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => onSectionChange(section.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
              style={
                activeSection === section.id
                  ? { background: "var(--color-accent)", color: "white" }
                  : { color: "var(--color-text3)" }
              }
            >
              {section.icon}
              <span>{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--color-border)" }}>
        <p
          className="px-4 mb-2 text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Tools
        </p>
        <Link
          href="/admin/songs"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors hover:brightness-125"
          style={{ color: "var(--color-text3)" }}
        >
          <MusicNote size={20} />
          <span className="flex-1">Songs Catalog</span>
          <ArrowSquareOut size={16} style={{ color: "var(--color-text-muted)" }} />
        </Link>
      </div>
    </nav>
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
              className="h-8 w-40 rounded animate-pulse mb-2"
              style={{ background: "var(--color-surface2)" }}
            />
            <div
              className="h-5 w-32 rounded animate-pulse"
              style={{ background: "var(--color-surface2)" }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function AdminPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<AdminSection>("analytics")

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return

    async function fetchStats() {
      try {
        const response = await fetch("/api/admin/stats")
        if (response.ok) {
          const data = (await response.json()) as AdminStats
          setStats(data)
        }
      } catch {
        // Failed to fetch stats
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [isAuthenticated, isAdmin])

  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  const renderContent = () => {
    switch (activeSection) {
      case "analytics":
        return <AnalyticsSection stats={stats} isLoading={isLoading} />
      case "users":
        return <ComingSoonSection title="User Management" />
    }
  }

  const activeLabel = sections.find(s => s.id === activeSection)?.label ?? "Admin"

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-1">Admin Panel</h1>
            <p style={{ color: "var(--color-text3)" }}>Manage ScrollTunes</p>
          </div>

          <MobileTabs activeSection={activeSection} onSectionChange={setActiveSection} />

          <div className="flex gap-8">
            <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

            <div className="flex-1 min-w-0">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={springs.default}
              >
                <h2 className="text-lg font-medium mb-6">{activeLabel}</h2>
                {renderContent()}
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
