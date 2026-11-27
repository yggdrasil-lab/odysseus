import React from 'react'
import { Images } from 'lucide-react'
import { AlertBanner, Button, GlassCard } from '@yggdrasil-lab/ui'

import type { ImmichPhotoItem, TripPhotosResponse } from '../types'

export interface DayPhotoStripProps {
  photos: ImmichPhotoItem[]
  companionMode?: boolean
  readOnly?: boolean
}

const PhotoThumbnailTile: React.FC<{ photo: ImmichPhotoItem }> = ({ photo }) => {
  const altText = photo.original_filename ?? 'Trip photo'
  const imgNode = (
    <img
      src={photo.thumbnail_url}
      alt={altText}
      loading="lazy"
      className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-border/80 bg-background/60 shrink-0"
    />
  )
  if (!photo.web_url) {
    return <div className="shrink-0">{imgNode}</div>
  }
  const label = photo.original_filename ? `Open ${photo.original_filename} in Immich` : 'Open photo in Immich'
  return (
    <a
      href={photo.web_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-sky-400"
    >
      {imgNode}
    </a>
  )
}

export const DayPhotoStrip: React.FC<DayPhotoStripProps> = ({
  photos,
  companionMode = false,
  readOnly = false,
}) => {
  if (companionMode || readOnly || photos.length === 0) return null
  return (
    <div data-testid="day-photo-strip" className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
      {photos.map((photo) => (
        <PhotoThumbnailTile key={photo.asset_id} photo={photo} />
      ))}
    </div>
  )
}

export interface ImmichStatusBannerProps {
  photosResponse: TripPhotosResponse | null
  isLoading?: boolean
  companionMode?: boolean
  readOnly?: boolean
  onRetry: () => void
}

export const ImmichStatusBanner: React.FC<ImmichStatusBannerProps> = ({
  photosResponse,
  isLoading = false,
  companionMode = false,
  readOnly = false,
  onRetry,
}) => {
  if (companionMode || readOnly || !photosResponse) return null
  const hasOffline = photosResponse.status === 'offline'
  const hasUngrouped = photosResponse.ungrouped_photos.length > 0
  if (!hasOffline && !hasUngrouped) return null

  return (
    <div className="space-y-3">
      {hasOffline && (
        <div data-testid="immich-offline-banner">
          <AlertBanner
            variant="warning"
            title="Immich Photo Strip Unavailable"
            action={
              <Button size="xs" variant="outline" loading={isLoading} className="min-h-[44px] sm:min-h-[34px]" onClick={onRetry}>
                Retry
              </Button>
            }
          >
            {photosResponse.message ?? 'Immich offline (Muspelheim asleep)'}
          </AlertBanner>
        </div>
      )}
      {hasUngrouped && (
        <GlassCard data-testid="immich-ungrouped-strip" tone="glass" padding="sm" className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Images className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Album Photos ({photosResponse.ungrouped_photos.length})</span>
          </div>
          <DayPhotoStrip photos={photosResponse.ungrouped_photos} companionMode={companionMode} readOnly={readOnly} />
        </GlassCard>
      )}
    </div>
  )
}
