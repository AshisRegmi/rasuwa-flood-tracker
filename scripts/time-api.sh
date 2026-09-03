#!/bin/bash
# Time the GoN person-reports endpoint at various page sizes.
for lim in 10 20 25; do
  t0=$(date +%s)
  curl -s --max-time 45 "https://rescue.opmcm.gov.np/api/person-reports/?page=1&limit=$lim" -o "$LOCALAPPDATA/Temp/p$lim.bin" -w '%{size_download}' > "$LOCALAPPDATA/Temp/size$lim.txt" 2>/dev/null
  t1=$(date +%s)
  sz=$(cat "$LOCALAPPDATA/Temp/size$lim.txt")
  python -c "
import json
try:
    d=json.load(open(r'$LOCALAPPDATA/Temp/p$lim.bin', encoding='utf-8'))
    ok='valid items=%d total=%s' % (len(d['data']['items']), d['data']['total'])
except Exception:
    ok='TRUNCATED'
print('limit=$lim size=${sz}B time=$((t1-t0))s', ok)
"
done