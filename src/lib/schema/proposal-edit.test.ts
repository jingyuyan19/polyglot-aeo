import { describe, expect, it } from "vitest"

import {
  addFaqQuestion,
  cloneInputs,
  isEditedFromOriginal,
  removeFaqQuestion,
  updateFaqQuestion,
} from "./proposal-edit"
import type {
  ArticleInput,
  FaqPageInput,
  OrganizationInput,
} from "./types"

const SAMPLE_ARTICLE: ArticleInput = {
  kind: "Article",
  canonicalUrl: "https://example.com/post",
  language: "en-US",
  headline: "Original headline",
  description: "Body.",
  authorName: "Editor",
  publisherName: "Acme",
  datePublished: "2026-01-01",
}

const SAMPLE_FAQ: FaqPageInput = {
  kind: "FAQPage",
  canonicalUrl: "https://example.com/faq",
  language: "en-US",
  questions: [
    { question: "Q1", answer: "A1" },
    { question: "Q2", answer: "A2" },
  ],
}

const SAMPLE_ORG: OrganizationInput = {
  kind: "Organization",
  canonicalUrl: "https://example.com/",
  language: "en-US",
  name: "Acme",
  url: "https://example.com/",
  contactPoint: {
    telephone: "+1-555-0100",
    contactType: "customer support",
  },
}

describe("cloneInputs", () => {
  it("returns a deep copy — mutating the clone does not touch the original", () => {
    const clone = cloneInputs(SAMPLE_ARTICLE) as ArticleInput
    clone.headline = "Mutated"
    expect(SAMPLE_ARTICLE.headline).toBe("Original headline")
  })

  it("clones nested arrays (FAQPage questions)", () => {
    const clone = cloneInputs(SAMPLE_FAQ) as FaqPageInput
    clone.questions[0].answer = "Mutated"
    expect(SAMPLE_FAQ.questions[0].answer).toBe("A1")
    // Array reference must also differ — otherwise React's setState
    // would skip the re-render via Object.is equality.
    expect(clone.questions).not.toBe(SAMPLE_FAQ.questions)
  })

  it("clones nested objects (Organization contactPoint)", () => {
    const clone = cloneInputs(SAMPLE_ORG) as OrganizationInput
    clone.contactPoint!.telephone = "+1-555-9999"
    expect(SAMPLE_ORG.contactPoint!.telephone).toBe("+1-555-0100")
  })
})

describe("isEditedFromOriginal", () => {
  it("returns false when inputs equal originalInputs by value", () => {
    const a = cloneInputs(SAMPLE_ARTICLE)
    const b = cloneInputs(SAMPLE_ARTICLE)
    expect(isEditedFromOriginal(a, b)).toBe(false)
  })

  it("returns true after a single field change", () => {
    const edited = cloneInputs(SAMPLE_ARTICLE) as ArticleInput
    edited.headline = "New headline"
    expect(isEditedFromOriginal(edited, SAMPLE_ARTICLE)).toBe(true)
  })

  it("returns false for the identity case (same reference)", () => {
    expect(isEditedFromOriginal(SAMPLE_ARTICLE, SAMPLE_ARTICLE)).toBe(false)
  })

  it("detects FAQ row mutations", () => {
    const edited = cloneInputs(SAMPLE_FAQ) as FaqPageInput
    edited.questions[1].answer = "Edited A2"
    expect(isEditedFromOriginal(edited, SAMPLE_FAQ)).toBe(true)
  })

  it("treats whitespace edits as edited (deliberate — surfaces accidents)", () => {
    const edited = cloneInputs(SAMPLE_ARTICLE) as ArticleInput
    edited.headline = "Original headline " // trailing space
    expect(isEditedFromOriginal(edited, SAMPLE_ARTICLE)).toBe(true)
  })
})

describe("addFaqQuestion", () => {
  it("appends a blank question row", () => {
    const next = addFaqQuestion(SAMPLE_FAQ.questions)
    expect(next).toHaveLength(3)
    expect(next[2]).toEqual({ question: "", answer: "" })
  })

  it("does not mutate the input array", () => {
    const before = [...SAMPLE_FAQ.questions]
    addFaqQuestion(SAMPLE_FAQ.questions)
    expect(SAMPLE_FAQ.questions).toEqual(before)
  })
})

describe("removeFaqQuestion", () => {
  it("removes the row at the given index", () => {
    const next = removeFaqQuestion(SAMPLE_FAQ.questions, 0)
    expect(next).toHaveLength(1)
    expect(next[0]).toEqual({ question: "Q2", answer: "A2" })
  })

  it("preserves the other rows untouched (referential equality)", () => {
    // Using filter — the kept row is the same object reference, so
    // React's per-row reconciliation skips re-rendering it.
    const next = removeFaqQuestion(SAMPLE_FAQ.questions, 0)
    expect(next[0]).toBe(SAMPLE_FAQ.questions[1])
  })

  it("refuses to remove the last remaining question", () => {
    const single: FaqPageInput["questions"] = [
      { question: "Solo", answer: "Only one" },
    ]
    expect(removeFaqQuestion(single, 0)).toBe(single)
  })

  it("returns the input unchanged for out-of-bounds indices", () => {
    expect(removeFaqQuestion(SAMPLE_FAQ.questions, -1)).toBe(
      SAMPLE_FAQ.questions,
    )
    expect(removeFaqQuestion(SAMPLE_FAQ.questions, 99)).toBe(
      SAMPLE_FAQ.questions,
    )
  })
})

describe("updateFaqQuestion", () => {
  it("patches the targeted row's question text", () => {
    const next = updateFaqQuestion(SAMPLE_FAQ.questions, 1, {
      question: "New Q2",
    })
    expect(next[1].question).toBe("New Q2")
    expect(next[1].answer).toBe("A2") // unchanged field preserved
  })

  it("leaves other rows by reference", () => {
    const next = updateFaqQuestion(SAMPLE_FAQ.questions, 1, {
      answer: "Edited A2",
    })
    expect(next[0]).toBe(SAMPLE_FAQ.questions[0])
  })

  it("can patch both fields at once", () => {
    const next = updateFaqQuestion(SAMPLE_FAQ.questions, 0, {
      question: "Q1'",
      answer: "A1'",
    })
    expect(next[0]).toEqual({ question: "Q1'", answer: "A1'" })
  })

  it("returns the input unchanged for out-of-bounds indices", () => {
    expect(updateFaqQuestion(SAMPLE_FAQ.questions, -1, { answer: "x" })).toBe(
      SAMPLE_FAQ.questions,
    )
    expect(updateFaqQuestion(SAMPLE_FAQ.questions, 5, { answer: "x" })).toBe(
      SAMPLE_FAQ.questions,
    )
  })
})
