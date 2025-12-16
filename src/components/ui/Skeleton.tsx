"use client"

import { memo } from "react"

export interface SkeletonProps {
  readonly className?: string
}

export const Skeleton = memo(function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`bg-neutral-800 animate-pulse rounded ${className}`} />
})

export interface SongCardSkeletonProps {
  readonly className?: string
}

export const SongCardSkeleton = memo(function SongCardSkeleton({
  className = "",
}: SongCardSkeletonProps) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl bg-neutral-900 ${className}`}>
      <div className="w-10 h-10 rounded-lg bg-neutral-800 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-neutral-800 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-neutral-800 rounded animate-pulse w-1/2" />
      </div>
    </div>
  )
})

export interface AlbumArtSkeletonProps {
  readonly className?: string
}

export const AlbumArtSkeleton = memo(function AlbumArtSkeleton({
  className = "",
}: AlbumArtSkeletonProps) {
  return <div className={`w-10 h-10 rounded-lg bg-neutral-800 animate-pulse ${className}`} />
})
