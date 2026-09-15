# 調査記録

2026-09-13 実施。SPEC.md の数値の根拠。

---

## 1. 既存ツール

### Cookiecad (cookiecad.com)
最も参考になる先行例。cutter / stamp / cutter+stamp / stencil / cake topper 等に対応。
出力は STL・OBJ・3MF（サイズ確認用の PDF 印刷も可）。

**料金**: 無料枠は画像アップロード→3Dプレビュー→STLダウンロードまで（アカウント不要）。
Premium は **$14.99/月** または **$150/年（$12.50/月相当）**。2週間の無料トライアルあり。

**Premium 限定機能**（重要）:
- **Separate cutter / stamp combos（2ピースのカッター+スタンプセット）** ← 今回必要な機能
- thicken interior features（内部の細い線を太らせる）
- force solid center bar、invert interior、刃のオフセット方向変更、解像度調整
- ライブラリ、設定プロファイル保存、比例縮尺の複数サイズセット

→ **今回作るものの中核機能が、Cookiecad では課金対象。** 自作する理由になる。

出典: https://app.cookiecad.com/premium

#### 実機で確認した既定値（RESET TO DEFAULTS 状態）

アプリを実際に操作して1項目ずつ確認したもの。**最も信頼度が高い。**

**Size**: Size 75mm / Set size of: Longest Side

**Blade（刃＝カッター壁）**

| 項目 | 既定値 |
|---|---|
| Depth | 12.5 mm |
| **Thickness** | **0.8 mm** ← 壁の厚み |
| Sharp（先端加工） | ON |
| **Tip width** | **0.4 mm** ← 刃先の厚み |
| **Chamfer height** | **2 mm** ← テーパー高さ |
| Extra（第2の支持刃） | OFF |
| Fondant blade（薄刃モード） | OFF |

> **重要な訂正**: 以前「bladeThickness が 0.4 と 0.8 で矛盾」と記録したが、
> **別々のパラメータだった**。Thickness(0.8)=壁、Tip width(0.4)=刃先。矛盾ではない。

**Handle（取っ手＝フランジ相当）**

| 項目 | 既定値 |
|---|---|
| Height | 3.5 mm |
| Width | 4 mm |
| Shape | Rectangular |
| Add press handles（指押し用の別パッド） | OFF |
| — Length / Width | 50 mm / 60 mm |
| — Corner radius | 3 mm |
| — Position | 50 % |
| — **Overlap with cutter** | **7 mm**（正で内側へ、負で隙間） |

**Center Bars**: Enable OFF / Angle 0° / Position 50% / Width 8mm

**Imprint（Imprint Cutter 選択時）**

| 項目 | 既定値 |
|---|---|
| Depth「From blade (0 is flush)」 | 4.5 mm |
| Base width | 1.5 mm |
| Depth curve | Flat |

**Experimental**

| 項目 | 既定値 | UI原文の説明 |
|---|---|---|
| **Imprint thickness** | **0 mm** | "Make the imprint thicker or thinner. This is very useful for designs where the imprint lines are thin and need to be made thicker in order to be printable." |
| Resolution | 100 | STLの最大 dots/mm。精度と速度のトレードオフ |

出典: https://app.cookiecad.com/ （実機操作）

#### URLクエリに埋め込まれた値（共有デザインの例。既定値とは限らない）

| パラメータ | 既定値 | 意味 |
|---|---|---|
| cutterSize | 75 | 全体サイズ（最長辺, mm） |
| sizeType | "longest" | サイズ基準 |
| interiorType | "imprint" | 内部構造タイプ |
| imprintDepth | 4.5 | 刻印の深さ |
| bladeDepth | 12.5 | 刃（枠）の深さ＝型の高さ |
| bladeThickness | 0.4 | 刃（切断面）の厚み |
| extraBladeDepth | 12 | 第二の刃の深さ |
| extraBladeThickness | 0.4 | 第二の刃の厚み |
| baseHeight | 3.5 | フランジの高さ |
| baseWidth | 4 | フランジの幅 |
| centerBar | "horizontal" | 大型用の中央支持バーの向き |
| centerBarWidth | 20 | 中央支持バーの幅 |
| stampCutterTolerance | 0.9 | 枠とスタンプの隙間 |
| stampImprintHeight | 3 | スタンプ凸部の高さ |

