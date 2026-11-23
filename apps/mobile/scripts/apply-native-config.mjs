#!/usr/bin/env node
/**
 * Deterministically (idempotently) injects IeumOffice Mobile Android and iOS
 * native configuration into Tauri's generated `src-tauri/gen/android` and
 * `src-tauri/gen/ios` projects after `tauri android init --ci` / `tauri ios init --ci`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = resolve(HERE, '..')
const NATIVE_CONFIG = join(APP_DIR, 'native-config')
const GEN_DIR = join(APP_DIR, 'src-tauri', 'gen')

function replaceOrInsertBlock(content, startMarker, endMarker, block, anchor) {
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (
      content.slice(0, startIdx) +
      block.trim() +
      content.slice(endIdx + endMarker.length)
    )
  }
  const anchorIdx = content.indexOf(anchor)
  if (anchorIdx === -1) {
    throw new Error(`Could not locate anchor "${anchor}" for native config injection.`)
  }
  return content.slice(0, anchorIdx) + block.trim() + '\n' + content.slice(anchorIdx)
}

export function applyAndroidConfig(genRoot = GEN_DIR) {
  const androidAppMain = join(genRoot, 'android', 'app', 'src', 'main')
  const manifestPath = join(androidAppMain, 'AndroidManifest.xml')
  if (!existsSync(manifestPath)) {
    return { applied: false, reason: 'gen/android not initialized' }
  }

  const xmlDir = join(androidAppMain, 'res', 'xml')
  mkdirSync(xmlDir, { recursive: true })
  copyFileSync(join(NATIVE_CONFIG, 'android', 'file_paths.xml'), join(xmlDir, 'file_paths.xml'))

  const providerBlock = readFileSync(
    join(NATIVE_CONFIG, 'android', 'provider-fragment.xml'),
    'utf8',
  )
  const intentBlock = readFileSync(
    join(NATIVE_CONFIG, 'android', 'intent-filters-fragment.xml'),
    'utf8',
  )

  let manifest = readFileSync(manifestPath, 'utf8')
  manifest = replaceOrInsertBlock(
    manifest,
    '<!-- IEUM_MOBILE_INTENT_FILTERS_START -->',
    '<!-- IEUM_MOBILE_INTENT_FILTERS_END -->',
    intentBlock,
    '</activity>',
  )
  manifest = replaceOrInsertBlock(
    manifest,
    '<!-- IEUM_MOBILE_NATIVE_CONFIG_START -->',
    '<!-- IEUM_MOBILE_NATIVE_CONFIG_END -->',
    providerBlock,
    '</application>',
  )
  writeFileSync(manifestPath, manifest, 'utf8')
  return { applied: true, manifestPath }
}

export function applyIosConfig(genRoot = GEN_DIR) {
  const iosRoot = join(genRoot, 'ios')
  if (!existsSync(iosRoot)) {
    return { applied: false, reason: 'gen/ios not initialized' }
  }
  const candidatePlists = [
    join(iosRoot, 'ieumoffice-mobile_iOS', 'Info.plist'),
    join(iosRoot, 'app_iOS', 'Info.plist'),
    join(iosRoot, 'Info.plist'),
  ]
  const plistPath = candidatePlists.find((p) => existsSync(p))
  if (!plistPath) {
    return { applied: false, reason: 'Info.plist not found under gen/ios' }
  }

  const fragment = readFileSync(join(NATIVE_CONFIG, 'ios', 'Info-fragment.plist'), 'utf8')
  let plist = readFileSync(plistPath, 'utf8')
  if (plist.includes('NSLocalNetworkUsageDescription')) {
    throw new Error('NSLocalNetworkUsageDescription must not be present in Cycle 1 iOS Info.plist')
  }
  plist = replaceOrInsertBlock(
    plist,
    '<!-- IEUM_MOBILE_IOS_PLIST_START -->',
    '<!-- IEUM_MOBILE_IOS_PLIST_END -->',
    fragment,
    '</dict>\n</plist>',
  )
  writeFileSync(plistPath, plist, 'utf8')

  const entitlementsOut = join(dirname(plistPath), 'IeumOfficeMobile.entitlements')
  copyFileSync(join(NATIVE_CONFIG, 'ios', 'Entitlements.plist'), entitlementsOut)
  return { applied: true, plistPath, entitlementsOut }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2] ?? 'all'
  const results = {}
  if (target === 'all' || target === 'android') {
    results.android = applyAndroidConfig()
  }
  if (target === 'all' || target === 'ios') {
    results.ios = applyIosConfig()
  }
  console.log(JSON.stringify(results, null, 2))
}
