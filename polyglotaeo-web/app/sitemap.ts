import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://polyglotaeo.com"
  const routes = [
    "",
    "/pricing",
    "/success",
    "/terms",
    "/privacy",
    "/refund",
    "/contact",
  ]

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date("2026-05-30"),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }))
}
