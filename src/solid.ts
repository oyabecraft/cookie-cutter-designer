import earcut from 'earcut'
import type { Mesh, Vec2, Vec3 } from './types'

/**
 * 断面の輪郭。オフセット量（外が正）と高さの組。
 * これを閉じた輪に書くと、枠の内側・外側・上面・刃先が1周でつながる。
 */
export type ProfilePoint = { o: number; z: number }

/** 点の間隔を揃える。間隔がばらばらだと法線の向きが暴れる。 */
export function resample(polygon: Vec2[], step: number): Vec2[] {
  if (polygon.length < 3) return polygon
  const result: Vec2[] = []
  let carry = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const span = Math.hypot(b.x - a.x, b.y - a.y)
    if (span < 1e-9) continue
    let t = carry
    while (t < span) {
      result.push({ x: a.x + ((b.x - a.x) * t) / span, y: a.y + ((b.y - a.y) * t) / span })
      t += step
    }
    carry = t - span
  }
  return result.length >= 3 ? result : polygon
}

/**
 * 各頂点の外向き法線。角では前後の辺の二等分方向を使い、
 * 傾けた分だけ長さを伸ばして、角でもオフセット量が痩せないようにする。
 */
function vertexNormals(polygon: Vec2[]): Vec2[] {
  const n = polygon.length
  return polygon.map((_, i) => {
    const previous = polygon[(i - 1 + n) % n]
    const current = polygon[i]
    const next = polygon[(i + 1) % n]
    const back = unit2({ x: current.x - previous.x, y: current.y - previous.y })
    const ahead = unit2({ x: next.x - current.x, y: next.y - current.y })
    // 反時計回りの多角形では、進行方向の右手が外側。
    const nBack = { x: back.y, y: -back.x }
    const nAhead = { x: ahead.y, y: -ahead.x }
    const bisector = unit2({ x: nBack.x + nAhead.x, y: nBack.y + nAhead.y })
    const cosine = bisector.x * nAhead.x + bisector.y * nAhead.y
    // 折れが急なほど伸ばす量が増えるので、暴走しないよう頭を抑える。
    const stretch = cosine > 0.25 ? 1 / cosine : 4
    return { x: bisector.x * stretch, y: bisector.y * stretch }
  })
}