出典: https://cookiecad.com/designer /
https://docs.cookiecad.com/cookiecad-designer/features-overview/ /
https://community.cookiecad.com/t/new-feature-two-part-cutter-stamp-embossers-debossers/66

（この表の bladeThickness 1.3 等は共有例の値。実機の既定値は上表を参照）

**独自機能**
- Extra Blade: 第二の切刃を追加して強度と切れ味を向上
- Edge Trace: 詰まったオブジェクトの輪郭をなぞって新しい辺を作成
- Center Bar: 大型カッターの安定性を提供

### その他のツール

| ツール | 入力 | 構造 | 備考 |
|---|---|---|---|
| CutterForge | AIプロンプト/画像/テキスト | 外周＋内部詳細 | 壁厚の推奨開始値 0.8〜1.2mm。スタンプ機能の明記なし |
| Paramecad | 画像/プリセット | cutter + stamp | Thickness / Image width / Depth / **Plunger Diameter** / Padding。既定値は非公開 |
| Feuermurmel/cookie-cutters | SVG→DXF→OpenSCAD | 枠のみ | パラメータ詳細は未確認 |

出典: https://cutterforge.com/cookie-cutter-generator /
https://paramecad.com/models/cookie_cutter /
https://github.com/Feuermurmel/cookie-cutters

### Inkscape → SVG → STL ワークフロー
色で役割を分ける方式。赤=外壁、緑=内壁（穴）、黒=貫通しない内部詳細、青=接続用ポリゴン。
全選択→パスに変換→グループ解除→塗り削除→アウトライン黒に統一→色分け→OpenSCADで開く。

出典: https://wiki.stadtfabrikanten.org/books/integrated-into-default-importexport-menu/page/openscad-cookie-cutter-file-output

### 既存ツールの弱点（差別化の手がかり）

| 不満 | 出典 |
|---|---|
| 壁厚強制機能が `std::bad_alloc` で落ちる。刻印厚みは0.05mm単位でしか変更できず、PNG指定幅に約0.3mmが意図せず加算される | https://community.cookiecad.com/t/enforce-wall-thickness-failing/2510 |
| STL上面にランダムな微小の凹みが生じる | https://cookiecad.tenereteam.com/ |
| テキストのみからの生成非対応、複数デザインモードの併用非対応、一括エクスポートなし | https://www.bakepress.com/blog/bakepress-vs-cookiecad |
| 細い線はスライス時に脆弱化・消失する。過度に細かいディテールは焼いたクッキーに映らず洗浄しづらい | https://www.kaleidacuts.com/pages/stl-faq |
| 単一壁の刃はスライサーの "Detect Thin Walls" を有効にしないと正しく印刷されない | 同上 |

→ **細線の消失を印刷前に警告する機能が、どのツールにも無い。** SPEC 6章の根拠。

#### 刃が割れる原因（設計で防げる）

| 報告 | 運営の回答 |
|---|---|
| 複数のプリンタでカッターの刃が割れる（毎回場所が変わる） | **スライサーのライン幅(0.5mm)と刃厚(1mm)の不一致**、または押出不足 |

→ **壁厚をノズル幅の整数倍にスナップさせれば防げる。** SPEC 3.4 の根拠。
出典: https://community.cookiecad.com/t/cutter-blade-splitting/767

#### 離れた要素は自動で繋がらない

| 報告 | 運営の回答 |
|---|---|
| テキストや複数パーツからなる画像でトレースが不完全になる | 複数パーツの画像は、単一形状として認識できるよう**周囲にアウトライン(枠)を手動で配置する必要がある** |

出典: https://community.cookiecad.com/t/incomplete-image-tracing/78

MakerWorld の SVG カッター生成モデルでも同じ問題が報告されている。
- 「SVGの図形は開いた部分(未閉合パス)を持てないと分かった。浮いている部分を修正したら正常に動いた」
- 壁厚 1.0mm でエラー、1.5mm なら通る
- 生成失敗の報告が繰り返し発生

出典: https://makerworld.com/en/models/2466419-cookie-cutter-and-stamp-generator-2-0-1

→ SPEC 6.1 の輪郭検査（閉じているか／自己交差／孤立領域）の根拠。
Makkuro のモデルには `Connecting_bars`（既定8）という、離れた部品を繋ぐパラメータがある。

#### 生地が取り出せない問題（2部品構成の根拠）

Tinkercad チュートリアルの著者本人の言葉。

