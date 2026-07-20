import assert from 'node:assert/strict'
import test from 'node:test'

import en from './i18n/en.js'
import it from './i18n/it.js'
import ro from './i18n/ro.js'

test('all translation dictionaries expose the same keys', () => {
  const expectedKeys = Object.keys(it).sort()

  assert.deepEqual(Object.keys(en).sort(), expectedKeys)
  assert.deepEqual(Object.keys(ro).sort(), expectedKeys)
})
