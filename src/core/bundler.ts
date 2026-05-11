import {createHash, timingSafeEqual} from 'crypto'
import path, {join, relative, sep} from 'path'
import {readdir, readFile, stat} from 'fs/promises'
import {hashPath, pathExistsSync, readJsonSync, writeJsonSync} from '../util/fs.js'
import {createRequire} from 'module'
import {createLogger} from './shared.js'

const logger = createLogger()

export async function createBundle({
  project,
  dist,
  entry,
  cacheStrategy,
  exclude,
  include,
  extensions,
}: {
  project: string
  dist: string
  entry: string
  cacheStrategy: 'always' | 'change' | 'never'
  exclude?: string[]
  include?: string[]
  extensions?: string[]
}): Promise<string> {
  const start = performance.now()

  const out = join(dist, 'bundle.js')
  const entryFile = join(project, entry)
  const packageJsonPath = join(project, 'package.json')

  const outdir = path.dirname(out)
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

  const hash = (await hashPath(project, {exclude, include, extensions})).hash

  logger.log(`worker hash ${hash.slice(0, 8)}`, {stage: 'bundler', type: 'change detection', hash})

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

  const packageJson = await readJsonSync(packageJsonPath)
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
