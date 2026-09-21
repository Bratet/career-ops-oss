import { parseDocument, isSeq, isMap, isScalar, type Document } from 'yaml'
import { normalize } from '../yamlPath'

/**
 * Typed edit operations, and the applier that runs them.
 *
 * The model never rewrites the document. It proposes operations against dotted
 * YAML paths and this file applies them, which is what makes the pass auditable:
 * every change is one row with a reason, and the guards below are enforced in
 * code rather than asked for in a prompt.
 */

export type OpKind = 'drop' | 'reword' | 'reorder' | 'set'

export interface Op {
  op: OpKind
  /** Dotted path, same convention the validator reports: cv.sections.Experience[0].highlights[2] */
  path: string
  why: string
  /** reword: the text as it stands now. A mismatch means the op is stale or invented. */
  from?: string | null
  /** reword: the replacement. */
  to?: string | null
  /** set: the new headline value. */
  value?: string | null
  /** reorder: a permutation of the target sequence's indices. */
  order?: number[] | null
  /**
   * What the applier saw at this path when the op first ran. Filled in on the way
   * out, checked on the way back in.
   *
   * This is what makes the editor's undo safe: unchecking one row replays the
   * remaining ops from the pre-pass snapshot, and without a fingerprint a drop
   * whose index had shifted would silently remove the wrong entry.
   */
  expect?: string | null
}

export interface Rejection {
  op: Op
  why: string
}

export interface ApplyResult {
  yaml: string
  applied: Op[]
  rejected: Rejection[]
}

/**
 * Tailoring may only touch cv.*.
 *
 * The design block is the spec in templates/tailored-design.yaml and checkDesign
 * fails a render that drifts from it. Jailing paths here means a tailoring pass
 * cannot cause that failure at all, rather than being asked nicely not to.
 */
const ROOT = 'cv'

interface Resolved {
  parent: unknown
  key: string | number
  node: unknown
}

/** Walk the node tree by segments, keeping the parent so items can be spliced by identity. */
function resolve(doc: Document, segments: string[]): Resolved | null {
  let node: unknown = doc.contents
  let parent: unknown = null
  let key: string | number = ''

  for (const seg of segments) {
    if (node == null) return null

    if (isSeq(node)) {
      const i = Number(seg)
      if (!Number.isInteger(i) || i < 0 || i >= node.items.length) return null
      parent = node
      key = i
      node = node.items[i]
      continue
    }

    if (isMap(node)) {
      const pair = node.items.find((p) => String(isScalar(p.key) ? p.key.value : p.key) === seg)
      if (!pair) return null
      parent = node
      key = seg
      node = pair.value
      continue
    }

    return null
  }

  return { parent, key, node }
}

/** The scalar text at a resolved node, or null when it isn't a plain string. */
function textOf(node: unknown): string | null {
  return isScalar(node) && typeof node.value === 'string' ? node.value : null
}

/** A stable fingerprint of whatever sits at a path: text for a scalar, JSON for a collection. */
function signature(node: unknown): string {
  const text = textOf(node)
  if (text !== null) return text.trim()
  try {
    return JSON.stringify((node as { toJSON?: () => unknown })?.toJSON?.() ?? node)
  } catch {
    return ''
  }
}

/** Comparable tokens: markdown emphasis and punctuation are noise, "vLLM" and "89%" are not. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`_]/g, ' ')
    .replace(/[^a-z0-9à-ÿ+#./%-]+/g, ' ')
    .split(/\s+/)
    // Sentence punctuation would otherwise make "documents." a different token to "documents".
    .map((w) => w.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(Boolean)
}

/**
 * Does this token look like a technology rather than prose?
 *
 * Internal capitals (PyTorch, vLLM), digits (K8s, GPT-4) or an embedded symbol
 * (C++, .NET, scikit-learn). Deliberately narrow: rewording produces new English
 * words by design, and only a new *name* can be a new claim.
 */
