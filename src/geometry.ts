import type { Design, Node2D, Path, Vec2 } from './types'

export const uid = (prefix = 'id') =>
  `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`

export const clone = <T>(value: T): T => structuredClone(value)

export function isCurve(a: Node2D, b: Node2D) {
  return Boolean(a.out && b.in)
}

export function pointOnSegment(a: Node2D, b: Node2D, t: number): Vec2 {
  if (!isCurve(a, b)) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  const u = 1 - t
  const c1 = a.out!
  const c2 = b.in!
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * b.y
  }
}

/** 曲線を maxStep（mm）以下の刻みで分割する。急な曲がりほど点が密になる。 */
export function sampleSegment(a: Node2D, b: Node2D, maxStep = 1.2): Vec2[] {
  if (!isCurve(a, b)) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]
  // 制御多角形の長さは曲線長の上界なので、刻み幅の目安に使える。
  const rough =
    Math.hypot(a.out!.x - a.x, a.out!.y - a.y) +
    Math.hypot(b.in!.x - a.out!.x, b.in!.y - a.out!.y) +
    Math.hypot(b.x - b.in!.x, b.y - b.in!.y)
  const count = Math.max(6, Math.min(240, Math.ceil(rough / maxStep)))
  return Array.from({ length: count + 1 }, (_, i) => pointOnSegment(a, b, i / count))
}

/** パスのセグメント数。閉じたパスは最後の点から最初の点へ戻る分だけ多い。 */
export function segmentCount(path: Path) {
  if (path.nodes.length < 2) return 0
  return path.closed ? path.nodes.length : path.nodes.length - 1
}

export function segmentEnds(path: Path, index: number): [Node2D, Node2D] {
  return [path.nodes[index], path.nodes[(index + 1) % path.nodes.length]]
}

/** パス全体を折れ線に落とす。閉じたパスでは終点（＝始点）を重複させない。 */
export function samplePath(path: Path, maxStep = 1.2): Vec2[] {
  const result: Vec2[] = []
  const count = segmentCount(path)
  for (let i = 0; i < count; i++) {
    const [a, b] = segmentEnds(path, i)
    const part = sampleSegment(a, b, maxStep)
    if (i) part.shift()
    result.push(...part)
  }
  if (path.closed) result.pop()
  return result
}

