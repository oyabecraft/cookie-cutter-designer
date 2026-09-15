/**
 * clipper-lib は型定義を同梱していないので、使う範囲だけ宣言する。
 * 座標は整数で扱う決まりなので、呼び出し側で SCALE 倍してから渡すこと。
 */
declare module 'clipper-lib' {
  export type IntPoint = { X: number; Y: number }
  export type ClipperPath = IntPoint[]

  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
  export const EndType: {
    etOpenSquare: number
    etOpenRound: number
    etOpenButt: number
    etClosedLine: number
    etClosedPolygon: number
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: ClipperPath[], joinType: number, endType: number): void
    Execute(solution: ClipperPath[], delta: number): void
    Clear(): void
  }

  const ClipperLib: {
    JoinType: typeof JoinType
    EndType: typeof EndType
    ClipperOffset: typeof ClipperOffset
  }
  export default ClipperLib
}
