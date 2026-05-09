import {pathExistsSync, readJsonSync} from './fs'
import path from 'path'

export function getPackageVersion(input: string, root: string = process.cwd()): string {
  try {
    const pkgPath = resolvePackageJson(input, root)

    console.log(pkgPath)

    const json = readJsonSync(pkgPath)

    if (!json?.version || typeof json.version !== 'string') {
      return 'unknown'
    }

    return `${json.version}`
  } catch (err: any) {
    return 'unknown'
  }
}

export function resolvePackageJson(input: string, root: string): string {
  try {
    return require.resolve(`${input}/package.json`, {
      paths: [root],
    })
  } catch {
    try {
      const entry = require.resolve(input, {
        paths: [root],
      })

      let dir = path.dirname(entry)

      while (dir !== path.dirname(dir)) {
        const candidate = path.join(dir, 'package.json')
        if (pathExistsSync(candidate)) return candidate
        dir = path.dirname(dir)
      }

      throw new Error(`package.json not found for ${input}`)
    } catch (err: any) {
      throw new Error(`Cannot resolve package.json for "${input}"`)
    }
  }
}