function normalized(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

/** セグメントを曲線にする（ハンドルを生やす）／直線に戻す。 */
export function setSmoothSegment(path: Path, index: number, enabled: boolean) {
  const count = path.nodes.length
  if (count < 2) return
  const a = path.nodes[index]
  const b = path.nodes[(index + 1) % count]
  if (!a || !b) return
  if (!enabled) {
    a.out = null
    b.in = null
    return
  }
  const previous = path.closed
    ? path.nodes[(index - 1 + count) % count]
    : (path.nodes[index - 1] ?? a)
  const next = path.closed
    ? path.nodes[(index + 2) % count]
    : (path.nodes[index + 2] ?? b)
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  const tangentA = normalized({ x: b.x - previous.x, y: b.y - previous.y })
  const tangentB = normalized({ x: next.x - a.x, y: next.y - a.y })
  // 辺の長さに比例させる。下限を設けると、小さい図形でハンドルが辺より長くなり、
  // 曲線が行き過ぎてループ（花びら状の突起）になる。
  const handle = span * 0.26
  a.out = { x: a.x + tangentA.x * handle, y: a.y + tangentA.y * handle }
  b.in = { x: b.x - tangentB.x * handle, y: b.y - tangentB.y * handle }
}

/** 全セグメントを滑らかにする。丸い輪郭の下敷きを作るのに使う。 */
export function smoothAll(path: Path) {
  for (let i = 0; i < segmentCount(path); i++) setSmoothSegment(path, i, true)
}

/** その点の前後に線が続いているか。開いたパスの端では片側しかない。 */
function neighboursOf(path: Path, index: number) {
  const count = path.nodes.length
  const hasBefore = path.closed || index > 0
  const hasAfter = path.closed || index < count - 1
  return {
    hasBefore,
    hasAfter,
    previous: hasBefore ? path.nodes[(index - 1 + count) % count] : null,
    next: hasAfter ? path.nodes[(index + 1) % count] : null
  }
}

/**
 * その点を角にする。尖らせるが、隣から流れてくる曲線はそのまま残す。
 *
 * ハンドルを外す（null）と前後の辺まで直線になり、隣の点の持つ曲がりが消えてしまう。
 * そこで**長さ0のハンドル**を置く。辺は曲線のまま扱われ、曲がりを決めるのは隣のハンドルだけになる。
 * 結果として、この点で尖りつつ隣側の曲線は保たれる。隣の点のデータは触らない。
 */
export function setNodeCorner(path: Path, index: number) {
  const node = path.nodes[index]
  if (!node) return
  const { hasBefore, hasAfter } = neighboursOf(path, index)
  node.in = hasBefore ? { x: node.x, y: node.y } : null
  node.out = hasAfter ? { x: node.x, y: node.y } : null
}

export type NodeState = 'smooth' | 'corner'

/**
 * その点の状態。長さのあるハンドルを持てば滑らか、持たなければ角。
 *
 * 直線用の操作は用意していない。**隣り合う2点をどちらも角にすれば、その辺は直線になる**。
 * 両端の制御点が端点と重なったベジェは直線に退化するため。
 */
export function nodeState(path: Path, index: number): NodeState {
  const node = path.nodes[index]
  if (!node) return 'corner'
  const { hasBefore, hasAfter } = neighboursOf(path, index)
  const sides: ('in' | 'out')[] = []
  if (hasBefore) sides.push('in')
  if (hasAfter) sides.push('out')
  return sides.some((part) => handleLength(node, part) > HANDLE_EPSILON) ? 'smooth' : 'corner'
}

/** ハンドルの長さ。点の上に置かれたハンドル（長さ0）は「無い」のと同じ扱いにする。 */
export function handleLength(node: Node2D, part: 'in' | 'out') {
  const handle = node[part]
  return handle ? Math.hypot(handle.x - node.x, handle.y - node.y) : 0
}

const HANDLE_EPSILON = 1e-6

/**
 * その点を滑らかにする。前後の点を結んだ向きを接線にする。
 *
 * 辺が曲線になるには両端のハンドルが要る。相手側に無いときは足すしかないが、
 * **長さ0のハンドル（相手の点そのものの位置）**を置く。
 * こうすると辺は曲線として扱われる一方、曲がりを決めるのはこの点のハンドルだけになり、
 * 隣の点は角のまま変わらない。長さのあるハンドルを足すと、隣まで滑らかになってしまう。
 */
export function setNodeSmooth(path: Path, index: number) {
  const node = path.nodes[index]
  if (!node) return
  const { previous, next, hasBefore, hasAfter } = neighboursOf(path, index)
  const from = previous ?? node
  const to = next ?? node
  const tangent = normalized({ x: to.x - from.x, y: to.y - from.y })
  // 隣までの距離に比例させる。下限を設けると小さい図形でハンドルが辺より長くなり、
  // 曲線が行き過ぎてループになる（下絵をなぞって小さな面を作ったときに発生した）。
  const back = Math.hypot(node.x - from.x, node.y - from.y) * 0.33
  const ahead = Math.hypot(to.x - node.x, to.y - node.y) * 0.33

  if (hasBefore && previous) {
    node.in = { x: node.x - tangent.x * back, y: node.y - tangent.y * back }
    if (!previous.out) previous.out = { x: previous.x, y: previous.y }
  }
  if (hasAfter && next) {
    node.out = { x: node.x + tangent.x * ahead, y: node.y + tangent.y * ahead }
    if (!next.in) next.in = { x: next.x, y: next.y }
  }
}

/** その点自身が滑らかか。長さ0のハンドルしか持たない点は角とみなす。 */
export function isNodeSmooth(path: Path, index: number) {
  const node = path.nodes[index]
  if (!node) return false
  return handleLength(node, 'in') > HANDLE_EPSILON || handleLength(node, 'out') > HANDLE_EPSILON
}

/** ハンドルが実際にセグメントを曲げているか。効いていないハンドルは描かない。 */
export function handleIsActive(path: Path, index: number, part: 'in' | 'out') {
  const node = path.nodes[index]
  if (!node?.[part]) return false
  if (handleLength(node, part) <= HANDLE_EPSILON) return false
  const { previous, next } = neighboursOf(path, index)
  return part === 'in'
    ? Boolean(previous && isCurve(previous, node))
    : Boolean(next && isCurve(node, next))
}

export function nearestOnSegment(a: Node2D, b: Node2D, point: Vec2) {
  let best = { t: 0, point: { x: a.x, y: a.y }, distance: Infinity }
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const candidate = pointOnSegment(a, b, t)
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
    if (distance < best.distance) best = { t, point: candidate, distance }
  }
  return best
}

