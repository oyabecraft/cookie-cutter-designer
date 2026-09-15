export type Vec2 = { x: number; y: number }

/** アンカー点と、その前後のベジェハンドル。wire-frame-designer と同じ形。 */
export type Node2D = Vec2 & {
  id: string
  /** この点から次の点へ向かう制御点。null なら直線。 */
  out: Vec2 | null
  /** 前の点からこの点へ向かう制御点。null なら直線。 */
  in: Vec2 | null
}

export type Path = {
  nodes: Node2D[]
  /** 輪郭は常に true。絵柄の線は開いたままでもよい。 */
  closed: boolean
}

/** 絵柄の要素。線は太らせて、面はそのまま凸リブになる。 */
export type Detail =
  | { id: string; kind: 'stroke'; path: Path; width: number }
  | { id: string; kind: 'region'; path: Path }

export type Params = {
  /** 全体の最長辺(mm)。輪郭はこの寸法に合わせて拡縮される。 */
  size: number

  /** スライサーのライン幅。壁厚はこの整数倍に丸める。 */
  nozzleWidth: number

  /** 抜き枠 */
  wallHeight: number
  wallThickness: number
  bladeThickness: number
  bladeTaperHeight: number
  flangeWidth: number
  flangeHeight: number
  /** ツバの裏側の傾き(度)。サポート材なしで印刷するために付ける。 */
  flangeSlope: number

  /** スタンプ */
  plateThickness: number
  stampClearance: number
  ribHeight: number
  ribDraft: number
  outlineRib: boolean
  /** 絵柄を左右反転する。押したときに正しい向きで転写されるようにするため。 */
  mirrorStamp: boolean
  /** 絵柄を一括で太らせる量(mm)。細くて印刷できない線の救済用。 */
  detailThicken: number

  /** ステンレスで曲げられる限界。第2段階へ移行できるかの判定に使う。 */
  minAngle: number
  minBendRadius: number
}

/** なぞる元にする画像。画面の座標で位置と大きさを持つ。 */
export type Underlay = {
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
}

export type Design = {
  version: 1
  name: string
  /** 枠。閉じた線1本。抜き枠とスタンプ板の両方の土台になる。 */
  outline: Path
  /** 内部の絵柄。スタンプ面の凸リブになる。 */
  details: Detail[]
  /** 下絵。立体には一切影響しない。 */
  underlay: Underlay | null
  params: Params
  grid: number
  snap: boolean
}

export type Layer = 'outline' | 'detail' | 'underlay'

/** STL に書き出す単位のメッシュ。 */
export type Vec3 = [number, number, number]
export type Mesh = { positions: Vec3[]; triangles: [number, number, number][] }

export type Issue = {
  level: 'error' | 'warn'
  message: string
}
