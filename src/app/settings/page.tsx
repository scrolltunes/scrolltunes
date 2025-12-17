"use client"

import { type ThemeMode, preferencesStore, useAccount, usePreferences } from "@/core"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  DeviceMobile,
  DownloadSimple,
  Eye,
  Flask,
  Hand,
  Moon,
  MusicNotes,
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
      className="w-full flex items-start gap-4 p-4 bg-neutral-900 rounded-xl text-left hover:bg-neutral-800 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 text-indigo-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-neutral-400 mt-0.5">{description}</div>
      </div>
      <motion.div
        className={`w-12 h-7 rounded-full p-1 shrink-0 ${enabled ? "bg-indigo-500" : "bg-neutral-700"}`}
        animate={{ backgroundColor: enabled ? "#6366f1" : "#404040" }}
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
    <div className="p-4 bg-neutral-900 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 text-indigo-400">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{label}</div>
          <div className="text-sm text-neutral-400 mt-0.5">{description}</div>
        </div>
        <div className="text-sm text-indigo-400 font-medium shrink-0">{formatValue(value)}</div>
      </div>
      <div className="mt-4 pl-14">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
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
      const response = await fetch("/api/user/delete", { method: "POST" })
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
        className="w-full max-w-md bg-neutral-900 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4 text-red-400">
          <Warning size={24} weight="duotone" />
          <h2 className="text-lg font-semibold">Delete Account</h2>
        </div>

        <p className="text-neutral-300 mb-4">
          This action is permanent and cannot be undone. All your data will be deleted.
        </p>

        <p className="text-sm text-neutral-400 mb-2">
          Type <span className="font-mono text-red-400">DELETE</span> to confirm:
        </p>

        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 mb-4"
          autoComplete="off"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || isDeleting}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded-xl text-white transition-colors"
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
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
          Account
        </h2>
        <div className="p-4 bg-neutral-900 rounded-xl">
          <div className="animate-pulse flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-neutral-800 rounded" />
              <div className="h-3 w-32 bg-neutral-800 rounded" />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!account.isAuthenticated) {
    return (
      <section>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
          Account
        </h2>
        <div className="p-4 bg-neutral-900 rounded-xl">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3 text-indigo-400">
              <User size={24} weight="duotone" />
            </div>
            <div className="font-medium mb-1">Sign in to sync</div>
            <div className="text-sm text-neutral-400 mb-4">
              Sync your history and favorites across devices
            </div>
            <Link
              href="/login"
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white font-medium transition-colors"
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
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
          Account
        </h2>
        <div className="bg-neutral-900 rounded-xl overflow-hidden">
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
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-indigo-400">
                  <User size={24} weight="duotone" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{account.user?.name ?? "User"}</div>
                <div className="text-sm text-neutral-400 truncate">{account.user?.email}</div>
                <div className="text-xs text-neutral-500 mt-0.5">Signed in with {providerName}</div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleExportData}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm font-medium transition-colors"
              >
                <DownloadSimple size={18} />
                Export my data
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm font-medium transition-colors"
              >
                <SignOut size={18} />
                Sign out
              </button>
            </div>
          </div>

          <div className="border-t border-neutral-800 p-4">
            <div className="text-sm font-medium text-red-400 mb-3">Danger Zone</div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-950/50 hover:bg-red-900/50 border border-red-900/50 rounded-xl text-red-400 text-sm font-medium transition-colors"
            >
              <Trash size={18} />
              Delete my account
            </button>
            <div className="text-xs text-neutral-500 mt-2">
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

  const handleToggleEnableChords = useCallback(() => {
    preferencesStore.setEnableChords(!preferences.enableChords)
  }, [preferences.enableChords])

  const handleToggleDistractionFree = useCallback(() => {
    preferencesStore.setDistractionFreeMode(!preferences.distractionFreeMode)
  }, [preferences.distractionFreeMode])

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
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-lg mx-auto">
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
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
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
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Display
            </h2>
            <div className="space-y-3">
              <Toggle
                enabled={preferences.distractionFreeMode}
                onToggle={handleToggleDistractionFree}
                label="Distraction-Free Mode"
                description="Hide all controls during playback"
                icon={<Eye size={20} weight="duotone" />}
              />
              <SliderSetting
                value={preferences.autoHideControlsMs}
                onChange={handleAutoHideChange}
                label="Auto-hide controls"
                description="Hide header after inactivity"
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
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
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

          {/* Experimental Section */}
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Flask size={16} className="text-amber-500" />
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Experimental
              </h2>
            </div>
            <div className="space-y-3">
              <Toggle
                enabled={preferences.enableChords}
                onToggle={handleToggleEnableChords}
                label="Enable chords"
                description="Show guitar chords above lyrics"
                icon={<MusicNotes size={20} weight="duotone" />}
              />
            </div>
          </section>

          {/* Reset Button */}
          <section className="pt-4">
            <button
              type="button"
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 p-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-400 hover:text-white transition-colors"
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
