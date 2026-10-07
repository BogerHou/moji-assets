// Copied unchanged into the public content repository; standard Node.js only.
import { readFile, writeFile, mkdir, rename, realpath, lstat, open, rm, readdir, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ID = /^[a-z0-9][a-z0-9_-]{0,95}$/
const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/
const DIMENSIONS = ['styles', 'subjects', 'bodyParts']
const KINDS = ['photo', 'design']
export const GALLERY_RELEASE_PATH = 'channels/gallery-v2.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const load = async file => JSON.parse(await readFile(file, 'utf8'))
function fail(message) { throw new Error(message) }
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: object required`)
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label}: unknown field`)
  return value
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label}: invalid text`)
  return value
}
function list(value, max, label, validate = value => text(value, 1000, label)) {
  if (!Array.isArray(value) || value.length > max) fail(`${label}: too many or invalid values`)
  const result = value.map(validate)
  if (new Set(result).size !== result.length) fail(`${label}: duplicate values`)
  return result
}
function itemId(value) { if (typeof value !== 'string' || !ID.test(value) || value === 'internal-save-test') fail('Invalid or internal item ID'); return value }
function https(value) {
  text(value, 4096, 'URL')
  // Keep the exact URL grammar accepted by the native catalog validator; URL()
  // alone would silently normalize spaces, backslashes and Unicode hostnames.
  if (!/^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/.test(value)) fail('Invalid HTTPS URL')
  let parsed; try { parsed = new URL(value) } catch { fail('Invalid HTTPS URL') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.')) fail('Invalid HTTPS URL')
  return value
}
export function safePath(value) {
  if (typeof value !== 'string' || value.length > 512 || !value.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '.' && part !== '..')) fail('Unsafe asset path')
  return value
}
async function readLocal(root, path) {
  safePath(path)
  const realRoot = await realpath(root)
  const absolute = await realpath(resolve(root, path))
  const local = relative(realRoot, absolute)
  if (local === '..' || local.startsWith('..' + sep) || !local) fail('Asset escapes repository')
  if (!(await lstat(absolute)).isFile()) fail('Asset is not a file')
  return readFile(absolute)
}
export function validatePresentation(value) {
  object(value, ['taxonomy', 'quickSubjects', 'searchSuggestions'], 'presentation')
  object(value.taxonomy, DIMENSIONS, 'taxonomy')
  const seen = new Set()
  for (const dimension of DIMENSIONS) {
    if (!Array.isArray(value.taxonomy[dimension]) || value.taxonomy[dimension].length > 60) fail('taxonomy: each dimension has at most 60 labels')
    for (const entry of value.taxonomy[dimension]) {
      object(entry, ['value', 'label'], 'taxonomy entry')
      if (typeof entry.value !== 'string' || !SLUG.test(entry.value) || seen.has(entry.value)) fail('taxonomy: invalid or duplicate slug')
      text(entry.label, 16, 'taxonomy label'); seen.add(entry.value)
    }
  }
  for (const field of ['quickSubjects', 'searchSuggestions']) {
    object(value[field], KINDS, field)
    for (const kind of KINDS) {
      const values = list(value[field][kind], field === 'quickSubjects' ? 10 : 8, field,
        entry => text(entry, field === 'quickSubjects' ? 48 : 50, field))
      if (field === 'quickSubjects' && values.some(slug => !value.taxonomy.subjects.some(entry => entry.value === slug))) fail('quickSubjects must reference a subject')
    }
  }
  return JSON.parse(JSON.stringify(value))
}
function tags(value, taxonomy) {
  object(value, DIMENSIONS, 'tags')
  const result = {}
  for (const dimension of DIMENSIONS) {
    result[dimension] = list(value[dimension], 60, 'tags', entry => text(entry, 48, 'tag'))
    if (result[dimension].some(slug => !taxonomy[dimension].some(entry => entry.value === slug))) fail('Unknown taxonomy tag')
  }
  return result
}
function asset(value, download = false) {
  object(value, ['path', 'width', 'height', 'bytes', ...(download ? ['attributionIncluded', 'changes'] : [])], 'asset')
  if (!safePath(value.path).startsWith('assets/') || !/\.(?:jpg|jpeg|png|webp)$/i.test(value.path)) fail('Asset must reference a versioned image under assets/')
  for (const key of ['width', 'height', 'bytes']) if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > 50000000) fail('Invalid asset dimensions or byte count')
  if (download) {
    if (typeof value.attributionIncluded !== 'boolean') fail('Missing download attribution flag')
    list(value.changes, 100, 'download changes')
  }
  return value
}
export function validateBase(base) {
  object(base, ['schemaVersion', 'channel', 'revision', 'items'], 'base catalog')
  if (base.schemaVersion !== 1 || base.channel !== 'public' || !Array.isArray(base.items) || base.items.length > 10000) fail('Invalid public base catalog')
  const seen = new Set()
  for (const item of base.items) {
    object(item, ['id', 'title', 'kind', 'tags', 'keywords', 'sortOrder', 'assets', 'source', 'rights'], 'base item')
    itemId(item.id); if (seen.has(item.id)) fail('Duplicate base ID'); seen.add(item.id)
    if (!KINDS.includes(item.kind)) fail('Invalid image kind')
    object(item.rights, ['display', 'download', 'derivative'], 'rights')
    if (item.rights.display !== true || ['download', 'derivative'].some(key => typeof item.rights[key] !== 'boolean')) fail('Explicit public rights required')
    object(item.source, ['author', 'pageUrl', 'licenseId', 'licenseUrl', 'attributionText', 'verifiedAt'], 'source')
    text(item.source.author, 1000, 'author'); https(item.source.pageUrl); https(item.source.licenseUrl)
    text(item.source.licenseId, 100, 'license'); text(item.source.attributionText, 10000, 'attribution')
    if (item.source.licenseId === 'INTERNAL-ONLY' || !/^\d{4}-\d{2}-\d{2}$/.test(item.source.verifiedAt) || !Number.isFinite(Date.parse(item.source.verifiedAt)) || new Date(item.source.verifiedAt).toISOString().slice(0, 10) !== item.source.verifiedAt) fail('Invalid source verification')
    object(item.assets, ['thumbnail', 'detail', 'download'], 'assets'); asset(item.assets.thumbnail); asset(item.assets.detail)
    if (item.rights.download) {
      asset(item.assets.download, true)
      const cc0 = /^CC0(?:[ -]1\.0)?$/i.test(item.source.licenseId) && /^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/.test(item.source.licenseUrl)
      if (!cc0 && item.assets.download.attributionIncluded !== true) fail('License requires attributed download')
    } else if (item.assets.download) fail('Download asset exceeds approved rights')
  }
  return base
}
export function makeCatalog(gallery, base, permanentWithdrawals = []) {
  object(gallery, ['schemaVersion', 'items', 'presentation', 'withdrawnIds'], 'gallery')
  if (gallery.schemaVersion !== 1 || !Array.isArray(gallery.items) || gallery.items.length > 10000) fail('Invalid gallery')
  validateBase(base)
  const presentation = validatePresentation(gallery.presentation)
  const withdrawnIds = [...new Set([...list(permanentWithdrawals, 10000, 'previous withdrawals', itemId), ...list(gallery.withdrawnIds, 10000, 'withdrawnIds', itemId)])].sort()
  const byId = new Map(base.items.map(item => [item.id, item]))
  const seen = new Set(), items = []
  for (const edit of gallery.items) {
    object(edit, ['id', 'enabled', 'title', 'keywords', 'tags', 'sortOrder'], 'gallery item')
    itemId(edit.id); if (seen.has(edit.id)) fail('Duplicate gallery ID'); seen.add(edit.id)
    const original = byId.get(edit.id); if (!original) fail(`Unknown base item ${edit.id}; new items require full source, rights and uploaded assets`)
    if (typeof edit.enabled !== 'boolean') fail('enabled must be boolean')
    text(edit.title, 200, 'title'); list(edit.keywords, 100, 'keywords')
    if (!Number.isSafeInteger(edit.sortOrder) || edit.sortOrder < 0) fail('sortOrder must be a nonnegative integer')
    const editedTags = tags(edit.tags, presentation.taxonomy)
    if (original.kind === 'design' && editedTags.bodyParts.length) fail('Designs cannot have photo body parts')
    if (edit.enabled && !withdrawnIds.includes(edit.id)) items.push({ ...original, title: edit.title, keywords: edit.keywords, tags: editedTags, sortOrder: edit.sortOrder })
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id, 'en'))
  const content = { schemaVersion: 1, channel: 'public', items, presentation }
  const revision = 'gh-' + hash(json(content)).slice(0, 24)
  return { catalog: { schemaVersion: 1, channel: 'public', revision, items, presentation }, withdrawnIds }
}
async function optionalJson(file) { try { return await load(file) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error } }
async function atomicWrite(file, data) { await mkdir(dirname(file), { recursive: true }); const temporary = file + '.tmp'; await writeFile(temporary, data); await rename(temporary, file) }

export async function publishGallery({ root, check = false, now = new Date().toISOString() }) {
  root = resolve(root)
  let lock
  try { lock = await open(resolve(root, '.publish.lock'), 'wx') } catch (error) { if (error.code === 'EEXIST') fail('Another publisher holds the lock'); throw error }
  try {
    const [gallery, base, previous, previousIndex] = await Promise.all([
      load(resolve(root, 'gallery.json')), load(resolve(root, 'base-catalog.json')),
      optionalJson(resolve(root, 'release.json')), optionalJson(resolve(root, 'asset-index.json')),
    ])
    if (previous && (previous.schemaVersion !== 1 || !Number.isSafeInteger(previous.sequence) || previous.sequence < 1 || !Array.isArray(previous.removedIds))) fail('Invalid previous release sequence or removals')
    if (!previous && previousIndex) fail('Published release pointer is missing; restore its history before publishing')
    if (previous && !previousIndex) fail('Published asset integrity index is missing')
    if (previousIndex) {
      object(previousIndex, ['schemaVersion', 'files'], 'asset index')
      if (previousIndex.schemaVersion !== 1 || !previousIndex.files || typeof previousIndex.files !== 'object' || Array.isArray(previousIndex.files)) fail('Invalid asset index')
      for (const [path, digest] of Object.entries(previousIndex.files)) if (!safePath(path).startsWith('assets/') || !/^[a-f0-9]{64}$/.test(digest)) fail('Invalid asset integrity entry')
    }
    const { catalog, withdrawnIds } = makeCatalog(gallery, base, previous?.removedIds || [])
    const files = { ...(previousIndex?.files || {}) }
    for (const item of base.items) {
      for (const entry of Object.values(item.assets)) {
        const bytes = await readLocal(root, entry.path)
        if (bytes.length !== entry.bytes) fail(`Asset byte count differs: ${entry.path}`)
        const digest = hash(bytes)
        if (files[entry.path] && files[entry.path] !== digest) fail(`Immutable image path changed: ${entry.path}; upload a new versioned path`)
        files[entry.path] = digest
      }
    }
    const changed = !previous || previous.catalogRevision !== catalog.revision || json(previous.removedIds) !== json(withdrawnIds)
    if (!changed) {
      const alias = await optionalJson(resolve(root, GALLERY_RELEASE_PATH))
      const pointerAliasChanged = json(alias) !== json(previous)
      if (pointerAliasChanged && !check) await atomicWrite(resolve(root, GALLERY_RELEASE_PATH), json(previous))
      return { changed: false, ...(pointerAliasChanged ? { pointerAliasChanged: true, ...(check ? { checked: true } : {}) } : {}), catalog, release: previous }
    }
    const nextSequence = (previous?.sequence || 0) + 1
    if (!Number.isSafeInteger(nextSequence)) fail('Publication sequence overflow')
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(now) || !Number.isFinite(Date.parse(now))) fail('Invalid publication timestamp')
    const release = { schemaVersion: 1, catalogRevision: catalog.revision, publishedAt: now,
      catalogPath: `catalog/${catalog.revision}.json`, removedIds: withdrawnIds, minClientCatalogSchema: 1, sequence: nextSequence }
    const existing = await optionalJson(resolve(root, release.catalogPath))
    if (existing && json(existing) !== json(catalog)) fail('Immutable catalog revision already contains different data')
    if (check) return { changed: true, checked: true, catalog, release }
    // All validation completes before any live data changes. GitHub commits these
    // files together, so readers see the immutable catalog and pointer atomically.
    if (!existing) await atomicWrite(resolve(root, release.catalogPath), json(catalog))
    await atomicWrite(resolve(root, 'asset-index.json'), json({ schemaVersion: 1, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en'))) }))
    await atomicWrite(resolve(root, 'release.json'), json(release))
    await atomicWrite(resolve(root, GALLERY_RELEASE_PATH), json(release))
    return { changed: true, catalog, release }
  } finally { await lock.close(); await rm(resolve(root, '.publish.lock'), { force: true }) }
}

const PUBLIC_OUTPUTS = ['release.json', 'asset-index.json', 'catalog', 'channels', 'assets', 'LICENSES.md']
async function copyPublicTree(source, target) {
  const info = await lstat(source)
  if (info.isSymbolicLink()) fail('Symlinks are not allowed in publication output')
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true })
    for (const entry of await readdir(source)) await copyPublicTree(resolve(source, entry), resolve(target, entry))
  } else if (info.isFile()) { await mkdir(dirname(target), { recursive: true }); await writeFile(target, await readFile(source)) }
  else fail('Unsupported publication file')
}

/** Main is an input workspace; only fully validated outputs reach the published
 * worktree. Git then exposes them in one commit, leaving main edits off the CDN. */
export async function publishFromInput({ inputRoot, publishedRoot, check = false, now }) {
  inputRoot = resolve(inputRoot); publishedRoot = resolve(publishedRoot)
  if (inputRoot === publishedRoot || inputRoot.startsWith(publishedRoot + sep) || publishedRoot.startsWith(inputRoot + sep)) fail('Input and published worktrees must be separate')
  await mkdir(publishedRoot, { recursive: true })
  const staging = await mkdtemp(resolve(dirname(publishedRoot), '.moji-publication-'))
  try {
    for (const name of PUBLIC_OUTPUTS) {
      try { await copyPublicTree(resolve(publishedRoot, name), resolve(staging, name)) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    const base = validateBase(await load(resolve(inputRoot, 'base-catalog.json')))
    const gallery = await load(resolve(inputRoot, 'gallery.json'))
    await writeFile(resolve(staging, 'base-catalog.json'), json(base))
    await writeFile(resolve(staging, 'gallery.json'), json(gallery))
    // Copy only declared client images, not every file someone adds under assets.
    for (const item of base.items) for (const entry of Object.values(item.assets)) {
      const bytes = await readLocal(inputRoot, entry.path)
      const destination = resolve(staging, safePath(entry.path))
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes)
    }
    const licenses = await readLocal(inputRoot, 'LICENSES.md')
    await writeFile(resolve(staging, 'LICENSES.md'), licenses)
    const result = await publishGallery({ root: staging, check, ...(now ? { now } : {}) })
    if (check) return result
    if (!result.changed) {
      if (result.pointerAliasChanged) await copyPublicTree(resolve(staging, GALLERY_RELEASE_PATH), resolve(publishedRoot, GALLERY_RELEASE_PATH))
      let existingLicenses
      try { existingLicenses = await readFile(resolve(publishedRoot, 'LICENSES.md')) } catch (error) { if (error.code !== 'ENOENT') throw error }
      if (!existingLicenses || !existingLicenses.equals(licenses)) {
        await writeFile(resolve(publishedRoot, 'LICENSES.md'), licenses)
        return { ...result, documentationChanged: true }
      }
      return result
    }
    // The caller commits this worktree only after the entire copy succeeds.
    // Validation failure above has not touched any published worktree file.
    for (const name of PUBLIC_OUTPUTS) await copyPublicTree(resolve(staging, name), resolve(publishedRoot, name))
    return result
  } finally { await rm(staging, { recursive: true, force: true }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = { check: false }
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '--check') options.check = true
      else if (arg === '--input' || arg === '--published') {
        const value = args[++index]
        if (!value || value.startsWith('--')) fail('Missing worktree path')
        options[arg === '--input' ? 'inputRoot' : 'publishedRoot'] = value
      } else fail('Usage: node scripts/publish.mjs [--check] [--input main-directory --published published-worktree]')
    }
    if (!!options.inputRoot !== !!options.publishedRoot) fail('--input and --published must be used together')
    const result = options.inputRoot ? await publishFromInput(options) : await publishGallery({ root: fileURLToPath(new URL('../', import.meta.url)), check: options.check })
    console.log(result.changed ? `${result.checked ? 'Validated' : 'Published'} ${result.catalog.items.length} items; sequence ${result.release.sequence}; ${result.catalog.revision}` : result.pointerAliasChanged ? `${result.checked ? 'Validated gallery channel synchronization' : 'Gallery channel pointer synchronized'}; publication sequence unchanged.` : result.documentationChanged ? 'License document updated; catalog and release pointer unchanged.' : 'No published content changes; pointer unchanged.')
  } catch (error) { console.error(`Publication blocked: ${error.message}`); process.exitCode = 1 }
}
