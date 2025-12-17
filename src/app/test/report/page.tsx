"use client"

import { ReportIssueModal } from "@/components/feedback"
import { useState } from "react"

export default function TestReportPage() {
  const [showBpmReportModal, setShowBpmReportModal] = useState(false)
  const [showChordsReportModal, setShowChordsReportModal] = useState(false)

  const missingBpmContext = {
    title: "My Sacrifice (2020 Remaster)",
    artist: "Creed feat. Scott Stapp",
    duration: 245,
    bpm: null,
    key: null,
    spotifyId: "10SESRncRBOYeahZRBWf5z",
    bpmSource: null,
    lrclibId: 12345,
    chordsError: null,
  }

  const chordsErrorContext = {
    title: "Wonderwall",
    artist: "Oasis",
    duration: 258,
    bpm: 87,
    key: "F#m",
    spotifyId: "1qPbGZqppFwLwcBC1JQ6Vr",
    bpmSource: "Spotify",
    lrclibId: 67890,
    chordsError: "Failed to fetch chords: 500 Internal Server Error",
    chordsErrorUrl: "https://scrolltunes.com/api/chords/12345?artist=Oasis&title=Wonderwall",
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Test Report Dialog</h1>
      <p className="text-neutral-400 mb-8">
        Click the warning buttons to test different error scenarios.
      </p>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl">
        {/* Missing BPM Scenario */}
        <div className="bg-neutral-900 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-amber-500">Missing BPM</h2>
          <div>
            <div className="text-lg font-medium">{missingBpmContext.title}</div>
            <div className="text-neutral-500">{missingBpmContext.artist}</div>
          </div>
          <div className="text-sm text-neutral-400 space-y-1">
            <div><span className="text-neutral-500">BPM:</span> Missing</div>
            <div><span className="text-neutral-500">Key:</span> Missing</div>
          </div>
          <button
            type="button"
            onClick={() => setShowBpmReportModal(true)}
            className="w-full py-2 px-4 bg-amber-500/20 text-amber-500 rounded-lg hover:bg-amber-500/30 transition-colors"
          >
            Report Missing BPM
          </button>
        </div>

        {/* Chords Error Scenario */}
        <div className="bg-neutral-900 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-red-500">Chords Error</h2>
          <div>
            <div className="text-lg font-medium">{chordsErrorContext.title}</div>
            <div className="text-neutral-500">{chordsErrorContext.artist}</div>
          </div>
          <div className="text-sm text-neutral-400 space-y-1">
            <div><span className="text-neutral-500">BPM:</span> {chordsErrorContext.bpm}</div>
            <div><span className="text-neutral-500">Key:</span> {chordsErrorContext.key}</div>
            <div className="text-red-400 text-xs mt-2">⚠ {chordsErrorContext.chordsError}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowChordsReportModal(true)}
            className="w-full py-2 px-4 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Report Chords Error
          </button>
        </div>
      </div>

      <ReportIssueModal
        isOpen={showBpmReportModal}
        onClose={() => setShowBpmReportModal(false)}
        songContext={missingBpmContext}
      />

      <ReportIssueModal
        isOpen={showChordsReportModal}
        onClose={() => setShowChordsReportModal(false)}
        songContext={chordsErrorContext}
      />
    </div>
  )
}
