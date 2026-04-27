export type ShoppingListPricingItem = {
  estimatedPrice: { toNumber(): number } | null
  alternatives: { price: { toNumber(): number } | null }[]
}

export function getShoppingListItemEffectivePrice(item: ShoppingListPricingItem) {
  const altPrice = item.alternatives[0]?.price
  if (altPrice != null) return altPrice.toNumber()
  if (item.estimatedPrice != null) return item.estimatedPrice.toNumber()
  return 0
}
