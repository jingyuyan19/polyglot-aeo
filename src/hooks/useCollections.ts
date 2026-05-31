import { useEffect, useState } from "react"
import { listCollections, type CollectionSummary } from "../lib/framer/cms"

export function useCollections(): {
  collections: CollectionSummary[]
  loading: boolean
  reload: () => Promise<void>
} {
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      setCollections(await listCollections())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  return { collections, loading, reload }
}