function unit2(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

/**
 * 閉じた断面を閉じた経路に沿って一周させる。
 * 断面も経路も閉じているので、蓋を張らなくても隙間のない形になる。
 */
export function sweepClosedProfile(polygon: Vec2[], profile: ProfilePoint[]): Mesh {
  const positions: Vec3[] = []
  const triangles: [number, number, number][] = []
  if (polygon.length < 3 || profile.length < 3) return { positions, triangles }

  const normals = vertexNormals(polygon)
  const pathCount = polygon.length
  const ringCount = profile.length

  for (let j = 0; j < ringCount; j++) {
    const { o, z } = profile[j]
    for (let i = 0; i < pathCount; i++) {
      positions.push([polygon[i].x + normals[i].x * o, polygon[i].y + normals[i].y * o, z])
    }
  }

  const at = (ring: number, index: number) =>
    (ring % ringCount) * pathCount + (index % pathCount)

  for (let j = 0; j < ringCount; j++) {
    for (let i = 0; i < pathCount; i++) {
      const a = at(j, i)
      const b = at(j, i + 1)
      const c = at(j + 1, i + 1)
      const d = at(j + 1, i)
      triangles.push([a, b, c], [a, c, d])
    }
  }
  return { positions, triangles }
}

/**
 * 抜き枠の断面。刃先から立ち上がり、上端でツバが外へ張り出す。
 *
 * ツバを真横に出すと、刃を下にして印刷したときに裏側が水平な天井になり、
 * サポート材が要る。付け根に傾斜を入れて、張り出しを 45° 以内に収める。
 */
export function cutterProfile(params: {
  wallThickness: number
  bladeThickness: number
  bladeTaperHeight: number
  wallHeight: number
  flangeWidth: number
  flangeHeight: number
  /** ツバの裏側の傾き（度）。0 で従来どおりの水平な張り出し。 */
  flangeSlope: number
}): ProfilePoint[] {
  const half = params.wallThickness / 2
  const tip = Math.min(params.bladeThickness / 2, half)
  const taper = Math.min(params.bladeTaperHeight, params.wallHeight)
  const top = params.wallHeight
  const flangeOuter = half + params.flangeWidth
  const flangeTop = top + params.flangeHeight

  // 傾斜のぶんだけ壁の途中から広がり始める。壁より下には食い込ませない。
  const slope = Math.max(0, Math.min(80, params.flangeSlope))
  const drop = Math.min(
    params.flangeWidth * Math.tan((slope * Math.PI) / 180),
    Math.max(0, top - taper)
  )

  const profile: ProfilePoint[] = [
    { o: -tip, z: 0 },
    { o: tip, z: 0 },
    { o: half, z: taper }
  ]
  if (drop > 0) profile.push({ o: half, z: top - drop })
  else profile.push({ o: half, z: top })
  profile.push(
    { o: flangeOuter, z: top },
    { o: flangeOuter, z: flangeTop },
    { o: -half, z: flangeTop },
    { o: -half, z: taper }
  )
  return profile
}

/**
 * 左右を反転する。座標を裏返すと面の裏表も入れ替わるので、三角形の巻き方も逆にする。
 * スタンプはリブ面を下に向けて生地に押すため、そのままだと絵柄が左右逆になる。
 */
export function mirrorMesh(mesh: Mesh): Mesh {
  return {
    positions: mesh.positions.map(([x, y, z]) => [-x, y, z] as Vec3),
    triangles: mesh.triangles.map(([a, b, c]) => [a, c, b] as [number, number, number])
  }
}

/** 凸リブの断面。板の上に乗せる台形で、上に行くほど細くして生地離れを良くする。 */
export function ribProfile(width: number, base: number, height: number, draft: number): ProfilePoint[] {
  const half = width / 2
  const inset = Math.min(half * 0.8, height * Math.tan((draft * Math.PI) / 180))
  return [
    { o: -half, z: base },
    { o: half, z: base },
    { o: half - inset, z: base + height },
    { o: -half + inset, z: base + height }
  ]
}

const area = (ring: Vec2[]) => {
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    total += a.x * b.y - b.x * a.y
  }
  return total / 2
}

