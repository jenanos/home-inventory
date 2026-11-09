/** URL of a stored attachment, served by app/api/attachments/[id]. */
export function attachmentUrl(
  id: string,
  options: { thumbnail?: boolean; download?: boolean } = {}
) {
  const search = new URLSearchParams()
  if (options.thumbnail) search.set("variant", "thumbnail")
  if (options.download) search.set("download", "1")
  const query = search.toString()
  return `/api/attachments/${id}${query ? `?${query}` : ""}`
}
