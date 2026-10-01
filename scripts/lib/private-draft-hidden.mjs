export function privateDraftHidden({ status, body, title }) {
  if (!title || typeof body !== "string" || body.includes(title)) return false;
  const notFound = status === 404 ||
    (status === 200 && body.includes("NEXT_HTTP_ERROR_FALLBACK;404"));
  return notFound && /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(body);
}
