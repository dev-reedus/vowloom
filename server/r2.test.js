import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __test } from './r2.js'

test('canonicalQuery sorts encoded SigV4 query params by byte order', () => {
  const params = new URLSearchParams({
    'list-type': '2',
    'max-keys': '1',
    'X-Amz-Date': '20260709T221409Z',
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
  })

  assert.equal(
    __test.canonicalQuery(params),
    'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260709T221409Z&list-type=2&max-keys=1',
  )
})

test('parseListObjectsXml reads keys, sizes, and continuation token', () => {
  const parsed = __test.parseListObjectsXml(`
    <ListBucketResult>
      <IsTruncated>true</IsTruncated>
      <Contents>
        <Key>originals/first&amp;second.jpg</Key>
        <LastModified>2026-07-08T10:00:00.000Z</LastModified>
        <Size>12345</Size>
      </Contents>
      <Contents>
        <Key>originals/nested/photo.jpg</Key>
        <Size>67890</Size>
      </Contents>
      <NextContinuationToken>abc&amp;123</NextContinuationToken>
    </ListBucketResult>
  `)

  assert.equal(parsed.is_truncated, true)
  assert.equal(parsed.next_continuation_token, 'abc&123')
  assert.deepEqual(parsed.objects, [
    { key: 'originals/first&second.jpg', size: 12345, last_modified: '2026-07-08T10:00:00.000Z' },
    { key: 'originals/nested/photo.jpg', size: 67890, last_modified: null },
  ])
})
