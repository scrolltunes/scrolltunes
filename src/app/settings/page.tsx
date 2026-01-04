"use client"

import { AmbientBackground } from "@/components/ui"
import { type ThemeMode, preferencesStore, useAccount, usePreferences } from "@/core"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  DeviceMobile,
  DownloadSimple,
  Hand,
  Moon,
  SignOut,
  Timer,
  Trash,
  User,
  Warning,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { signOut } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useState } from "react"

interface ToggleProps {
  enabled: boolean
  onToggle: () => void
  label: string
  description: string
  icon: React.ReactNode
}

function Toggle({ enabled, onToggle, label, description, icon }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-4 p-4 rounded-xl text-left transition-colors hover:brightness-110"
      style={{ background: "var(--color-surface1)" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--color-surface2)", color: "var(--color-accent)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium" style={{ color: "var(--color-text)" }}>
          {label}
        </div>
        <div className="text-sm mt-0.5" style={{ color: "var(--color-text3)" }}>
          {description}
        </div>
      </div>
      <motion.div
        className="w-12 h-7 rounded-full p-1 shrink-0"
        style={{ background: enabled ? "var(--color-accent)" : "var(--color-surface3)" }}
        animate={{ backgroundColor: enabled ? "var(--color-accent)" : "var(--color-surface3)" }}
      >
        <motion.div
          className="w-5 h-5 rounded-full bg-white shadow-sm"
          animate={{ x: enabled ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </motion.div>
    </button>
  )
}

interface SliderSettingProps {
  value: number
  onChange: (value: number) => void
  label: string
  description: string
  icon: React.ReactNode
  min: number
  max: number
  step: number
  formatValue: (value: number) => string
}

function SliderSetting({
  value,
  onChange,
  label,
  description,
  icon,
  min,
  max,
  step,
  formatValue,
}: SliderSettingProps) {
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface1)" }}>
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--color-surface2)", color: "var(--color-accent)" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium" style={{ color: "var(--color-text)" }}>
            {label}
          </div>
          <div className="text-sm mt-0.5" style={{ color: "var(--color-text3)" }}>
            {description}
          </div>
        </div>
        <div className="text-sm font-medium shrink-0" style={{ color: "var(--color-accent)" }}>
          {formatValue(value)}
        </div>
      </div>
      <div className="mt-4 pl-14">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{ background: "var(--color-surface3)", accentColor: "var(--color-accent)" }}
        />
      </div>
    </div>
  )
}

interface DeleteAccountModalProps {
  isOpen: boolean
  onClose: () => void
}

