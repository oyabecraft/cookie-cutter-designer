import type { Vec2 } from './types'

/**
 * 輪郭の「曲がりのきつさ」を見る。
 *
 * 抜き型は1本の帯を曲げて輪にするので、鋭すぎる角や小さすぎる曲率半径は作れない。
 * 3Dプリントでも、鋭い角は刃が欠けやすい。
 *
 * 測り方: ある一点の角度を見るのではなく、**一定の弧長ぶんの曲がり量を足し合わせる**。
 * 一点で測ると、サンプル点が角のちょうど上に来るかどうかで値が大きくぶれる
 * （0.6mm刻みで2mm幅だと、同じ星の頂点が 39°〜47° とばらついた）。
 * 合計なら、角がどこにあっても同じ量になる。
 */
export type OutlineProblem = { point: Vec2; kind: 'sharp' | 'tight'; value: number }

type Options = {
  /** これより鋭い角は曲げられない（度）。 */
  minAngle: number
  /** これより小さい曲率半径は曲げられない（mm）。 */
  minRadius: number
  /** 曲がり量を合計する弧の長さ（mm）。 */
  window: number
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y)

/** -π..π に畳んだ向きの差。 */
function wrap(angle: number) {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

type Measured = { angle: number; radius: number }

/** 各点について、前後 window/2 の弧で曲がった合計量から角度と曲率半径を出す。 */
function measure(polygon: Vec2[], window: number): Measured[] {
  const n = polygon.length
  const lengths: number[] = []
  const directions: number[] = []
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    lengths.push(distance(a, b))
    directions.push(Math.atan2(b.y - a.y, b.x - a.x))
  }
  // 点 i での曲がり量は、直前の辺と直後の辺の向きの差。
  const turns = directions.map((_, i) => Math.abs(wrap(directions[i] - directions[(i - 1 + n) % n])))

  const perimeter = lengths.reduce((total, value) => total + value, 0)
  const spacing = perimeter / n || 1
  const half = Math.max(1, Math.round(window / 2 / spacing))

  return polygon.map((_, i) => {
    let turn = 0
    let arc = 0
    // 辺とその終点での曲がりを1組にして数える。
    // 組にしないと辺の本数と曲がりの個数が1つずれ、円で半径が 2h/(2h+1) 倍に縮む。
    for (let k = -half; k < half; k++) {
      const index = (i + k + n) % n
      arc += lengths[index]
      turn += turns[(index + 1) % n]
    }
    const degrees = (turn * 180) / Math.PI
    return {
      angle: Math.max(0, 180 - degrees),
      radius: turn > 1e-6 ? arc / turn : Infinity
    }
  })
}

/**
 * 連続して引っかかった点をひとまとまりにする。1箇所の角を何十件も報告しないため。
 * 輪は閉じているので、末尾と先頭がつながっている場合も1つに数える。
 */
function cluster(
  flagged: number[],
  values: number[],
  polygon: Vec2[],
  gap: number,
  kind: 'sharp' | 'tight'
): OutlineProblem[] {
  if (!flagged.length) return []
  const n = polygon.length
  const groups: number[][] = []
  let group = [flagged[0]]
  for (let i = 1; i < flagged.length; i++) {
    if (flagged[i] - flagged[i - 1] <= gap) group.push(flagged[i])
    else { groups.push(group); group = [flagged[i]] }
  }
  groups.push(group)
  // 先頭の塊と末尾の塊が輪の上でつながっていれば1つにする。
  if (groups.length > 1) {
    const first = groups[0]
    const last = groups[groups.length - 1]
    if (first[0] + n - last[last.length - 1] <= gap) {
      groups[0] = [...last, ...first]
      groups.pop()
    }
  }
  return groups.map((members) => {
    // 一番きつい点を代表にする。
    const worst = members.reduce((best, index) => (values[index] < values[best] ? index : best), members[0])
    return { point: polygon[worst], kind, value: values[worst] }
  })
}

export function outlineProblems(polygon: Vec2[], options: Options): OutlineProblem[] {
  if (polygon.length < 8) return []
  const measured = measure(polygon, options.window)
  const angles = measured.map((m) => m.angle)
  const radii = measured.map((m) => m.radius)

  const sharp: number[] = []
  const tight: number[] = []
  measured.forEach((m, i) => {
    if (m.angle < options.minAngle) sharp.push(i)
    if (m.radius < options.minRadius) tight.push(i)
  })

  const perimeter = polygon.reduce(
    (total, point, i) => total + distance(point, polygon[(i + 1) % polygon.length]), 0)
  const gap = Math.max(2, Math.round((options.window * polygon.length) / perimeter))

  return [
    ...cluster(sharp, angles, polygon, gap, 'sharp'),
    ...cluster(tight, radii, polygon, gap, 'tight')
  ]
}
