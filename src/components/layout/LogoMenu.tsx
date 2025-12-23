"use client"

import { Logo } from "@/components/ui"
import { useAccount, useIsAdmin } from "@/core"
import {
  CaretDown,
  GearSix,
  Heart,
  Info,
  MusicNotes,
  ShieldCheck,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { memo, useCallback, useEffect, useRef, useState } from "react"

export const LogoMenu = memo(function LogoMenu() {
  const { isAuthenticated } = useAccount()
  const isAdmin = useIsAdmin()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
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

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
        aria-label="ScrollTunes menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Logo size={24} className="text-indigo-500" />
        <span className="text-lg font-semibold text-white">ScrollTunes</span>
        {isAdmin && (
          <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-black rounded-full uppercase tracking-wide">
            Admin
          </span>
        )}
        <CaretDown size={12} className="text-neutral-500" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-56 bg-neutral-900 rounded-xl shadow-lg border border-neutral-800 overflow-hidden z-50"
          >
            <div className="py-2">
              <Link
                href="/settings"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <GearSix size={20} />
                <span>Settings</span>
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={handleClose}
                  className="flex items-center gap-3 px-4 py-2 text-amber-400 hover:bg-neutral-800 transition-colors"
                >
                  <ShieldCheck size={20} />
                  <span>Admin</span>
                </Link>
              )}
            </div>

            <div className="border-t border-neutral-800 py-2">
              <Link
                href="/favorites"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Heart size={20} />
                <span>Favorites</span>
              </Link>
              {isAuthenticated && (
                <Link
                  href="/setlists"
                  onClick={handleClose}
                  className="flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <MusicNotes size={20} />
                  <span>Setlists</span>
                </Link>
              )}
            </div>

            <div className="border-t border-neutral-800 py-2">
              <Link
                href="/about"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Info size={20} />
                <span>About ScrollTunes</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
