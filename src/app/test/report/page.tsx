"use client"

import { ReportIssueModal } from "@/components/feedback"
import { useState } from "react"

export default function TestReportPage() {
  const [showBpmReportModal, setShowBpmReportModal] = useState(false)
  const [showChordsReportModal, setShowChordsReportModal] = useState(false)
  const [showLyricsReportModal, setShowLyricsReportModal] = useState(false)

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

  const noLyricsContext = {
    title: "In the End",
    artist: "Linkin Park",
    duration: 216,
    bpm: 105,
    key: "C#m",
    spotifyId: "60a0Rd6pjrkxjPbaKzXjfq",
    bpmSource: "Spotify",
    lrclibId: 5436770,
    chordsError: null,
    lyricsError: "No synced lyrics available (ID: 5436770)",
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Test Report Dialog</h1>
      <p className="text-neutral-400 mb-8">
        Click the warning buttons to test different error scenarios.
      </p>

      <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
        {/* Missing BPM Scenario */}
        <div className="bg-neutral-900 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-amber-500">Missing BPM</h2>
          <div>
            <div className="text-lg font-medium">{missingBpmContext.title}</div>
            <div className="text-neutral-500">{missingBpmContext.artist}</div>
          </div>
          <div className="text-sm text-neutral-400 space-y-1">
            <div>
              <span className="text-neutral-500">BPM:</span> Missing
            </div>
            <div>
              <span className="text-neutral-500">Key:</span> Missing
            </div>
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
            <div>
              <span className="text-neutral-500">BPM:</span> {chordsErrorContext.bpm}
            </div>
            <div>
              <span className="text-neutral-500">Key:</span> {chordsErrorContext.key}
            </div>
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

        {/* No Lyrics Scenario */}
        <div className="bg-neutral-900 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-red-500">No Lyrics</h2>
          <div>
            <div className="text-lg font-medium">{noLyricsContext.title}</div>
            <div className="text-neutral-500">{noLyricsContext.artist}</div>
          </div>
          <div className="text-sm text-neutral-400 space-y-1">
            <div>
              <span className="text-neutral-500">BPM:</span> {noLyricsContext.bpm}
            </div>
            <div>
              <span className="text-neutral-500">Key:</span> {noLyricsContext.key}
            </div>
            <div className="text-red-400 text-xs mt-2">⚠ {noLyricsContext.lyricsError}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowLyricsReportModal(true)}
            className="w-full py-2 px-4 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Report No Lyrics
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

      <ReportIssueModal
        isOpen={showLyricsReportModal}
        onClose={() => setShowLyricsReportModal(false)}
        songContext={noLyricsContext}
      />
    </div>
  )
}
