#!/bin/sh
# I due font del banco. Non stanno nella repo: sono di Google Fonts, si
# prendono da lì. Cormorant Light sta al posto di PP Editorial New Ultralight,
# che è commerciale e non si può ridistribuire — per il tracciamento non
# cambia niente, è un didone anche lui.
set -e
mkdir -p font
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
css=$(curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400&family=Cormorant:wght@300&display=block")
echo "$css" | grep -oE 'https://fonts.gstatic.com/s/bodonimoda/[^)]+' | head -1 | xargs -I{} curl -sS -o font/bodoni.woff2 "{}"
echo "$css" | grep -oE 'https://fonts.gstatic.com/s/cormorant/[^)]+'  | head -1 | xargs -I{} curl -sS -o font/cormorant.woff2 "{}"
ls -l font
