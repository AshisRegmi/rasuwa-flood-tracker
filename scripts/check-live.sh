#!/bin/bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$LOCALAPPDATA/Temp/live-dom.html"
"$EDGE" --headless=new --disable-gpu --window-size=780,1688 --virtual-time-budget=20000 --dump-dom "https://ashisregmi.github.io/rasuwa-flood-tracker/" > "$OUT" 2>/dev/null
echo "dom size: $(wc -c < "$OUT") bytes"
echo "cards rendered: $(grep -o 'class="card"' "$OUT" | wc -l)"
echo "stat numbers:"
grep -oE 'id="stat-(lost|found|dead)"[^>]*>[^<]*' "$OUT"
echo "sync label:"
grep -oE 'id="sync-label">[^<]*' "$OUT" | head -1
echo "load-more button visible?"
grep -oE 'id="people-more"[^>]*' "$OUT" | head -1
