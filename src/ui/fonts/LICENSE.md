# Bundled fonts

Both families are licensed under the SIL Open Font License 1.1, which permits
bundling and redistribution inside a game, including commercially.

| Family | Designer | Licence |
| --- | --- | --- |
| Barlow Condensed | Jeremy Tribby | [OFL 1.1](https://openfontlicense.org/) |
| Roboto Mono | Christian Robertson | [OFL 1.1](https://openfontlicense.org/) |

The files here are subsets: Basic Latin, Latin-1 Supplement and the handful of
punctuation marks the UI actually uses, with `kern`, `liga` and `tnum` retained.
That takes the five faces from 413 KB of TTF to 88 KB of WOFF2.

Regenerate with:

```bash
pyftsubset FONT.ttf --output-file=FONT.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+00D7,U+2192,U+00B7" \
  --layout-features="kern,liga,tnum" --desubroutinize
```
