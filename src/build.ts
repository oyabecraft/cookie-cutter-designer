import { fitTransform, samplePath, snapToNozzle, toCounterClockwise } from './geometry'
import { offsetPolygon, strokeToPolygons } from './offset'
import {
  cutterProfile, extrudeRegion, mergeMeshes, mirrorMesh, resample, ribProfile,
  ringsToRegions, sweepClosedProfile, translateMesh
} from './solid'
import type { Design, Mesh, Vec2 } from './types'

/** 画面の座標を実寸(mm)・原点中心に直す関数。枠と絵柄で同じ変換を使う。 */
function designTransform(design: Design) {
  const sampled = samplePath(design.outline)
  if (sampled.length < 3) return null
  const fit = fitTransform(sampled, design.params.size)
  // 画面は下が正、3Dは上が正。ここで上下を入れ替えて、見た目と立体の向きを合わせる。
  return (p: Vec2): Vec2 => {
    const q = fit(p)
    return { x: q.x, y: -q.y }
  }
}

/**
 * 書き出し用の変換。実寸(mm)だが、上下は画面のまま。
 * SVG は下方向が正なので、こちらを使うと図が2Dエディタと同じ向きになる。
 * （3D用の `designTransform` は上下を反転している）
 */
export function exportTransform(design: Design) {
  const sampled = samplePath(design.outline)
  if (sampled.length < 3) return null
  return fitTransform(sampled, design.params.size)
}

/** mm の座標を画面の座標に戻す。検査で見つけた場所を2Dに描くのに使う。 */
export function toEditorSpace(design: Design) {
  const sampled = samplePath(design.outline)
  if (sampled.length < 3) return null
  const xs = sampled.map((p) => p.x)
  const ys = sampled.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const longest = Math.max(maxX - minX, maxY - minY) || 1
  const scale = design.params.size / longest
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  // outlinePolygon は y を反転しているので、戻すときも反転する。
  return (p: Vec2): Vec2 => ({ x: p.x / scale + cx, y: -p.y / scale + cy })
}

/** 画面の1単位が何mmにあたるか。絵柄の線幅をmmで扱うために使う。 */
export function mmPerUnit(design: Design) {
  const sampled = samplePath(design.outline)
  if (sampled.length < 3) return 1
  const xs = sampled.map((p) => p.x)
  const ys = sampled.map((p) => p.y)
  const longest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1
  return design.params.size / longest
}

/** 実寸・原点中心・反時計回りの輪郭。 */
export function outlinePolygon(design: Design): Vec2[] {
  const transform = designTransform(design)
  if (!transform) return []
  const fitted = samplePath(design.outline).map(transform)
  // 点の間隔を揃えてから使う。間隔がばらばらだと法線が暴れて壁が波打つ。
  return resample(toCounterClockwise(fitted), 0.6)
}

/** 壁厚はスライサーのライン幅の整数倍に丸める。半端だと層に空隙ができて刃が割れる。 */
export function effectiveWallThickness(design: Design) {
  return snapToNozzle(design.params.wallThickness, design.params.nozzleWidth)
}

export function buildCutter(design: Design): Mesh | null {
  const polygon = outlinePolygon(design)
  if (polygon.length < 3) return null
  const p = design.params
  return sweepClosedProfile(polygon, cutterProfile({
    wallThickness: effectiveWallThickness(design),
    bladeThickness: p.bladeThickness,
    bladeTaperHeight: p.bladeTaperHeight,
    wallHeight: p.wallHeight,
    flangeWidth: p.flangeWidth,
    flangeHeight: p.flangeHeight,
    flangeSlope: p.flangeSlope
  }))
}

/** スタンプ板の外形。枠の内側に、生地を挟んでも動く隙間を空けて収まる大きさ。 */
export function stampPlatePolygon(design: Design): Vec2[] | null {
  const polygon = outlinePolygon(design)
  if (polygon.length < 3) return null
  const inward = effectiveWallThickness(design) / 2 + design.params.stampClearance
  const rings = offsetPolygon(polygon, -inward)
  if (!rings.length) return null
  // 縮めた結果が分かれたら、一番大きい塊を板として使う。
  return rings.reduce((best, ring) => (ring.length > best.length ? ring : best))
}

/** 絵柄を実寸に直して、凸リブの元になる多角形に変換する。 */
export function detailPolygons(design: Design): Vec2[][] {
  const transform = designTransform(design)
  if (!transform) return []
  const thicken = design.params.detailThicken
  const result: Vec2[][] = []
  for (const detail of design.details) {
    const points = samplePath(detail.path).map(transform)
    if (points.length < 2) continue
    if (detail.kind === 'stroke') {
      result.push(...strokeToPolygons(points, detail.width + thicken * 2))
    } else if (points.length >= 3) {
      const ring = toCounterClockwise(points)
      result.push(...(thicken > 0 ? offsetPolygon(ring, thicken) : [ring]))
    }
  }
  return result
}

/**
 * リブの根元を板に少し沈める。
 * 面と面がぴったり接しているだけだと、スライサーによっては結合されずに境目が残る。
 */
const RIB_SINK = 0.2

export function buildStamp(design: Design): Mesh | null {
  const plate = stampPlatePolygon(design)
  if (!plate || plate.length < 3) return null
  const p = design.params
  const parts: Mesh[] = []
  const base = Math.max(0, p.plateThickness - RIB_SINK)
  const top = p.plateThickness + p.ribHeight

  // 板。earcut で上下に蓋を張る。
  parts.push(extrudeRegion(toCounterClockwise(plate), [], 0, p.plateThickness))

  // 外周リブ。板の縁に沿った帯なので、断面を一周させるだけで作れる。
  if (p.outlineRib && p.ribHeight > 0) {
    const ribWidth = Math.max(p.wallThickness, 1.2)
    for (const ring of offsetPolygon(toCounterClockwise(plate), -ribWidth / 2)) {
      parts.push(sweepClosedProfile(
        resample(ring, 0.6),
        ribProfile(ribWidth, base, top - base, p.ribDraft)
      ))
    }
  }

  // 絵柄の凸リブ。
  for (const region of ringsToRegions(detailPolygons(design))) {
    parts.push(extrudeRegion(region.outer, region.holes, base, top, p.ribDraft))
  }

  const stamp = mergeMeshes(parts)
  // リブ面を下に向けて生地に押すので、裏返した時点で絵柄が左右逆になる。
  // 出力の時点で反転させておけば、押した跡が designed のとおりになる。
  return p.mirrorStamp ? mirrorMesh(stamp) : stamp
}

/** 印刷用に2部品を横に並べたもの。 */
export function buildBoth(design: Design): Mesh[] {
  const cutter = buildCutter(design)
  const stamp = buildStamp(design)
  if (!cutter) return []
  if (!stamp) return [cutter]
  const shift = (design.params.size + design.params.size * 0.12 + 5) / 2
  return [translateMesh(cutter, -shift, 0), translateMesh(stamp, shift, 0)]
}
