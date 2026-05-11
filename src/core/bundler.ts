import {createHash, timingSafeEqual} from 'crypto'
import path, {join, relative, sep} from 'path'
import {readdir, readFile, stat} from 'fs/promises'
import {pathExistsSync, readJsonSync, writeJsonSync} from '../util/fs'
import {createRequire} from 'module'
import {createLogger} from '../process/workers.process'

export async function createBundle({
  project,
  dist,
  cwd,
  entry,
  cacheStrategy,
  log,
}: {
  project: string
  dist: string
  cwd?: string
  entry: string
  cacheStrategy: 'always' | 'change' | 'never'
  log?: boolean
}): Promise<string> {
  const start = performance.now()

  const out = join(dist, 'bundle.js')
  const entryFile = join(project, entry)
  const packageJsonPath = join(project, 'package.json')
  const logger = createLogger()

  const hash = await calculateProjectHash(project)
  const outdir = path.dirname(out)

  const packageJson = await readJsonSync(packageJsonPath)

  const outPackageJsonPath = join(outdir, 'package.json')
  const cacheFilesExist = pathExistsSync(outPackageJsonPath) && pathExistsSync(out)

  if (cacheFilesExist && cacheStrategy === 'always') {
    logger.warn(`bundle.js will always load from cache`, {
      stage: 'bundler',
      strategy: 'always',
      hint: 'set cache.strategy = never or change',
    })

    return out
  }

  if (cacheFilesExist && cacheStrategy === 'change') {
    const outPackageJson = readJsonSync(outPackageJsonPath)

    if (outPackageJson.hash && safeHashCompare(outPackageJson.hash, hash)) {
      // cache hit

      logger.log(`no change detected - bundle.js has been loaded from cache`, {
        stage: 'bundler',
        strategy: 'change',
        hint: 'none',
      })

      return out
    }

    logger.log(`change detected - bundle.js will be rebuilt`, {stage: 'bundler', strategy: 'change', hint: 'none'})
  }

  const dependencies = Object.entries(readJsonSync(packageJsonPath).dependencies).map((d) => d[0])
  const generated = new Date().toISOString()

  // for now let esbuild notify of errors
  logger.log(`${entry} will be bundled to bundle.js`, {stage: 'bundler', absolute: out})

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

  logger.log(`copying package.json to ${join(dist, 'package.json')}`, {stage: 'bundler'})

  writeJsonSync(path.join(outdir, 'package.json'), {
    ...packageJson,
    hash,
    generated,
    type: 'module',
  })

  const ms = performance.now() - start

  logger.log(`bundle created in ${ms.toFixed(2)} ms`, {stage: 'bundler', duration: ms})

  if (cacheStrategy === 'never') {
    logger.warn(`cache is not enabled`, {stage: 'bundler', hint: 'set bundler.cache.strategy = always|change'})
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

  const logger = createLogger()

  logger.log(`attempting to resolve "esbuild"`, {stage: 'bundler', path: options.entry})
  const esbuild = resolveDependency('esbuild', path.dirname(options.entry))

  if (esbuild.version) {
    logger.log(`bundling with "esbuild" version ${esbuild.version}`, {stage: 'bundler', esbuild: esbuild.version})
  } else {
    logger.warn(`bundling with an unknown esbuild version`, {
      stage: 'bundler',
      hint: `use yarn add esbuild in ${options.entry}`,
    })
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
