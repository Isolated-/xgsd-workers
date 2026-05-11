import {createHash} from 'crypto'
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'fs'
import {writeFile, readFile, mkdir, readdir, stat} from 'fs/promises'
import {dirname, relative, sep, join, extname} from 'path'
import {createLogger} from '../core/shared.js'

// hashDir
type HashDirOpts = {
  depth?: number
  exclude?: string[]
  include?: string[]
  extensions?: string[]
  filter?: (path: string) => boolean
}

export type WalkedFile = {
  path: string
  hash: string
  size: number
}

const logger = createLogger()

/**
 *  Recursively hashes files in a folder/directory
 *
 *  Replaces collectProjectHashes + calculateProjectHash
 *
 *  @param cwd
 *  @param opts
 *  @returns
 */
export async function hashPath(cwd: string, opts?: HashDirOpts): Promise<{files: number; hash: string}> {
  if (!cwd || !(await pathExists(cwd))) {
    throw new Error(`path "${cwd}" does not exist`)
  }

  const start = performance.now()
  const {exclude = ['node_modules'], filter = () => true, include = [], extensions = [], depth = 50} = opts ?? {}
  const files: WalkedFile[] = []

  const included = new Set(include)
  const includedExtensions = new Set(extensions)

  const excluded = new Set(exclude)

  const shouldIgnore = (target: string) => {
    const parts = relative(cwd, target).split(sep)

    return parts.some((part) => excluded.has(part))
  }

  const shouldInclude = (target: string) => {
    const parts = relative(cwd, target).split(sep)
    return parts.some((part) => included.has(part))
  }

  const hashFile = async (filePath: string) => {
    const buf = await readFile(filePath)
    const hash = createHash('sha256').update(buf).digest('hex')
    const rel = relative(cwd, filePath)

    logger.log(`${rel} has hash ${hash.slice(0, 8)}`, {stage: 'bundler', type: 'change detection'})

    return hash
  }

  let level = 0

  const visit = async (current: string): Promise<void> => {
    if (shouldIgnore(current)) {
      return
    }

    if (level > depth) {
      return
    }

    level = level + 1

    const entries = await readdir(current)

    for (const entry of entries) {
      const fullPath = join(current, entry)
      const ext = extname(fullPath)

      if (!includedExtensions.has(ext) && extensions.length > 0) {
        continue
      }

      if (!shouldInclude(fullPath) && include.length > 0) {
        continue
      }

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

      const path = relative(cwd, fullPath)

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

  await visit(cwd)

  const toHash = files
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((a) => `${a.path}:${a.hash}`)
    .join('|')

  const len = files.length
  const finalHash = createHash('sha256').update(toHash).digest('hex')

  const ms = performance.now() - start
  logger.log(`hashed ${len} files in ${ms.toFixed(2)} ms`, {
    stage: 'bundler',
    type: 'change detection',
    duration: ms,
    files: len,
  })

  return {files: len, hash: finalHash}
}

export async function pathExists(path: string): Promise<boolean> {
  // temp fix
  return pathExistsSync(path)
}

// ensureDir
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, {recursive: true})
}

// ensureDirSync
export function ensureDirSync(path: string): void {
  mkdirSync(path, {recursive: true})
}

// ensurePath
// Ensures parent directory exists for a file path
export async function ensurePath(path: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
}

// ensurePathSync
export function ensurePathSync(path: string): void {
  mkdirSync(dirname(path), {recursive: true})
}

export async function readJson<T = any>(path: string): Promise<T> {
  const content = await readFile(path, 'utf8')
  return JSON.parse(content)
}

export function readJsonSync<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export async function writeJson(path: string, data: unknown, pretty = true): Promise<void> {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

  await writeFile(path, json, 'utf8')
}

export function writeJsonSync(path: string, data: unknown, pretty = true): void {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

  writeFileSync(path, json, 'utf8')
}

export function pathExistsSync(path: string): boolean {
  return existsSync(path)
}
