import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { VoiceSettings } from '../../lib/voice'

export const DEFAULT_SETTINGS: VoiceSettings = { show_fluency: false }

export function useVoiceSettings(): VoiceSettings {
  const q = useQuery({ queryKey: ['voice', 'settings'], queryFn: () => api<VoiceSettings>('/api/voice/settings') })
  return q.data ?? DEFAULT_SETTINGS
}
