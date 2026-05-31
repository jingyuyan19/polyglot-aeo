import { useEffect, useState } from "react"
import { getAllLocales, type LocaleInfo } from "../lib/framer/locales"

export function useLocales(): {
  locales: LocaleInfo[]
  loading: boolean
  reload: () => Promise<void>
} {
  const [locales, setLocales] = useState<LocaleInfo[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const result = await getAllLocales()
      setLocales(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  return { locales, loading, reload }
}
