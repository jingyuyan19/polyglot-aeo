"use client"

import { useEffect, useState } from "react"

import {
  EMPTY_ATTRIBUTION,
  UTM_KEYS,
  getAttributionSnapshot,
  type Attribution,
} from "./attribution"

export function FormAttributionFields() {
  const [attribution, setAttribution] = useState<Attribution>(EMPTY_ATTRIBUTION)

  useEffect(() => {
    setAttribution(getAttributionSnapshot())
  }, [])

  return (
    <>
      {UTM_KEYS.map((key) => (
        <input key={key} type="hidden" name={key} value={attribution[key]} />
      ))}
      <input type="hidden" name="landing_path" value={attribution.landing_path} />
      <input type="hidden" name="referrer" value={attribution.referrer} />
    </>
  )
}
