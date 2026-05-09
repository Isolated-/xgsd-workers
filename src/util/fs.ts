import {readFileSync, writeFileSync, mkdirSync} from 'fs'
import {writeFile, readFile, constants, access, mkdir} from 'fs/promises'
import {dirname} from 'path'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
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
  try {
    require('fs').accessSync(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}
