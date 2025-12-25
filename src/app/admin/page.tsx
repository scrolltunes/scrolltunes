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
  Textbox,
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

type AdminSection = "analytics" | "users" | "content"

const sections: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "analytics", label: "Analytics", icon: <ChartBar size={20} /> },
  { id: "users", label: "User Management", icon: <UsersThree size={20} /> },
  { id: "content", label: "Content Updates", icon: <Textbox size={20} /> },
]

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/"
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
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
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
            <ShieldWarning size={32} className="text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="text-neutral-400 mb-6">You don't have permission to view this page</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
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
      className="p-5 rounded-xl bg-neutral-900"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-indigo-400">
          {icon}
        </div>
        <span className="text-sm text-neutral-400">{label}</span>
      </div>
      <p className="text-xl font-semibold text-white">{value}</p>
      {subtext && <p className="text-sm text-neutral-500 mt-1">{subtext}</p>}
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
          <div key={i} className="p-5 rounded-xl bg-neutral-900 animate-pulse">
            <div className="h-10 w-32 bg-neutral-800 rounded mb-3" />
            <div className="h-6 w-48 bg-neutral-800 rounded" />
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
        className="p-5 rounded-xl bg-neutral-900"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-indigo-400">
            <Heart size={20} />
          </div>
          <span className="text-sm text-neutral-400">Top 5 favorite songs</span>
        </div>
        {stats?.topFavorites && stats.topFavorites.length > 0 ? (
          <ol className="space-y-3">
            {stats.topFavorites.map((song, index) => (
              <li key={`${song.title}-${song.artist}`} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-medium text-neutral-400">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{song.title}</p>
                  <p className="text-sm text-neutral-500 truncate">{song.artist}</p>
                </div>
                <span className="text-sm text-neutral-400">
                  {song.favoriteCount} {song.favoriteCount === 1 ? "fav" : "favs"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-neutral-500">No favorites yet</p>
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
      <div className="w-16 h-16 mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
        <ListChecks size={32} className="text-neutral-600" />
      </div>
      <h3 className="text-lg font-medium text-neutral-300 mb-2">{title}</h3>
      <p className="text-neutral-500">This section is under development</p>
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
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeSection === section.id
                ? "bg-indigo-600 text-white"
                : "bg-neutral-900 text-neutral-400 hover:text-white"
            }`}
          >
            {section.icon}
            <span>{section.label}</span>
          </button>
        ))}
        <Link
          href="/admin/songs"
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors bg-neutral-900 text-neutral-400 hover:text-white"
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                activeSection === section.id
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
              }`}
            >
              {section.icon}
              <span>{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 pt-6 border-t border-neutral-800">
        <p className="px-4 mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
          Tools
        </p>
        <Link
          href="/admin/songs"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-neutral-400 hover:bg-neutral-900 hover:text-white"
        >
          <MusicNote size={20} />
          <span className="flex-1">Songs Catalog</span>
          <ArrowSquareOut size={16} className="text-neutral-600" />
        </Link>
      </div>
    </nav>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-40 bg-neutral-800 rounded animate-pulse mb-2" />
            <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse" />
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
      case "content":
        return <ComingSoonSection title="Content Updates" />
    }
  }

  const activeLabel = sections.find(s => s.id === activeSection)?.label ?? "Admin"

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-1">Admin Panel</h1>
            <p className="text-neutral-400">Manage ScrollTunes</p>
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
