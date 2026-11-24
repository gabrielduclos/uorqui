interface Env {
  ASSETS: Fetcher
  API_ORIGIN?: string
  FILES?: R2Bucket
  FILES_SECRET?: string
}

const fail = (code: string, status: number) => Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } })
type FileInfo = { id: string; name: string; mime: string; size: number; key: string; ready: boolean }

async function fileRequest(request: Request, env: Env, upstream: URL, id: string, kind = 'files') {
  if (!env.FILES || !env.FILES_SECRET) return fail('FILES_UNAVAILABLE', 503)
  if (!['GET', 'HEAD', 'PUT'].includes(request.method)) return fail('FORBIDDEN', 405)
  if (request.method === 'PUT' && request.headers.get('origin') !== new URL(request.url).origin) return fail('FORBIDDEN', 403)
  const headers = new Headers({ cookie: request.headers.get('cookie') ?? '', 'x-files-secret': env.FILES_SECRET,
    origin: new URL(request.url).origin })
  const authorize = new URL(`/api/internal/${kind}/${id}${request.method === 'PUT' ? '?upload=1' : ''}`, upstream)
  const authorization = await fetch(authorize, { headers, redirect: 'manual' })
  if (!authorization.ok) return new Response(authorization.body, { status: authorization.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  const file = await authorization.json<FileInfo>()
  if (request.method === 'PUT') {
    if (!request.body || Number(request.headers.get('content-length')) !== file.size) return fail('INVALID_FILE', 400)
    if (kind === 'avatars') {
      if (file.size > 1024 * 1024) return fail('INVALID_FILE', 400)
      const bytes = new Uint8Array(await request.arrayBuffer())
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      const png = [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)
      const webp = new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP'
      if (bytes.length !== file.size || !(file.mime === 'image/jpeg' && jpeg || file.mime === 'image/png' && png || file.mime === 'image/webp' && webp)) return fail('INVALID_FILE', 400)
      await env.FILES.put(file.key, bytes, { httpMetadata: { contentType: file.mime } })
    }
    const existing = await env.FILES.head(file.key)
    if (!existing) {
      const stream = new FixedLengthStream(file.size)
      await Promise.all([request.body.pipeTo(stream.writable), env.FILES.put(file.key, stream.readable, {
        httpMetadata: { contentType: file.mime }, customMetadata: { attachmentId: file.id },
      })])
    } else if (existing.size !== file.size) return fail('INVALID_FILE', 400)
    const complete = await fetch(new URL(`/api/internal/${kind}/${id}/complete`, upstream), { method: 'POST', headers })
    if (!complete.ok) return new Response(complete.body, { status: complete.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    return Response.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
  let range: { offset: number; length: number } | undefined
  const requested = request.headers.get('range')
  if (requested) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requested)
    if (!match || (!match[1] && !match[2])) return fail('INVALID_FILE', 416)
    const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]))
    const end = match[1] && match[2] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1
    if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}`, 'Cache-Control': 'no-store' } })
    range = { offset: start, length: end - start + 1 }
  }
  const object = await env.FILES.get(file.key, range ? { range } : undefined)
  if (!object) return fail('FILE_NOT_FOUND', 404)
  const inline = /^(image|video|audio)\//.test(file.mime) && new URL(request.url).searchParams.get('download') !== '1'
  const resultHeaders = new Headers({ 'Content-Type': file.mime, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Length': String(range?.length ?? object.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'Content-Security-Policy': "default-src 'none'; sandbox", 'ETag': object.httpEtag })
  if (range) resultHeaders.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers: resultHeaders })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname.startsWith('/api/internal/')) return fail('FORBIDDEN', 403)
    const upstream = URL.parse(env.API_ORIGIN ?? '')
    if (!upstream || upstream.protocol !== 'https:' || upstream.username || upstream.password) return fail('API_UNAVAILABLE', 503)
    try {
      const avatar = /^\/api\/avatars\/([0-9a-f-]{36})$/.exec(url.pathname)
      if (avatar?.[1]) return await fileRequest(request, env, upstream, avatar[1], 'avatars')
      const file = /^\/api\/files\/([0-9a-f-]{36})$/.exec(url.pathname)
      if (file?.[1]) return await fileRequest(request, env, upstream, file[1])
      upstream.pathname = url.pathname
      upstream.search = url.search
      // Forward streaming responses directly so SSE events reach the client immediately.
      return await fetch(new Request(upstream, request), { redirect: 'manual' })
    } catch { return fail('API_UNAVAILABLE', 503) }
  },
} satisfies ExportedHandler<Env>
