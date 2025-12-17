"use client"

import { FloatingInfoButton } from "@/components/display"
import { ReportIssueModal } from "@/components/feedback"
import { useState } from "react"

export default function TestReportPage() {
  const [showReportModal, setShowReportModal] = useState(false)

  const mockSongContext = {
    title: "My Sacrifice (2020 Remaster)",
    artist: "Creed feat. Scott Stapp",
    duration: 245,
    bpm: null,
    key: null,
    spotifyId: "10SESRncRBOYeahZRBWf5z",
    bpmSource: null,
    lrclibId: 12345,
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Test Report Dialog (Missing BPM)</h1>
      <p className="text-neutral-400 mb-8">
        Click the warning button in the bottom-left corner to open the report dialog.
      </p>

      <div className="bg-neutral-900 rounded-lg p-6 max-w-md space-y-4">
        <div>
          <div className="text-lg font-medium">{mockSongContext.title}</div>
          <div className="text-neutral-500">{mockSongContext.artist}</div>
        </div>
        
        <div className="text-sm text-neutral-400 space-y-1">
          <div><span className="text-neutral-500">LRCLIB ID:</span> {mockSongContext.lrclibId}</div>
          <div><span className="text-neutral-500">Spotify ID:</span> {mockSongContext.spotifyId}</div>
        </div>

        <div className="mt-4 text-amber-500 text-sm">⚠ BPM data is missing</div>
      </div>

      <FloatingInfoButton
        hasBpm={false}
        onPress={() => {}}
        onWarningPress={() => setShowReportModal(true)}
        position="bottom-left"
      />

      <ReportIssueModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        songContext={mockSongContext}
      />
    </div>
  )
}
