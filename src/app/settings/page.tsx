"use client"

import { preferencesStore, type ThemeMode, usePreferences } from "@/core"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  DeviceMobile,
  Eye,
  Hand,
  Moon,
  Timer,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useCallback } from "react"

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
          {/* Appearance Section */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Appearance
            </h2>
            <div className="p-4 bg-neutral-900 rounded-xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 text-indigo-400">
                  <Moon size={20} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Theme</div>
                  <div className="text-sm text-neutral-400 mt-0.5">Choose light, dark, or system</div>
                </div>
              </div>
              <div className="mt-4 pl-14 flex gap-2">
                {(["system", "light", "dark"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleThemeModeChange(mode)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                      preferences.themeMode === mode
                        ? "bg-indigo-500 text-white"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
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
