import type { HealthRecordInput, ItemConfig, LatestRecord } from './types'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ENDPOINT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function createRecord(
  record: HealthRecordInput,
  token: string,
): Promise<{ record_id: string }> {
  return apiFetch('/records', token, {
    method: 'POST',
    body: JSON.stringify(record),
  })
}

export function getLatest(
  token: string,
  limit = 10,
): Promise<{ records: LatestRecord[] }> {
  return apiFetch(`/records/latest?limit=${limit}`, token)
}

export function getItemConfig(token: string): Promise<{ configs: ItemConfig[] }> {
  return apiFetch('/items/config', token)
}

export function saveItemConfig(
  configs: ItemConfig[],
  token: string,
): Promise<{ message: string }> {
  return apiFetch('/items/config', token, {
    method: 'POST',
    body: JSON.stringify({ configs }),
  })
}