> It is just too hard to get the dough out of the cutter without tearing it.
> （生地を破らずにカッターから取り出すのが難しすぎる）

そのため一体型ではなく、**切り抜いてから別途スタンプで模様を押す**2部品構成を勧めている。
また「Little bits (like inside the A, D, and R) will try to stick.」
＝文字の内側など細部が生地にくっつくことも指摘。

印刷時の注意として、天面に穴・隙間があると生地やカビが溜まるため
**Iron 設定**（天面をならす）の使用を推奨している。

出典: https://www.instructables.com/Make-a-Cookie-Cutter-With-Tinkercad/

#### 第三者もラップ使用を推奨している

MakerWorld の SVG クッキー型モデルの食品安全性の注記:
「PLAは基本的に食品安全だが添加剤・着色料は別。**積層痕にバクテリアが付着し洗浄しづらいため、
生地との間にラップを挟むことを推奨**」

→ 本プロジェクトの運用方針と独立に一致している。
出典: https://makerworld.com/en/models/507659-customizable-svg-cookie-cutter

---

## 2. 設計寸法

### 抜き枠

| 項目 | 値 | 出典 |
|---|---|---|
| 刃先厚み | 0.4〜0.8mm（0.4mmノズルで0.4mmまで可） | Creality Blog / Kingroon Blog |
| 刃のテーパー | 上部から下部へ 5〜10° | Kingroon Blog |
| 壁厚 | 標準1.2〜1.5mm（文献により0.8〜2.5mm） | Kingroon / BakeCutter |
| 壁高 | 20〜30mm。生地3〜5mm厚なら7〜10mmで十分 | Kingroon Blog |
| 最小フィーチャー | 0.4mmノズルの実用最小壁厚 0.8mm（2パス分） | 一般FDM設計ガイド |

日本語の実測報告: 自作は壁厚2〜3mm、DAISO市販品は1mm未満。**薄いほど生地を綺麗に切断できる**。
出典: https://zenn.dev/esusaki/articles/29beab9c64145f

出典: https://www.creality.com/blog/how-to-make-3d-printed-cookie-cutters /
https://kingroon.com/blogs/3d-printing-guides/how-to-design-and-3d-print-custom-cookie-cutters /
https://www.bakecutter.com/blog/best-wall-thickness-for-cookie-cutters

### スタンプ

| 項目 | 値 | 出典 |
|---|---|---|
| 凸部の高さ | Cookiecad: imprintDepth 4.5mm / stampImprintHeight 3mm。パスタマシン厚み換算で 0.5〜3mm | Cookiecad / https://community.cookiecad.com/t/what-distance-should-you-use-for-the-imprint-stamp-cutter/635 |
| 凸部の最小幅 | **クッキー専用の確立値は見つからず**。近い一般則は「エンボス文字は線幅2.5mm以上、深さ0.5mm以上」 | 一次資料特定できず |
| 抜き勾配 | **クッキー専用の値は見つからず**。射出成形の一般則は1〜3°、深さ25mmごとに+1° | https://www.xometry.com/resources/machining/draft-angle/ |
| 枠との隙間 | **Cookiecad 実値 0.9mm**。FDM一般則のスライドフィットは0.2〜0.45mm | Cookiecad |

0.9mm が一般則より大きい理由を明記した資料は見つからなかったが、
生地を挟んだ状態でプランジャーが引っかからず動く必要があるためと考えられる。

### プランジャー機構

| 方式 | 内容 | 出典 |
|---|---|---|
| ガイドなし・手押し | 外枠の内壁をガイドとし、押し板を手で押す。無料STLの主流 | Cults3D / Printables 検索結果 |
| バネ内蔵 | 3ピース構成。バネは内径6mm、自然長12mm、圧縮時4mm | https://www.printables.com/model/1092160-cookie-cutter-with-spring |
| 汎用ハンドル | 共通ハンドルを別体で用意し複数の型で使い回す | https://cults3d.com/en/3d-model/home/universal-handle-for-cookie-stamps-embossers |

押し板が斜めに入らないようにするガイド構造の設計論は見つからなかった。

### 実用上の失敗と対策

