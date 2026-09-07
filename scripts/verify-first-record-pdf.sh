#!/usr/bin/env bash
set -Eeuo pipefail
export RECORDS_PDF_ARTIFACT_DIR="${RECORDS_PDF_ARTIFACT_DIR:-$PWD/output/pdf/first-record}"
command -v pdftotext >/dev/null || { echo 'pdftotext (Poppler) is required.' >&2; exit 1; }
npx vitest run tests/first-record-pdf.test.ts
for name in first-record-fictional long-record-fictional; do
  pdftotext -layout "$RECORDS_PDF_ARTIFACT_DIR/$name.pdf" "$RECORDS_PDF_ARTIFACT_DIR/$name.txt"
done
python3 - <<'PY'
from pathlib import Path
import os
root=Path(os.environ['RECORDS_PDF_ARTIFACT_DIR'])
short=(root/'first-record-fictional.txt').read_text()
long=(root/'long-record-fictional.txt').read_text()
for text in (short,long):
    flat=' '.join(text.split())
    assert 'Parent B arrived at 6:00 p.m., on time. The blue backpack was handed over.' in flat
    assert 'Recorded issue' not in text
    assert 'UNRELATED PRIVATE TEXT' not in text and 'fictional@example.test' not in text
    assert 'Attention: Neutral' in flat
    assert any('Timeline Section Packet' in page and 'Notes: FICTIONAL EXAMPLE.' in page for page in text.split('\f'))
assert long.count('END OF FICTIONAL LONG NOTE.') == 2
assert 'continued' in long
print('Verified PDF contents, account filtering, neutral labels, heading placement, and long-note continuation.')
PY