function contains(ring: Vec2[], point: Vec2) {
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

/**
 * オフセットの結果は外周と穴が混ざって返ってくる。
 * 向きで外周（反時計回り）と穴（時計回り）を見分け、穴を一番小さい外周に割り当てる。
 */
export function ringsToRegions(rings: Vec2[][]): { outer: Vec2[]; holes: Vec2[][] }[] {
  const outers = rings.filter((ring) => area(ring) > 0)
  const holes = rings.filter((ring) => area(ring) < 0)
  const regions = outers.map((outer) => ({ outer, holes: [] as Vec2[][] }))
  for (const hole of holes) {
    let best: { outer: Vec2[]; holes: Vec2[][] } | null = null
    let bestArea = Infinity
    for (const region of regions) {
      if (!contains(region.outer, hole[0])) continue
      const size = Math.abs(area(region.outer))
      if (size < bestArea) { bestArea = size; best = region }
    }
    best?.holes.push(hole)
  }
  return regions
}

/**
 * 平らな領域を垂直に押し出す。上下に蓋を張るので単体で閉じた立体になる。
 * 抜き勾配は外周だけに掛ける。穴側は 0.1mm 程度の差しか出ないので垂直のままでよい。
 */
export function extrudeRegion(
  outer: Vec2[],
  holes: Vec2[][],
  z0: number,
  z1: number,
  draft = 0
): Mesh {
  const positions: Vec3[] = []
  const triangles: [number, number, number][] = []
  if (outer.length < 3) return { positions, triangles }

  const inset = draft > 0 ? (z1 - z0) * Math.tan((draft * Math.PI) / 180) : 0
  const rings = [outer, ...holes]

  // earcut 用に、外周と穴をひと続きの配列にする。
  const flat: number[] = []
  const holeStarts: number[] = []
  for (const ring of rings) {
    if (ring !== outer) holeStarts.push(flat.length / 2)
    for (const point of ring) flat.push(point.x, point.y)
  }
  const capIndices = earcut(flat, holeStarts, 2)

  const bottomBase = 0
  for (const ring of rings) for (const p of ring) positions.push([p.x, p.y, z0])
  const topBase = positions.length
  const outerNormals = inset ? vertexNormals(outer) : null
  for (const ring of rings) {
    const shrink = ring === outer ? inset : 0
    for (let i = 0; i < ring.length; i++) {
      const n = shrink && outerNormals ? outerNormals[i] : { x: 0, y: 0 }
      positions.push([ring[i].x - n.x * shrink, ring[i].y - n.y * shrink, z1])
    }
  }

  // 蓋。底は下向き、天面は上向きになるよう巻き方を逆にする。
  for (let i = 0; i < capIndices.length; i += 3) {
    const [a, b, c] = [capIndices[i], capIndices[i + 1], capIndices[i + 2]]
    triangles.push([bottomBase + a, bottomBase + c, bottomBase + b])
    triangles.push([topBase + a, topBase + b, topBase + c])
  }

  // 側面。外周は外向き、穴は内向きになるように巻く。
  let offset = 0
  for (const ring of rings) {
    const count = ring.length
    for (let i = 0; i < count; i++) {
      const a = bottomBase + offset + i
      const b = bottomBase + offset + ((i + 1) % count)
      const c = topBase + offset + ((i + 1) % count)
      const d = topBase + offset + i
      triangles.push([a, b, c], [a, c, d])
    }
    offset += count
  }
  return { positions, triangles }
}

export function mergeMeshes(meshes: Mesh[]): Mesh {
  const positions: Vec3[] = []
  const triangles: [number, number, number][] = []
  for (const mesh of meshes) {
    const base = positions.length
    positions.push(...mesh.positions)
    for (const [a, b, c] of mesh.triangles) triangles.push([a + base, b + base, c + base])
  }
  return { positions, triangles }
}

export function meshBounds(mesh: Mesh) {
  const xs = mesh.positions.map((p) => p[0])
  const ys = mesh.positions.map((p) => p[1])
  const zs = mesh.positions.map((p) => p[2])
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs)
  }
}

export function translateMesh(mesh: Mesh, dx: number, dy: number, dz = 0): Mesh {
  return {
    positions: mesh.positions.map(([x, y, z]) => [x + dx, y + dy, z + dz] as Vec3),
    triangles: mesh.triangles
  }
}

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2])
  return length ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0]
}

export function stlBuffer(meshes: Mesh[]): ArrayBuffer {
  const count = meshes.reduce((total, mesh) => total + mesh.triangles.length, 0)
  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  view.setUint32(80, count, true)
  let offset = 84
  for (const mesh of meshes) {
    for (const [ia, ib, ic] of mesh.triangles) {
      const a = mesh.positions[ia]
      const b = mesh.positions[ib]
      const c = mesh.positions[ic]
      const normal = unit(cross(subtract(b, a), subtract(c, a)))
      for (const value of normal) { view.setFloat32(offset, value, true); offset += 4 }
      for (const vertex of [a, b, c]) {
        for (const value of vertex) { view.setFloat32(offset, value, true); offset += 4 }
      }
      view.setUint16(offset, 0, true)
      offset += 2
    }
  }
  return buffer
}

export function createStlBlob(meshes: Mesh[]): Blob {
  return new Blob([stlBuffer(meshes)], { type: 'model/stl' })
}
