"use client"

import { useAccount } from "@/core"
import { SignOut, UserCircle } from "@phosphor-icons/react"
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
  const [isMounted, setIsMounted] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

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

  // Show sign-in button before mount or when not authenticated
  const showSignIn = !isMounted || isLoading || !isAuthenticated || !user
  const initials = user ? getInitials(user.name, user.email) : ""

  return (
    <div ref={menuRef} className="relative w-10 h-10 flex-shrink-0">
      <AnimatePresence mode="wait" initial={false}>
        {showSignIn ? (
          <motion.div
            key="sign-in"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            <Link
              href="/login"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface2)" }}
              aria-label="Sign in"
            >
              <UserCircle size={20} />
            </Link>
          </motion.div>
        ) : (
          <motion.button
            key="user-menu"
            type="button"
            onClick={handleToggle}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden transition-colors focus:outline-none focus:ring-2 hover:brightness-110"
            style={{ background: "var(--color-surface2)" }}
            aria-label="User menu"
            aria-expanded={isOpen}
            aria-haspopup="true"
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt=""
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-medium text-sm"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                {initials}
              </div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && user && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 rounded-xl shadow-lg overflow-hidden z-50"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
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
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-medium"
                    style={{ background: "var(--color-accent)", color: "white" }}
                  >
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {user.name && (
                    <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {user.name}
                    </p>
                  )}
                  <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
                    {user.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:brightness-110"
                style={{ color: "var(--color-text2)" }}
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
