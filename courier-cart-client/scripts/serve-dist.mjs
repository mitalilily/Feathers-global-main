import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const indexFile = path.join(distDir, 'index.html')
const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 4173)

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const sendFile = async (req, res, filePath) => {
  const fileStat = await stat(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const headers = {
    'Content-Length': fileStat.size,
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  }

  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(filePath).pipe(res)
}

const resolveStaticPath = (pathname) => {
  const decoded = decodeURIComponent(pathname)
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(distDir, normalized)

  if (!candidate.startsWith(distDir)) return null
  return candidate
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/health')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('ok')
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      return
    }

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const staticPath = resolveStaticPath(requestUrl.pathname)

    if (staticPath) {
      try {
        const fileStat = await stat(staticPath)
        if (fileStat.isFile()) {
          await sendFile(req, res, staticPath)
          return
        }
      } catch {
        const hasExtension = Boolean(path.extname(staticPath))
        if (hasExtension) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not found')
          return
        }
      }
    }

    await sendFile(req, res, indexFile)
  } catch (error) {
    console.error('[client-static-server] request failed', error)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`[client-static-server] serving ${distDir} on ${host}:${port}`)
})
