import type { SettingsState } from '@/types/settings'

export async function loadSettings(): Promise<SettingsState> {
  const res = await fetch('/api/settings')
  if (!res.ok) {
    throw new Error(`Failed to load settings: ${res.status}`)
  }
  const data = await res.json()
  return data.settings
}

export async function saveSettings(state: SettingsState): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({settings: state}),
  })
  if (!res.ok) {
    throw new Error(`Failed to save settings: ${res.status}`)
  }
}