function looksTechnical(raw: string): boolean {
  // Bare figures are not names, and noNewNumbers already covers them.
  if (!/[A-Za-z]/.test(raw) || raw.length < 2) return false
  return /[A-Z].*[A-Z]|[a-z][A-Z]|\d|[+#]/.test(raw)
}

/**
 * A reword may fold in the posting's vocabulary. It may not name a technology
 * that appears neither in the CV nor in the posting, because that is a claim
 * nobody made — which is how "TensorRT" would otherwise reach a Skills bucket.
 */
function noInventedTech(from: string, to: string, corpus: string): string | null {
  const known = new Set([...words(from), ...words(corpus)])
  // Split on the same character class words() keeps, so a candidate and its
  // normalized form agree; otherwise "89%" is looked up as "89" and never found.
  const invented = [...new Set(to.split(/[^A-Za-z0-9à-ÿ+#./%-]+/))]
    .filter((raw) => looksTechnical(raw))
    .filter((raw) => {
      const [w] = words(raw)
      return w && !known.has(w)
    })
  if (!invented.length) return null
  return `names something that appears in neither the CV nor the posting: ${invented.slice(0, 4).join(', ')}`
}

/**
 * Rewording surfaces the JD's vocabulary, so new words are the point. New
 * FIGURES never are: a metric that was not there before was invented.
 */
function noNewNumbers(from: string, to: string): string | null {
  const had = new Set(from.match(/[\d]+(?:[.,]\d+)?/g) ?? [])
  const added = (to.match(/[\d]+(?:[.,]\d+)?/g) ?? []).filter((n) => !had.has(n))
  if (!added.length) return null
  return `introduces figures that were not in the original text: ${[...new Set(added)].join(', ')}`
}

/**
 * Apply operations to a YAML document.
 *
 * Two properties matter and both come from the yaml Document API rather than
 * parse+stringify: comments and untouched lines survive byte-identical, and
 * every op is resolved to a NODE before anything mutates, so a drop can never
 * shift the index another op was pointing at.
 */
export function applyOps(
  text: string,
  ops: Op[],
  opts: { posting?: string } = {},
): ApplyResult {
  const doc = parseDocument(text)
  if (doc.errors.length) throw new Error(doc.errors[0].message)

  const rejected: Rejection[] = []
  const applied: Op[] = []

  // Phase 1: validate and resolve everything against the pre-edit document.
  interface Staged { op: Op; target: Resolved | null; parentOfNew?: Resolved | null; key?: string }
  const staged: Staged[] = []

  for (const op of ops) {
    const segments = normalize(op.path)

    if (segments[0] !== ROOT) {
      rejected.push({ op, why: `path is outside ${ROOT}.*; tailoring may not touch the design block` })
      continue
    }

    // `set` is the one op allowed to create a key that does not exist yet (cv.headline).
    let target = resolve(doc, segments)
    let parentOfNew: Resolved | null = null
    if (!target && op.op === 'set' && segments.length > 1) {
      parentOfNew = resolve(doc, segments.slice(0, -1))
      if (!parentOfNew || !isMap(parentOfNew.node)) {
        rejected.push({ op, why: 'path does not exist in the document' })
        continue
      }
    } else if (!target) {
      rejected.push({ op, why: 'path does not exist in the document' })
      continue
    }

    const current = target ? textOf(target.node) : null

    if (typeof op.expect === 'string' && target && signature(target.node) !== op.expect.trim()) {
      rejected.push({ op, why: 'the document has moved on since this change was proposed; it no longer points at the same content' })
      continue
    }

    if (op.path.endsWith('.position') && op.op !== 'drop') {
      rejected.push({ op, why: 'real position titles are immutable; use cv.headline to bridge to the target role' })
      continue
    }

    if (op.op === 'reword') {
      if (typeof op.from !== 'string' || typeof op.to !== 'string') {
        rejected.push({ op, why: 'reword needs both from and to' })
        continue
      }
      if (current === null) {
        rejected.push({ op, why: 'path is not a text value' })
        continue
      }
      if (current.trim() !== op.from.trim()) {
        rejected.push({ op, why: 'the text at this path is not what the op says it is; refusing to reword the wrong line' })
        continue
      }
      const figures = noNewNumbers(current, op.to)
      if (figures) {
        rejected.push({ op, why: figures })
        continue
      }
      const named = noInventedTech(current, op.to, `${text} ${opts.posting ?? ''}`)
      if (named) {
        rejected.push({ op, why: named })
        continue
      }
    }

    if (op.op === 'reorder') {
      if (!target || !isSeq(target.node)) {
        rejected.push({ op, why: 'reorder needs a sequence' })
        continue
      }
      const n = target.node.items.length
      const order = op.order ?? []
      const ok = order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n)
      if (!ok) {
        rejected.push({ op, why: `order must be a permutation of 0..${n - 1}` })
        continue
      }
    }

    if (op.op === 'set') {
      if (op.path !== 'cv.headline') {
        rejected.push({ op, why: 'set may only create or replace cv.headline; use reword for existing text' })
        continue
      }
      if (typeof op.value !== 'string' || !op.value.trim()) {
        rejected.push({ op, why: 'set needs a value' })
        continue
      }
      const figures = noNewNumbers(text, op.value)
      if (figures) {
        rejected.push({ op, why: figures })
        continue
      }
      const named = noInventedTech('', op.value, `${text} ${opts.posting ?? ''}`)
      if (named) {
        rejected.push({ op, why: named })
        continue
      }
    }

    staged.push({
      op: { ...op, expect: target ? signature(target.node) : null },
      target,
      parentOfNew,
      key: segments[segments.length - 1],
    })
  }

  // Phase 2: mutate. In-place value changes first, then reorders, then drops by
  // node identity — no index computed here can go stale.
  for (const { op, target, parentOfNew, key } of staged) {
    if (op.op === 'reword' && target && isScalar(target.node)) {
      target.node.value = op.to
      // The original quoting style may not fit the new text; let the serializer pick.
      target.node.type = undefined
      applied.push(op)
    } else if (op.op === 'set') {
      if (target && isScalar(target.node)) {
        target.node.value = op.value
        target.node.type = undefined
      } else if (parentOfNew && isMap(parentOfNew.node)) {
        parentOfNew.node.set(key, op.value)
      } else if (target && isMap(target.parent)) {
        ;(target.parent as ReturnType<typeof parseDocument>['contents'] & { set(k: unknown, v: unknown): void }).set(target.key, op.value)
      } else if (target && isSeq(target.parent)) {
        target.parent.items[target.key as number] = doc.createNode(op.value)
      } else {
        rejected.push({ op, why: 'nothing settable at this path' })
        continue
      }
      applied.push(op)
    }
  }

  for (const { op, target } of staged) {
    if (op.op !== 'reorder' || !target || !isSeq(target.node)) continue
    const items = target.node.items
    target.node.items = (op.order ?? []).map((i) => items[i])
    applied.push(op)
  }

  for (const { op, target } of staged) {
    if (op.op !== 'drop' || !target) continue
    if (isSeq(target.parent)) {
      const i = target.parent.items.indexOf(target.node as never)
      if (i >= 0) target.parent.items.splice(i, 1)
    } else if (isMap(target.parent)) {
      target.parent.delete(target.key)
    } else {
      rejected.push({ op, why: 'nothing droppable at this path' })
      continue
    }
    applied.push(op)
  }

  return { yaml: doc.toString({ lineWidth: 0 }), applied, rejected }
}
