import { describe, expect, it } from "vitest"

import {
  CATEGORY_KEYWORDS,
  PACKING_CATEGORIES,
  guessPackingCategory,
  keywordPattern,
  type PackingCategoryValue,
} from "./categories"

describe("guessPackingCategory", () => {
  it.each<[string, PackingCategoryValue]>([
    // Clothing, also as compounds and plurals
    ["Ullsokker", "CLOTHING"],
    ["Boksere", "CLOTHING"],
    ["T-skjorte", "CLOTHING"],
    ["Regnjakke", "CLOTHING"],
    ["Badetøy", "CLOTHING"],
    ["Ullue", "CLOTHING"],
    ["Joggesko", "CLOTHING"],
    ["Gummistøvler", "CLOTHING"],
    ["Vintertøy barn", "CLOTHING"],
    ["Skibukse", "CLOTHING"],
    // Toiletries
    ["Tannbørste", "TOILETRIES"],
    ["Solkrem", "TOILETRIES"],
    ["Hårstrikk", "TOILETRIES"],
    ["Truseinnlegg", "TOILETRIES"],
    ["Toalettsaker", "TOILETRIES"],
    ["Leppebalsam", "TOILETRIES"],
    // Health
    ["Paracet", "HEALTH"],
    ["Plaster", "HEALTH"],
    ["Myggspray", "HEALTH"],
    ["Øyedråper", "HEALTH"],
    ["Halspastiller", "HEALTH"],
    // Electronics
    ["Mobillader", "ELECTRONICS"],
    ["Ladekabel", "ELECTRONICS"],
    ["PC-lader", "ELECTRONICS"],
    ["Reiseadapter", "ELECTRONICS"],
    ["Hodetelefoner", "ELECTRONICS"],
    ["Powerbank", "ELECTRONICS"],
    ["Pulsbelte", "ELECTRONICS"],
    // Documents, money and keys
    ["Pass", "DOCUMENTS"],
    ["Reiseforsikring", "DOCUMENTS"],
    ["Lommebok", "DOCUMENTS"],
    ["Hyttenøkler", "DOCUMENTS"],
    ["Førerkort", "DOCUMENTS"],
    // Kids
    ["Bleier", "KIDS"],
    ["Smokk", "KIDS"],
    ["Barnevogn", "KIDS"],
    ["Kosedyr", "KIDS"],
    ["Leketøy", "KIDS"],
    // Food
    ["Kaffe", "FOOD"],
    ["Matpakke", "FOOD"],
    ["Syltetøy", "FOOD"],
    ["Skinke", "FOOD"],
    // Outdoor
    ["Kompass", "OUTDOOR"],
    ["Sovepose", "OUTDOOR"],
    ["Ryggsekk", "OUTDOOR"],
    ["Skistaver", "OUTDOOR"],
    ["Hodelykt", "OUTDOOR"],
    ["Drikkeflaske", "OUTDOOR"],
    ["Sykkelhjelm", "OUTDOOR"],
    // Home
    ["Sengetøy", "HOME"],
    ["Badehåndkle", "HOME"],
    ["Håndklær", "HOME"],
    ["Oppvasktabletter", "HOME"],
    ["Søppelsekker", "HOME"],
    ["Matbokser", "HOME"],
    // Leisure
    ["Bok", "LEISURE"],
    ["Lydbok", "LEISURE"],
    ["Kortspill", "LEISURE"],
    ["Ukeblader", "LEISURE"],
    // Nothing to go on
    ["Paraply", "CLOTHING"],
    ["Ørepropper", "OTHER"],
    ["Gave til verten", "OTHER"],
  ])("%s → %s", (name, category) => {
    expect(guessPackingCategory(name)).toBe(category)
  })

  it("ignores case and extra spaces", () => {
    expect(guessPackingCategory("  ULLSOKKER ")).toBe("CLOTHING")
    expect(guessPackingCategory("ØYEDRÅPER")).toBe("HEALTH")
    expect(guessPackingCategory("kvikk   lunsj")).toBe("FOOD")
  })

  it("does not read a short word inside a longer one", () => {
    expect(guessPackingCategory("Kompass")).not.toBe("DOCUMENTS")
    expect(guessPackingCategory("Adresselapp")).toBe("OTHER")
  })

  it("falls back to the hints, such as the bundle's name", () => {
    expect(guessPackingCategory("Rød pose", "Toalettsaker")).toBe("TOILETRIES")
    expect(guessPackingCategory("Sokker", "Toalettsaker")).toBe("CLOTHING")
    expect(guessPackingCategory("Rød pose", null, "Ukjent")).toBe("OTHER")
  })
})

describe("CATEGORY_KEYWORDS", () => {
  it("covers every category but OTHER once", () => {
    expect(CATEGORY_KEYWORDS.map(([category]) => category).sort()).toEqual(
      PACKING_CATEGORIES.filter((category) => category !== "OTHER").sort()
    )
  })

  it("writes keywords in lower case, as names are compared", () => {
    for (const [, keywords] of CATEGORY_KEYWORDS) {
      for (const keyword of keywords) {
        expect(keyword).toBe(keyword.toLocaleLowerCase("nb-NO"))
        expect(() => new RegExp(keywordPattern(keyword))).not.toThrow()
      }
    }
  })
})
