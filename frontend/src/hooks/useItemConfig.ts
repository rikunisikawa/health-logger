import { useCallback, useEffect, useState } from 'react'
import { getItemConfig, saveItemConfig } from '../api'
import type { ItemConfig } from '../types'

export function useItemConfig(token: string | null) {
  const [configs, setConfigs] = useState<ItemConfig[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getItemConfig(token)
      .then(({ configs }) => setConfigs(configs))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const save = useCallback(
    async (newConfigs: ItemConfig[]) => {
      if (!token) return
      await saveItemConfig(newConfigs, token)
      setConfigs(newConfigs)
    },
    [token],
  )

  return { configs, loading, save }
}
