"use client"

import { Logo } from "@/components/ui"
import { useAccount, useIsAdmin } from "@/core"
import { CaretDown, GearSix, Heart, Info, MusicNotes, ShieldCheck } from "@phosphor-icons/react"
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
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 hover:brightness-95"
        style={{ background: "var(--color-surface3)" }}
        aria-label="ScrollTunes menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Logo size={24} />
        {isAdmin && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide bg-amber-500 text-black">
            Admin
          </span>
        )}
        <CaretDown size={12} style={{ color: "var(--color-text-muted)" }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-56 rounded-xl shadow-lg overflow-hidden z-50"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="py-2">
              <Link
                href="/settings"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-surface2)]"
                style={{ color: "var(--color-text2)" }}
              >
                <GearSix size={20} />
                <span>Settings</span>
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={handleClose}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-surface2)]"
                  style={{ color: "var(--color-warning)" }}
                >
                  <ShieldCheck size={20} />
                  <span>Admin</span>
                </Link>
              )}
            </div>

            <div className="py-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <Link
                href="/favorites"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-surface2)]"
                style={{ color: "var(--color-text2)" }}
              >
                <Heart size={20} />
                <span>Favorites</span>
              </Link>
              {isAuthenticated && (
                <Link
                  href="/setlists"
                  onClick={handleClose}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-surface2)]"
                  style={{ color: "var(--color-text2)" }}
                >
                  <MusicNotes size={20} />
                  <span>Setlists</span>
                </Link>
              )}
            </div>

            <div className="py-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <Link
                href="/about"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-surface2)]"
                style={{ color: "var(--color-text2)" }}
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
