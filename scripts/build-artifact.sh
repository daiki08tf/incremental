#!/usr/bin/env bash
# index.html / style.css / src/*.js から、アーティファクト公開用の
# 自己完結した単一HTML(artifact/game.html)を生成する。
#
# Artifact環境では外部ファイル(<link href> / <script src>)が読み込まれないため、
# CSSとJSをすべてインラインで埋め込む。ゲーム本体を修正したら必ず再生成すること。
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=artifact/game.html
mkdir -p artifact

# index.html の <script src=...> の並び順をそのまま使う(読み込み順が重要なため)
mapfile -t SCRIPTS < <(grep -o 'src="src/[^"]*"' index.html | sed 's/src="//; s/"$//')

{
  echo '<title>漂流コロニー</title>'
  echo '<style>'
  cat style.css
  echo '</style>'
  echo ''
  # <body> の直後から、最初の <script src> の手前までを本文として抜き出す
  awk '/<body>/{flag=1; next} /<script src=/{flag=0} flag' index.html | sed 's/^  //'
  echo '<script>'
  for f in "${SCRIPTS[@]}"; do
    echo "/* ---- $f ---- */"
    cat "$f"
    echo ''
  done
  echo '</script>'
} > "$OUT"

echo "generated $OUT ($(wc -c < "$OUT") bytes, ${#SCRIPTS[@]} scripts)"
