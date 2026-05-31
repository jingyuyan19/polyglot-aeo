import {
  pickSummaryField,
  pickTitleField,
  type CollectionSummary,
} from "../../lib/framer/cms"

export type CollectionFieldOverrides = Record<
  string,
  { titleField?: string; summaryField?: string }
>

export function resolveCollectionFields(
  collection: CollectionSummary,
  overrides: CollectionFieldOverrides,
): { title: string | null; summary: string | null } {
  const ov = overrides[collection.id]
  const title =
    ov?.titleField ?? pickTitleField(collection.fieldNames) ?? null
  const summary =
    ov?.summaryField ?? pickSummaryField(collection.fieldNames) ?? null
  return { title, summary }
}
