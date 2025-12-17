"use client"

import { FavoriteButton } from "@/components/ui"
import {
  type Setlist,
  chordsStore,
  useChordsState,
  useIsAuthenticated,
  usePreference,
  useSetlistsContainingSong,
  useShowChords,
} from "@/core"
import { MusicNote, MusicNotes, Plus } from "@phosphor-icons/react"
import { memo } from "react"

export interface SongActionBarProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly albumArt?: string
  readonly onAddToSetlist: () => void
}

function SetlistIcon({ setlist }: { readonly setlist: Setlist }) {
  return (
    <div
      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: setlist.color ?? "#6366f1" }}
      title={setlist.name}
    >
      {setlist.icon ? (
        <span className="text-[10px]">{setlist.icon}</span>
      ) : (
        <MusicNote size={10} weight="fill" className="text-white" />
      )}
    </div>
  )
}

export const SongActionBar = memo(function SongActionBar({
  songId,
  title,
  artist,
  albumArt,
  onAddToSetlist,
}: SongActionBarProps) {
  const isAuthenticated = useIsAuthenticated()
  const containingSetlists = useSetlistsContainingSong(songId)
  const isInSetlist = containingSetlists.length > 0
  const enableChords = usePreference("enableChords")
  const chordsState = useChordsState()
  const showChords = useShowChords()
  const hasChordsAvailable = enableChords && chordsState.status === "ready"

  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <FavoriteButton
        songId={songId}
        title={title}
        artist={artist}
        {...(albumArt !== undefined && { albumArt })}
        size="md"
      />

      {isAuthenticated && (
        <button
          type="button"
          onClick={onAddToSetlist}
          className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors text-sm font-medium ${
            isInSetlist
              ? "bg-neutral-800/50 hover:bg-neutral-700/50"
              : "bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-400 hover:text-neutral-300"
          }`}
          aria-label={isInSetlist ? "Manage setlists" : "Add to setlist"}
        >
          {isInSetlist ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 leading-none">
                {containingSetlists.length}
              </span>
              <div className="flex items-center gap-0.5">
                {containingSetlists.slice(0, 3).map(setlist => (
                  <SetlistIcon key={setlist.id} setlist={setlist} />
                ))}
                {containingSetlists.length > 3 && (
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-neutral-700 text-neutral-400 text-[10px] font-medium"
                    title={`${containingSetlists.length - 3} more`}
                  >
                    +{containingSetlists.length - 3}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <Plus size={20} />
              <span>Add to setlist</span>
            </>
          )}
        </button>
      )}

      {hasChordsAvailable && (
        <>
          <div className="w-px h-6 bg-neutral-700" />
          {chordsState.data?.capo !== undefined && chordsState.data.capo > 0 && (
            <span className="px-2 py-1 rounded-full bg-neutral-800/50 text-neutral-400 text-xs font-medium">
              Capo {chordsState.data.capo}
            </span>
          )}
          <button
            type="button"
            onClick={() => chordsStore.toggleShowChords()}
            className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors text-sm font-medium ${
              showChords
                ? "bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
                : "bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
            }`}
            aria-label={showChords ? "Hide chords" : "Show chords"}
            aria-pressed={showChords}
          >
            <MusicNotes size={20} weight={showChords ? "fill" : "regular"} />
            <span>Chords</span>
          </button>
        </>
      )}
    </div>
  )
})
