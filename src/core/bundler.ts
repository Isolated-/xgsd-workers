import {createHash, timingSafeEqual} from 'crypto'
import path, {join, relative, sep} from 'path'
import {readdir, readFile, stat} from 'fs/promises'
import {pathExistsSync, readJsonSync, writeJsonSync} from '../util/fs'
import {createRequire} from 'module'

export async function createBundle({
  project,
  dist,
  cwd,
  entry,
  cacheStrategy,
  log,
}: {
  project: string
  dist?: string
  cwd?: string
  entry: string
  cacheStrategy: 'always' | 'change' | 'never'
  log?: boolean
}): Promise<string> {
  const start = performance.now()

  const xgsd = join(project, dist ?? '.xgsd')
  const out = join(xgsd, 'bundle.js')
  const entryFile = join(project, entry)
  const packageJsonPath = join(project, 'package.json')
  const outPathRel = join(dist ?? '.xgsd', 'bundle.js')

  // v0.7 note
  // dont do this as it adds 20-30MB of memory before anything even runs
  // bundling is fine but current AST parsing/traversal is unneeded
  // instead split into two concerns: dependencies (from package.json) and code changes (from hashes)
  // do this instead:
  const hash = await calculateProjectHash(project)
  const outdir = path.dirname(out)

  const packageJson = await readJsonSync(packageJsonPath)

  const outPackageJsonPath = join(outdir, 'package.json')
  const cacheFilesExist = pathExistsSync(outPackageJsonPath) && pathExistsSync(out)

  if (cacheFilesExist && cacheStrategy === 'always') {
    console.log(`[bundle] ${outPathRel} loaded from cache (set cache.strategy = "never" if this is unintentional)`)

    return out
  }

  if (cacheFilesExist && cacheStrategy === 'change') {
    const outPackageJson = readJsonSync(outPackageJsonPath)

    if (outPackageJson.hash && safeHashCompare(outPackageJson.hash, hash)) {
      // cache hit

      console.log(`[bundle] ${outPathRel} loaded from cache (set cache.strategy = "never" if this is unintentional)`)

      return out
    }
  }

  const dependencies = Object.entries(readJsonSync(packageJsonPath).dependencies).map((d) => d[0])
  const generated = new Date().toISOString()

  // for now let esbuild notify of errors
  await bundle({
    entry: entryFile,
    out,
    banner: {
      generated,
      hash,
    },
    format: 'esm',
    dependencies,
  })

  writeJsonSync(path.join(outdir, 'package.json'), {
    ...packageJson,
    hash,
    generated,
    type: 'module',
  })

  const ms = performance.now() - start

  console.log(`[bundler] copied package.json to ${join(dist ?? '.xgsd', 'package.json')}`)
  console.log(`[bundler] ${entry} bundled to ${outPathRel}`)
  console.log(`[bundler] completed in ${ms.toFixed(2)}ms.`)

  if (cacheStrategy === 'never') {
    console.log(`[bundler] you can speed this up with bundler.cache.strategy = always|change.`)
  }

  return out
}

function bannerLines(object: Record<string, string>) {
  const lines = []
  lines.push(' * xGSD bundle.js')
  for (const key of Object.keys(object)) {
    lines.push(` * ${key}: ${object[key]}`)
  }
  lines.push(' * WARNING: this file is generated. Do not edit manually.')
  return lines.join('\r\n')
}

export function resolvePath(moduleName: string, root: string): string {
  return require.resolve(moduleName, {
    paths: [root],
  })
}

export function resolveDependency(dependency: string, projectRoot: string): any {
  try {
    const require = createRequire(join(projectRoot, 'package.json'))
    return require(dependency)
  } catch {}

  throw new Error(
    `Could not resolve ${dependency}.\nInstall it with \`yarn add ${dependency}\`.\nPath: ${projectRoot}.`,
  )
}

export type WalkedFile = {
  path: string
  hash: string
  size: number
}

type WalkOptions = {
  ignore?: string[]
  filter?: (path: string) => boolean
}

export async function calculateProjectHash(project: string): Promise<string> {
  const hashes = await collectProjectHashes(project, {
    ignore: ['node_modules', '.xgsd', 'dist', '.git'],
    filter: (path) => path.endsWith('.js') || path.endsWith('.ts'),
  })

  const normalised = hashes
    .map((h) => h.hash.trim().slice(0, 9))
    .sort()
    .join('|')

  return createHash('sha256').update(normalised).digest('hex')
}

export async function collectProjectHashes(projectPath: string, options: WalkOptions = {}): Promise<WalkedFile[]> {
  const {ignore = ['node_modules'], filter = () => true} = options

  const files: WalkedFile[] = []

  const ignored = new Set(ignore)

  const shouldIgnore = (target: string) => {
    const parts = relative(projectPath, target).split(sep)

    return parts.some((part) => ignored.has(part))
  }

  const hashFile = async (filePath: string) => {
    const buffer = await readFile(filePath)

    return createHash('sha256').update(buffer).digest('hex')
  }

  const visit = async (current: string): Promise<void> => {
    if (shouldIgnore(current)) {
      return
    }

    const entries = await readdir(current)

    for (const entry of entries) {
      const fullPath = join(current, entry)

      if (shouldIgnore(fullPath)) {
        continue
      }

      const info = await stat(fullPath)

      if (info.isDirectory()) {
        await visit(fullPath)
        continue
      }

      if (!info.isFile()) {
        continue
      }

      const path = relative(projectPath, fullPath)

      if (!filter(path)) {
        continue
      }

      files.push({
        path,
        hash: await hashFile(fullPath),
        size: info.size,
      })
    }
  }

  await visit(projectPath)

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export function safeHashCompare(a: string, b: string): boolean {
  const abuf = Buffer.from(a, 'hex')
  const bbuf = Buffer.from(b, 'hex')

  return timingSafeEqual(abuf, bbuf)
}

export async function bundle(options: {
  entry: string
  out: string
  format: 'esm' | 'cjs'
  banner: Record<string, string>
  dependencies: string[]
}) {
  const {dependencies} = options

  const esbuild = resolveDependency('esbuild', path.dirname(options.entry))

  if (esbuild.version) {
    console.log(`[bundler] building with esbuild@${esbuild.version}`)
  }

  return esbuild.build({
    keepNames: true,
    entryPoints: [options.entry],
    bundle: true,
    platform: 'node',
    outfile: options.out,
    format: options.format,
    minify: false,
    sourcemap: false,
    external: dependencies,
    banner: {
      js: `
/**
${bannerLines(options.banner)}
 */
`.trim(),
    },
  })
}