export function nearestOnPath(path: Path, point: Vec2) {
  let best: { index: number; t: number; point: Vec2; distance: number } | null = null
  for (let i = 0; i < segmentCount(path); i++) {
    const [a, b] = segmentEnds(path, i)
    const hit = nearestOnSegment(a, b, point)
    if (!best || hit.distance < best.distance) best = { index: i, ...hit }
  }
  return best
}

/** セグメントの途中に点を差し込む。曲線なら形を保ったまま分割する（de Casteljau）。 */
export function insertNode(path: Path, index: number, t: number): Node2D {
  const count = path.nodes.length
  const a = path.nodes[index]
  const b = path.nodes[(index + 1) % count]
  const created: Node2D = { id: uid('n'), ...pointOnSegment(a, b, t), in: null, out: null }

  if (isCurve(a, b)) {
    const p0 = { x: a.x, y: a.y }
    const p1 = a.out!
    const p2 = b.in!
    const p3 = { x: b.x, y: b.y }
    const lerp = (u: Vec2, v: Vec2): Vec2 => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t })
    const q0 = lerp(p0, p1)
    const q1 = lerp(p1, p2)
    const q2 = lerp(p2, p3)
    const r0 = lerp(q0, q1)
    const r1 = lerp(q1, q2)
    a.out = q0
    created.in = r0
    created.out = r1
    b.in = q2
  }
  path.nodes.splice(index + 1, 0, created)
  return created
}

export function deleteNode(path: Path, nodeId: string) {
  const index = path.nodes.findIndex((node) => node.id === nodeId)
  if (index < 0) return
  const minimum = path.closed ? 3 : 2
  if (path.nodes.length <= minimum) return
  const previous = path.nodes[(index - 1 + path.nodes.length) % path.nodes.length]
  const next = path.nodes[(index + 1) % path.nodes.length]
  path.nodes.splice(index, 1)
  // 消した点の両隣が片側だけハンドルを持つと形が崩れるので、直線に戻す。
  if (previous && next && !(previous.out && next.in)) {
    previous.out = null
    next.in = null
  }
}

export function boundsOf(points: Vec2[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

export function snapValue(value: number, grid: number) {
  return grid > 0 ? Math.round(value / grid) * grid : value
}

/** 壁厚はスライサーのライン幅の整数倍でないと、層に空隙ができて刃が割れる。 */
export function snapToNozzle(thickness: number, nozzleWidth: number) {
  if (nozzleWidth <= 0) return thickness
  return Math.max(1, Math.round(thickness / nozzleWidth)) * nozzleWidth
}

/** 多角形の符号付き面積。正なら反時計回り。 */
export function signedArea(points: Vec2[]) {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += a.x * b.y - b.x * a.y
  }
  return total / 2
}

/** 輪郭を反時計回りに揃える。オフセットの内外を安定させるために必要。 */
export function toCounterClockwise(points: Vec2[]) {
  return signedArea(points) < 0 ? [...points].reverse() : points
}

/** 点が多角形の内側にあるか。塗られた絵柄をクリックで選ぶのに使う。 */
export function pointInPolygon(ring: Vec2[], point: Vec2) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** 線分どうしの交差判定。輪郭の自己交差チェックに使う。 */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const side = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = side(a, b, c)
  const d2 = side(a, b, d)
  const d3 = side(c, d, a)
  const d4 = side(c, d, b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** 輪郭が自分自身と交差しているか。交差しているとオフセットが破綻する。 */
export function hasSelfIntersection(points: Vec2[]) {
  const n = points.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      // 隣り合う辺は端点を共有するので飛ばす。
      if (i === 0 && j === n - 1) continue
      const c = points[j]
      const d = points[(j + 1) % n]
      if (segmentsCross(a, b, c, d)) return true
    }
  }
  return false
}

