// UI component exports

// Core primitives (TUI redesign)
export { Button, type ButtonProps } from "./Button"
export { Card, CardHeader, CardContent, CardFooter, type CardProps } from "./Card"
export { Badge, type BadgeProps } from "./Badge"
export { IconButton, type IconButtonProps } from "./IconButton"
export { Input, type InputProps } from "./Input"
export { Modal, type ModalProps } from "./Modal"
export {
  Skeleton,
  SongCardSkeleton,
  AlbumArtSkeleton,
  type SkeletonProps,
  type SongCardSkeletonProps,
  type AlbumArtSkeletonProps,
} from "./Skeleton"

// App-specific components
export { AmbientBackground, type AmbientBackgroundProps } from "./AmbientBackground"
export { Attribution, type AttributionProps, type AttributionSource } from "./Attribution"
export { BackButton, type BackButtonProps } from "./BackButton"
export { FavoriteButton, type FavoriteButtonProps } from "./FavoriteButton"
export { GlassCard, type GlassCardProps } from "./GlassCard"
export { Logo } from "./Logo"
export { SongListItem, type SongListItemProps } from "./SongListItem"
export { StatusLabel, type StatusLabelProps, type StatusConfig } from "./StatusLabel"
