import ClipperLib from 'clipper-lib'
import type { Vec2 } from './types'

/**
 * 線を太らせる・多角形を内外にずらす処理。
 *
 * 凹んだ部分では、素直に法線方向へ点を動かすと線が自分自身と交差して破綻する。
 * その手当てを全部書くと一番の難所になるので、実績のあるライブラリに任せる。
 * clipper は整数座標で動くので、mm を 1000 倍して渡し、戻りを 1000 で割る。
 */
const SCALE = 1000

type ClipperPath = { X: number; Y: number }[]

const toClipper = (points: Vec2[]): ClipperPath =>
  points.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))

const fromClipper = (path: ClipperPath): Vec2[] =>
  path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }))

function run(
  paths: Vec2[][],
  delta: number,
  endType: number,
  joinType = ClipperLib.JoinType.jtRound
): Vec2[][] {
  if (!paths.length) return []
  const offsetter = new ClipperLib.ClipperOffset(2, 0.05 * SCALE)
  offsetter.AddPaths(paths.map(toClipper), joinType, endType)
  const solution: ClipperPath[] = []
  offsetter.Execute(solution, delta * SCALE)
  return solution.map(fromClipper).filter((ring) => ring.length >= 3)
}

/** 閉じた多角形を外（正）／内（負）へずらす。結果は複数に分かれることがある。 */
export function offsetPolygon(polygon: Vec2[], delta: number): Vec2[][] {
  if (polygon.length < 3) return []
  if (delta === 0) return [polygon]
  return run([polygon], delta, ClipperLib.EndType.etClosedPolygon)
}

/** 開いた線を幅 width のリボンにする。線の絵柄を凸リブにするのに使う。 */
export function strokeToPolygons(points: Vec2[], width: number): Vec2[][] {
  if (points.length < 2 || width <= 0) return []
  return run([points], width / 2, ClipperLib.EndType.etOpenRound)
}

/** 閉じた線を「輪郭に沿った帯」にする。外周リブを作るのに使う。 */
export function closedStrokeToPolygons(polygon: Vec2[], width: number): Vec2[][] {
  if (polygon.length < 3 || width <= 0) return []
  return run([polygon], width / 2, ClipperLib.EndType.etClosedLine)
}

/**
 * 内側へ r だけ縮めて領域が消えるか分かれるかを見る。
 * 消えた／分かれた場所は幅が 2r 未満ということなので、細すぎるくびれの検出に使える。
 */
export function narrowerThan(polygon: Vec2[], width: number) {
  const shrunk = offsetPolygon(polygon, -width / 2)
  return shrunk.length !== 1
}
