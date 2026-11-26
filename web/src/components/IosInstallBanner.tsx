import React, { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { AlertBanner, Button } from '@yggdrasil-lab/ui'

const DISMISS_STORAGE_KEY = 'odysseus:ios-install-banner-dismissed'

export function shouldShowIosInstallBanner(
  userAgent: string,
  isStandalone: boolean,
  dismissed: boolean,
): boolean {
  if (isStandalone || dismissed) return false
  return /iPhone|iPad|iPod/i.test(userAgent) && /AppleWebKit/i.test(userAgent)
}

function readIsStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(display-mode: standalone)').matches
  }
  return false
}

function readDismissed(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const IosInstallBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed())
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const visible = shouldShowIosInstallBanner(userAgent, readIsStandalone(), dismissed)

  if (!visible) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      window.localStorage?.setItem(DISMISS_STORAGE_KEY, 'true')
    } catch {
      // Ignore storage failures in private mode
    }
  }

  return (
    <AlertBanner
      variant="info"
      title="Install Odysseus on iPhone or iPad"
      icon={<Smartphone className="w-4 h-4 text-sky-300" />}
      action={
        <Button
          variant="ghost"
          size="xs"
          className="min-h-[44px] sm:min-h-[34px]"
          onClick={handleDismiss}
        >
          Dismiss
        </Button>
      }
    >
      Tap Share then Add to Home Screen so iOS keeps your saved offline trips, PDFs, and MapPacks beyond 7 days.
    </AlertBanner>
  )
}