| 問題 | 対策 | 出典 |
|---|---|---|
| 生地が張り付く | 打ち粉（浮き粉＋粉糖の混合も有効）、生地をしっかり冷蔵/冷凍、抜き勾配、アルコールで清掃 | https://www.foodrepublic.com/1564952/cookie-cutter-tip-prevent-sticking-dough/ / https://ourwrensnest.com/3dcookiecuttertips/ |
| 焼くと模様が消える | 膨張剤なしのショートブレッド系「広がらない」生地、スタンプ後に冷凍15〜20分、オーブンをしっかり予熱 | https://www.kingarthurbaking.com/blog/2015/12/18/stamp-cookies / https://www.cotta.jp/special/qa/sweets_00065.php |
| 壁が折れる・刃が鈍る | 壁厚1.2mm以上、PETGも選択肢、食洗機不可・手洗いのみ | Kingroon Blog |

日本語の実践知: 「枠を押さえてからスタンプをグッと押し、枠を持ち上げてから
スタンプ部分を軽く数回押して生地を離す」
出典: https://minne.com/items/26469369

### 3Dプリント設定

| 項目 | 推奨 | 出典 |
|---|---|---|
| 積層ピッチ | 標準0.2mm、細かい装飾は0.12mm | Cookiecad Community / https://www.kaleidacuts.com/pages/stl-faq |
| ウォール数 | 2〜3（0.4mmノズルで壁厚0.8〜1.2mm相当）、インフィル20% | 二次情報 |
| 印刷方向 | **刃をプラットフォーム側に向けて**サポートなし。"Detect Thin Walls" を有効化 | Cookiecad Community |

---

## 3. ステンレス化の制約（第2段階用）

| 項目 | 値 | 出典 |
|---|---|---|
| 板厚 | DIY: 0.2〜0.3mm（0.2mmの18-8が曲げやすい）。業者オーダー: 最薄0.5mmから | https://ameblo.jp/chouette-icingcookies/entry-12096203082.html |
| 帯の高さ | 業者オーダーの基本は20mm | 検索スニペットのみ |
| 曲げ最小半径 | **クッキー型専用の値は見つからず**。一般板金では板厚の0.5倍、ステンレスは加工硬化するため1.5〜2倍が望ましい | https://industrialmonitordirect.com/blogs/knowledgebase/resolving-sheet-metal-bending-limitations-minimum-bend-radius |
| 鋭角の限界 | **見つからず**。紙のトムソン刃型では鋭角/直角部は刃が交差した跡になりやすく避けるべきとされる | https://www.irie-design.com/blog/die-cut-printing-design.html |

### 「1本の閉じた輪郭」の意味（重要）

抜き型は1本の帯を曲げて輪にする構造のため、輪郭は次を満たす必要がある。

- **自己交差しない**
- **枝分かれしない**
- **始点と終点が一致する閉曲線**

「あ」のように内側に孤立した閉領域がある図形は1本の帯で表現できず、
ブリッジを追加して1本の閉曲線に変換するか、複数の型に分割する必要がある。
紙のトムソン型のデータ作成ガイドでも「オープンパスは使えず、クローズドパスが必要」と明記。

出典: https://katanuki-insatsu.com/technicalguide/option.html

**留保**: この章の多くは紙用トムソン型・一般板金からの類推。
食品用ステンレス薄帯（0.2〜0.5mm厚）に特化した一次資料は見つからなかった。
実際に金属化する際は業者へ設計データを渡して個別確認が必要。

### 外注先候補
- 馬嶋屋菓子道具店: 家庭用仕様 板厚0.2〜0.3mm・幅20mm・納期約2週間 /
  プロ仕様 板厚0.4〜0.5mm・幅50mm・納期30〜40日。価格は個別見積り
- ゆるキャラクッキー工房、FUJI-HOUSE

---

## 3.5 追加調査（Meshcast、ワークフローの失敗例）

### Meshcast (meshcast.app/cutter)
最も詳細にパラメータを公開している競合。スタンプ生成にも対応。
入力は PNG/JPG/SVG のシルエット画像、またはテキスト（複数フォント）。

| パラメータ | 値 |
|---|---|
| 検出閾値 | 128 |
| アウトライン平滑化 | 0.0 mm |
| 生地厚さ（ブレード高さ） | 6.0 mm |
| ブレード厚さ | 1.6 mm |
| ブレード高さ | 14 mm |
| トップリム | 4 mm |
| ベース厚さ | 3 mm |
| **スタンプ詳細深さ** | **1.5 mm** |
| レリーフ深さ | 2 mm |
| ボーダーリング | 1〜8 mm |
| フレームパディング | 12 mm |

