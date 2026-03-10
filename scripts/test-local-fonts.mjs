import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('index.html no depende de Google Fonts en tiempo de ejecución', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')

  assert.doesNotMatch(
    html,
    /fonts\.googleapis\.com|fonts\.gstatic\.com/i,
    'index.html no debe cargar fuentes remotas de Google Fonts',
  )
})
