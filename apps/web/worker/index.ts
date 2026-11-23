interface Env {
  ASSETS: Fetcher
  API_ORIGIN?: string
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const upstream = URL.parse(env.API_ORIGIN ?? '')
    if (!upstream || upstream.protocol !== 'https:' || upstream.username || upstream.password) {
      return Response.json({ code: 'API_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }

    upstream.pathname = url.pathname
    upstream.search = url.search
    try {
      return await fetch(new Request(upstream, request), { redirect: 'manual' })
    } catch {
      return Response.json({ code: 'API_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  },
} satisfies ExportedHandler<Env>
