export type SubscriptionTier = 'free' | 'lite' | 'pro' | 'ultra' | 'unknown'

export interface KbCapacityDisplay {
  tier: SubscriptionTier
  totalBytes: number
}

const GIB = 1024 * 1024 * 1024

export function resolveKbCapacityDisplay(subscription?: string): KbCapacityDisplay {
  const raw = (subscription ?? '').trim().toLowerCase()
  const tier: SubscriptionTier =
    raw === 'pro' ? 'pro' : raw === 'ultra' ? 'ultra' : raw === 'lite' ? 'lite' : raw === 'free' || raw === '' ? 'free' : 'unknown'

  const totalBytes = tier === 'pro' || tier === 'ultra' ? 50 * GIB : 1 * GIB
  return { tier, totalBytes }
}
