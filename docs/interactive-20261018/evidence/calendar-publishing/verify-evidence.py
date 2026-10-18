"""Validate captured downloads and intercepted delivery journal, not live credentials."""
import csv
import io
import json
from pathlib import Path

folder = Path(__file__).parent
raw = (folder / 'calendar-filtered.csv').read_bytes()
assert raw.startswith(b'\xef\xbb\xbf'), 'CSV must retain UTF-8 BOM'
rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
assert len(rows) == 1, 'CSV must contain only matching visible-period piece'
row = rows[0]
assert row['Título'] == "'=30X, \"IA práctica\"", 'Formula-like title must be quoted safely'
assert (row['Fecha'], row['Hora'], row['Zona horaria']) == ('2026-10-21', '16:45', 'UTC')
assert row['Audiencia'] == 'Ventas EdTech'
assert row['Guion'] == 'Paso 1: documenta el proceso.\nPaso 2: revisa con el equipo. "Ejemplo", sintético.'
assert row['Caption'] == 'Contenido de QA, no publicado.\nSegunda línea.'
assert 'próximo mes' not in raw.decode('utf-8-sig'), 'Adjacent month must stay out of visible month export'
markdown = (folder / 'piece-export.md').read_text()
assert markdown.startswith('# =30X, "IA práctica"\n\nPost · linkedin')
for expected in ['## Gancho', '## Guion', '## Caption', '## Llamado a la acción', 'Fuente: Idea propia', row['Guion'], row['Caption']]:
    assert expected in markdown, f'Markdown missing {expected}'
journal = [json.loads(line) for line in (folder / 'provider-journal.jsonl').read_text().splitlines()]
assert len(journal) == 3, 'Only explicit reject, retry-success, and uncertain requests may contact provider'
assert [entry['mode'] for entry in journal] == ['reject', 'success', 'uncertain']
assert journal[0]['pieceId'] == journal[1]['pieceId']
assert journal[0]['idempotencyKey'] == journal[1]['idempotencyKey'], 'Explicit retry must keep idempotency key'
assert journal[2]['pieceId'] != journal[1]['pieceId']
print('PASS: CSV scope/date/quoting/multiline/formula safety; Markdown content; exactly three explicit transport attempts and stable retry key')