**スタンプ詳細深さ 1.5mm は SPEC の ribHeight 暫定値と一致。**
Cookiecad の 3mm とは異なるが、独立した2つ目のツールが 1.5mm を採用している点で
暫定値の妥当性が上がる。

**ローラーカッター機能**: 円柱状の型で一括して多数を抜く方式も持つ
（ローラー直径60mm、長さ100mm、軸穴径8mm、周囲/縦のクッキー数 4×3）。
→ イベントで数を作る用途に有効な可能性。将来の拡張候補として記録。

出典: https://meshcast.app/cutter / https://meshcast.app/guides/3d-printed-stamps

### パラメータ値の食い違い（注意）
同じ Cookiecad でも情報源により値が異なる。

| 項目 | URLから抽出した実値 | 別の情報源 |
|---|---|---|
| 壁厚 | （bladeThickness 0.4） | 1.5 mm |
| 型の高さ | 12.5 mm | 20 mm |
| 枠とスタンプの公差 | 0.9 mm | 2 mm |
| スタンプ深さ | 3 mm | 2〜3 mm、背面高さ5.5mm |

SPEC ではURLから抽出した実値を優先採用した。試作で検証すること。

### arpruss の Inkscape 拡張の色分け方式
SPEC のレイヤー分離と同じ発想が、先行例にも存在する。

| 色 | 意味 |
|---|---|
| 赤 | 外壁アウトライン（単一ポリゴン） |
| 緑 | 内壁（穴）アウトライン |
| 黒 | 内部の詳細（レリーフ） |
| 青/シアン | **詳細と外壁を繋ぐ接続ポリゴン** |

「接続ポリゴン」は、孤立した内部領域を本体に繋ぐブリッジ。
ステンレス化で「あ」の字が作れない問題と同じ構造の解決策。

出典: https://wiki.stadtfabrikanten.org/books/integrated-into-default-importexport-menu/page/openscad-cookie-cutter-file-output

### 他ワークフローの失敗例（設計判断の裏付け）

**Blender ルート** — オフセットを素朴に実装する危険の実例。
- トレースしたパスは太さを持つ2組の頂点列として入り、単一アウトラインが欲しい場合に不都合
- メッシュ変換後「面が交差し頂点が複雑に絡み合う」
- **「壁を厚くしたいが、厚くするとメッシュが交差する」ジレンマ**

→ SPEC 5.4 で Clipper 系ライブラリを使う判断の裏付け。
出典: https://blenderartists.org/t/3d-printing-a-cookie-cutter/664690

**Fusion 360 ルート** — 自動トレースを後回しにする判断の裏付け。
解説記事の著者は **SVG を直接使うことを推奨していない**。
- 複雑なSVGは「数百から数千の小さなスケッチジオメトリピース」を生成する
- 「SVGはFusionの処理能力を著しく低下させる」
- 代わりにネイティブのスケッチツールで**再トレース**することを推奨（壁厚は2mm）

→ SPEC 4章「まず“なぞる”を提供する」の裏付け。
出典: https://productdesignonline.com/tips-and-tricks/how-to-3d-model-a-cookie-cutter-in-fusion-360-for-3d-printing/

### プランジャー機構（再確認）
「枠＋押し込み式スタンプ」のセット生成は Cookiecad / Meshcast / Paramecad で実在。
**バネ内蔵で生地が飛び出す真のプランジャー機構を自動生成するツールは見つからなかった。**
Cookiecad 利用者はケーキポップ型を作る際、Tinkercad で穴とハンドルを手動追加していた。

→ SPEC の「まず持ち手なし平板で試作」という方針を維持。
出典: https://community.cookiecad.com/t/cake-pop-mold-how-to/2588

---

## 4. 確認できなかった項目

| 項目 | 対応 |
|---|---|
| スタンプ凸部の最小幅（クッキー専用） | 1.2mm を暫定値とし、試作で検証 |
| 抜き勾配の角度（クッキー専用） | 5° を暫定値とし、試作で検証 |
| Cookiecad の bladeThickness 真の既定値（0.4 と 0.8 が併存） | 0.6mm を採用 |
| クリアランス 0.9mm の設計根拠 | 実値として採用 |
| プランジャーのガイド機構の設計論 | まず持ち手なし平板で試作 |
| ステンレスの曲げ最小半径・鋭角限界 | 業者へ問い合わせ |
| Cookiecad Premium の現行価格 | 不要 |
