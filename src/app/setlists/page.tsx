"use client"

import { springs } from "@/animations"
import { CreateSetlistModal, SetlistCard } from "@/components/setlists"
import { Logo } from "@/components/ui"
import {
  type Setlist,
  setlistsStore,
  useIsAuthenticated,
  useSetlists,
  useSetlistsLoading,
} from "@/core"
import { makeSetlistPath } from "@/lib/slug"
import { ArrowLeft, Plus, Queue, SignIn } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

export default function SetlistsPage() {
  const isAuthenticated = useIsAuthenticated()
  const setlists = useSetlists()
  const isLoading = useSetlistsLoading()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated) {
      setlistsStore.fetchAll()
    }
  }, [isAuthenticated])

  const handleSetlistClick = useCallback(
    (setlist: Setlist) => {
      router.push(makeSetlistPath({ id: setlist.id, name: setlist.name }))
    },
    [router],
  )

  if (!isAuthenticated) {
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
              <Queue size={32} className="text-neutral-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Sign in to create setlists</h2>
            <p className="text-neutral-400 mb-6">
              Organize your songs into custom setlists for practice or performances
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <SignIn size={20} />
              Sign in
            </Link>
          </motion.div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Setlists</h1>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <Plus size={20} weight="bold" />
              Create setlist
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 rounded-xl bg-neutral-900 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-800" />
                    <div className="flex-1">
                      <div className="h-4 w-32 bg-neutral-800 rounded mb-2" />
                      <div className="h-3 w-20 bg-neutral-800 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : setlists.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.default}
              className="text-center py-12"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
                <Queue size={32} className="text-neutral-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Create your first setlist</h2>
              <p className="text-neutral-400 mb-6">
                Organize your favorite songs for practice or performances
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
              >
                <Plus size={20} weight="bold" />
                Create setlist
              </button>
            </motion.div>
          ) : (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
              aria-label="Your setlists"
            >
              {setlists.map(setlist => (
                <li key={setlist.id}>
                  <SetlistCard
                    id={setlist.id}
                    name={setlist.name}
                    songCount={setlist.songCount}
                    {...(setlist.color ? { color: setlist.color } : {})}
                    {...(setlist.icon ? { icon: setlist.icon } : {})}
                    onClick={() => handleSetlistClick(setlist)}
                  />
                </li>
              ))}
            </motion.ul>
          )}
        </div>
      </main>

      <CreateSetlistModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="text-lg font-semibold flex items-center gap-2">
          <Logo size={24} className="text-indigo-500" />
          ScrollTunes
        </span>
      </div>
    </header>
  )
}
