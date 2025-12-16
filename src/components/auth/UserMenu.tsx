"use client"

import { useAccount } from "@/core"
import { MusicNotes, SignOut, UserCircle } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { signOut } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { memo, useCallback, useEffect, useRef, useState } from "react"

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.charAt(0).toUpperCase()
  }
  return email.charAt(0).toUpperCase()
}

export const UserMenu = memo(function UserMenu() {
  const { isAuthenticated, isLoading, user } = useAccount()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleSignOut = useCallback(() => {
    setIsOpen(false)
    signOut()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  if (isLoading) {
    return <div className="w-10 h-10 rounded-full bg-neutral-800 animate-pulse" />
  }

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/login"
        className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
        aria-label="Sign in"
      >
        <UserCircle size={20} />
      </Link>
    )
  }

  const initials = getInitials(user.name, user.email)

  return (
    <div ref={menuRef} className="relative w-10 h-10 flex-shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
        aria-label="User menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white font-medium text-sm">
            {initials}
          </div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 bg-neutral-900 rounded-xl shadow-lg border border-neutral-800 overflow-hidden z-50"
          >
            <div className="p-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt=""
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-medium">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {user.name && <p className="text-white font-medium truncate">{user.name}</p>}
                  <p className="text-sm text-neutral-400 truncate">{user.email}</p>
                </div>
              </div>
            </div>

            <div className="py-2">
              <Link
                href="#"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <MusicNotes size={20} />
                <span>Your setlists</span>
              </Link>
            </div>

            <div className="border-t border-neutral-800 py-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <SignOut size={20} />
                <span>Sign out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