function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = useCallback(async () => {
    if (confirmText !== "DELETE") return

    setIsDeleting(true)
    try {
      const response = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      })
      if (response.ok) {
        await signOut({ callbackUrl: "/" })
      }
    } catch {
      setIsDeleting(false)
    }
  }, [confirmText])

  const handleClose = useCallback(() => {
    setConfirmText("")
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--color-surface1)" }}
      >
        <div className="flex items-center gap-3 mb-4" style={{ color: "var(--color-danger)" }}>
          <Warning size={24} weight="duotone" />
          <h2 className="text-lg font-semibold">Delete Account</h2>
        </div>

        <p className="mb-4" style={{ color: "var(--color-text2)" }}>
          This action is permanent and cannot be undone. All your data will be deleted.
        </p>

        <p className="text-sm mb-2" style={{ color: "var(--color-text3)" }}>
          Type <span className="font-mono" style={{ color: "var(--color-danger)" }}>DELETE</span> to
          confirm:
        </p>

        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-full px-4 py-3 rounded-xl mb-4 focus:outline-none"
          style={{
            background: "var(--color-surface2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
          autoComplete="off"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-3 rounded-xl transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || isDeleting}
            className="flex-1 px-4 py-3 rounded-xl transition-colors hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--color-danger)", color: "white" }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function AccountSection() {
  const account = useAccount()
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleExportData = useCallback(async () => {
    const link = document.createElement("a")
    link.href = "/api/user/export"
    link.download = "scrolltunes-data.json"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleSignOut = useCallback(async () => {
    await signOut({ callbackUrl: "/" })
  }, [])

  if (account.isLoading) {
    return (
      <section>
        <h2
          className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Account
        </h2>
        <div className="p-4 rounded-xl" style={{ background: "var(--color-surface1)" }}>
          <div className="animate-pulse flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-full"
              style={{ background: "var(--color-surface2)" }}
            />
            <div className="flex-1 space-y-2">
              <div
                className="h-4 w-24 rounded"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-3 w-32 rounded"
                style={{ background: "var(--color-surface2)" }}
              />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!account.isAuthenticated) {
    return (
      <section>
        <h2
          className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Account
        </h2>
        <div className="p-4 rounded-xl" style={{ background: "var(--color-surface1)" }}>
          <div className="flex flex-col items-center text-center py-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: "var(--color-surface2)", color: "var(--color-accent)" }}
            >
              <User size={24} weight="duotone" />
            </div>
            <div className="font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Sign in to sync
            </div>
            <div className="text-sm mb-4" style={{ color: "var(--color-text3)" }}>
              Sync your history and favorites across devices
            </div>
            <Link
              href="/login"
              className="flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-colors hover:brightness-110"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              Sign in
              <ArrowLeft size={16} className="rotate-180" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const providerName = "Google"

  return (
    <>
      <section>
        <h2
          className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Account
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface1)" }}>
          <div className="p-4">
            <div className="flex items-center gap-4">
              {account.user?.image ? (
                <Image
                  src={account.user.image}
                  alt=""
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "var(--color-surface2)", color: "var(--color-accent)" }}
                >
                  <User size={24} weight="duotone" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {account.user?.name ?? "User"}
                </div>
                <div className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
                  {account.user?.email}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Signed in with {providerName}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleExportData}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
              >
                <DownloadSimple size={18} />
                Export my data
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
              >
                <SignOut size={18} />
                Sign out
              </button>
            </div>
          </div>

          <div className="p-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            <div className="text-sm font-medium mb-3" style={{ color: "var(--color-danger)" }}>
              Danger Zone
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:brightness-110"
              style={{
                background: "var(--color-danger-soft)",
                border: "1px solid var(--color-danger)",
                color: "var(--color-danger)",
              }}
            >
              <Trash size={18} />
              Delete my account
            </button>
            <div className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
              Permanently delete your account and all data
            </div>
          </div>
        </div>
      </section>

      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </>
  )
}

export default function SettingsPage() {
  const preferences = usePreferences()

  const handleToggleWakeLock = useCallback(() => {
    preferencesStore.setWakeLockEnabled(!preferences.wakeLockEnabled)
  }, [preferences.wakeLockEnabled])

  const handleToggleDoubleTap = useCallback(() => {
    preferencesStore.setDoubleTapEnabled(!preferences.doubleTapEnabled)
  }, [preferences.doubleTapEnabled])

  const handleToggleShakeToRestart = useCallback(() => {
    preferencesStore.setShakeToRestartEnabled(!preferences.shakeToRestartEnabled)
  }, [preferences.shakeToRestartEnabled])

  const handleAutoHideChange = useCallback((value: number) => {
    preferencesStore.setAutoHideControlsMs(value)
  }, [])

  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    preferencesStore.setThemeMode(mode)
  }, [])

  const handleReset = useCallback(() => {
    preferencesStore.reset()
  }, [])

  const formatAutoHide = (ms: number): string => {
    if (ms === 0) return "Never"
    return `${ms / 1000}s`
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <AmbientBackground variant="subtle" />
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "rgba(7, 10, 18, 0.8)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)" }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-lg mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Account Section */}
          <AccountSection />

          {/* Appearance Section */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Appearance
            </h2>
            <Toggle
              enabled={preferences.themeMode === "dark"}
              onToggle={() =>
                handleThemeModeChange(preferences.themeMode === "dark" ? "light" : "dark")
              }
              label="Dark Mode"
              description="Use dark color scheme"
              icon={<Moon size={20} weight="duotone" />}
            />
          </section>

          {/* Display Section */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Display
            </h2>
            <div className="space-y-3">
              <SliderSetting
                value={preferences.autoHideControlsMs}
                onChange={handleAutoHideChange}
                label="Auto-hide during playback"
                description="Hide header after inactivity while playing"
                icon={<Timer size={20} weight="duotone" />}
                min={0}
                max={30000}
                step={1000}
                formatValue={formatAutoHide}
              />
            </div>
          </section>

          {/* Gestures Section */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Gestures
            </h2>
            <div className="space-y-3">
              <Toggle
                enabled={preferences.wakeLockEnabled}
                onToggle={handleToggleWakeLock}
                label="Wake Lock"
                description="Keep screen on during playback"
                icon={<DeviceMobile size={20} weight="duotone" />}
              />
              <Toggle
                enabled={preferences.doubleTapEnabled}
                onToggle={handleToggleDoubleTap}
                label="Double-tap to pause"
                description="Tap twice on lyrics to toggle playback"
                icon={<Hand size={20} weight="duotone" />}
              />
              <Toggle
                enabled={preferences.shakeToRestartEnabled}
                onToggle={handleToggleShakeToRestart}
                label="Shake to restart"
                description="Shake device to restart from beginning"
                icon={<DeviceMobile size={20} weight="duotone" />}
              />
            </div>
          </section>

          {/* Reset Button */}
          <section className="pt-4">
            <button
              type="button"
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl transition-colors hover:brightness-110"
              style={{
                background: "var(--color-surface1)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text3)",
              }}
            >
              <ArrowCounterClockwise size={20} />
              Reset to defaults
            </button>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
