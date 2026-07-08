const fs = require('fs')
const path = require('path')

const configuredBuildPath = process.env.BUILD_PATH || 'build'
const buildDir = path.resolve(__dirname, '..', configuredBuildPath)
const manifestPath = path.join(buildDir, 'asset-manifest.json')

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
}

const copyAlias = (sourceRelativePath, targetRelativePath) => {
  if (!sourceRelativePath) return

  const sourcePath = path.join(buildDir, sourceRelativePath)
  const targetPath = path.join(buildDir, targetRelativePath)

  if (!fs.existsSync(sourcePath)) return

  ensureDir(targetPath)
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`Aliased ${sourceRelativePath} -> ${targetRelativePath}`)
}

if (!fs.existsSync(manifestPath)) {
  console.warn('asset-manifest.json not found, skipping latest asset alias generation.')
  process.exit(0)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const files = manifest.files || {}

copyAlias(files['main.js'], 'static/js/main.latest.js')
copyAlias(files['main.css'], 'static/css/main.latest.css')

for (const assetPath of Object.values(files)) {
  if (typeof assetPath !== 'string') continue

  const jsChunkMatch = assetPath.match(/^static\/js\/(\d+)\.[^.]+\.chunk\.js$/)
  if (jsChunkMatch) {
    copyAlias(assetPath, `static/js/${jsChunkMatch[1]}.latest.chunk.js`)
    continue
  }

  const cssChunkMatch = assetPath.match(/^static\/css\/(\d+)\.[^.]+\.chunk\.css$/)
  if (cssChunkMatch) {
    copyAlias(assetPath, `static/css/${cssChunkMatch[1]}.latest.chunk.css`)
  }
}