/** 輪郭を指定サイズ（最長辺）に合わせ、原点中心に置く。 */
export function fitToSize(points: Vec2[], size: number): Vec2[] {
  const box = boundsOf(points)
  const width = box.maxX - box.minX
  const height = box.maxY - box.minY
  const longest = Math.max(width, height) || 1
  const scale = size / longest
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }))
}

/** 同じ変換を絵柄にも掛ける。枠と絵柄の位置関係を保つため。 */
export function fitTransform(outline: Vec2[], size: number) {
  const box = boundsOf(outline)
  const longest = Math.max(box.maxX - box.minX, box.maxY - box.minY) || 1
  const scale = size / longest
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return (p: Vec2): Vec2 => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale })
}

export function defaultParams(): Design['params'] {
  return {
    size: 75,
    nozzleWidth: 0.4,
    wallHeight: 12.5,
    wallThickness: 1.2,
    bladeThickness: 0.4,
    bladeTaperHeight: 2,
    flangeWidth: 4,
    flangeHeight: 3.5,
    flangeSlope: 45,
    plateThickness: 3,
    stampClearance: 0.9,
    ribHeight: 1.5,
    ribDraft: 5,
    outlineRib: true,
    mirrorStamp: true,
    detailThicken: 0,
    minAngle: 20,
    minBendRadius: 1
  }
}

/** 起動時に出す見本。丸に近い形だと「枠を描く」感覚が伝わりやすい。 */
export function initialDesign(): Design {
  const radius = 30
  const corners = 8
  const nodes: Node2D[] = Array.from({ length: corners }, (_, i) => {
    const angle = (i / corners) * Math.PI * 2
    const wobble = i % 2 === 0 ? 1 : 0.82
    return {
      id: uid('n'),
      x: Math.cos(angle) * radius * wobble,
      y: Math.sin(angle) * radius * wobble,
      in: null,
      out: null
    }
  })
  const outline: Path = { nodes, closed: true }
  smoothAll(outline)

  // 絵柄の見本。線と面の両方が何になるか、開いた瞬間に分かるようにしておく。
  const path = (points: [number, number][], closed: boolean): Path => ({
    nodes: points.map(([x, y]) => ({ id: uid('n'), x, y, in: null, out: null })),
    closed
  })
  const eye = (cx: number): Path =>
    path([[cx - 3, -6], [cx, -8.5], [cx + 3, -6], [cx, -3.5]], true)
  const mouth = path([[-9, 4], [-4.5, 8.5], [0, 9.5], [4.5, 8.5], [9, 4]], false)
  smoothAll(mouth)
  const leftEye = eye(-6)
  const rightEye = eye(6)
  smoothAll(leftEye)
  smoothAll(rightEye)

  return {
    version: 1,
    name: 'クッキー型',
    outline,
    details: [
      { id: uid('d'), kind: 'region', path: leftEye },
      { id: uid('d'), kind: 'region', path: rightEye },
      { id: uid('d'), kind: 'stroke', path: mouth, width: 1.8 }
    ],
    underlay: null,
    params: defaultParams(),
    grid: 5,
    snap: false
  }
}

export function emptyOutline(): Path {
  const radius = 25
  const nodes: Node2D[] = Array.from({ length: 4 }, (_, i) => {
    const angle = (i / 4) * Math.PI * 2
    return { id: uid('n'), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, in: null, out: null }
  })
  const path: Path = { nodes, closed: true }
  smoothAll(path)
  return path
}
