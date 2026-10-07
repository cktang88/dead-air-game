#!/usr/bin/env sh
# Copies only the files the browser loads into dist/ for static hosting.
set -eu
rm -rf dist && mkdir -p dist
cp index.html style.css CREDITS.md dist/
cp -R assets dist/
for f in *.js; do
  case "$f" in *.test.js) ;; *) cp "$f" dist/ ;; esac
done
