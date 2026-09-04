// OGP 画像の唯一の出典。
//
// Next の Metadata は layout と page を deep-merge しない。page 側で openGraph を
// 定義した瞬間に layout の images は丸ごと落ちるので、ページを足すたびに画像の
// 指定を書き写すことになる。書き写しを1箇所に閉じ込めるためのモジュール。
// URL は metadataBase（= SITE_URL）起点の相対で書く＝配信先が変わっても追従する。
export const OG_IMAGE = {
  url: "og.png",
  width: 1200,
  height: 630,
  alt: "畑めぐり — 区画ごとに連作をひと目で判定する家庭菜園の輪作プランナー",
};
