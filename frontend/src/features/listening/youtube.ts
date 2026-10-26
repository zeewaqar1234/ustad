/** Video id from a YouTube link (watch, youtu.be, embed, shorts, live). null if not a YouTube video URL. */
export function youtubeId(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/]+)/)
      id = m ? m[2] : null
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** Official player, German captions on. The app never reads the captions. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?cc_load_policy=1&cc_lang_pref=de`
}
