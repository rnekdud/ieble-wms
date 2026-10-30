import test from 'node:test'
import assert from 'node:assert/strict'
import { paginationState } from '../src/pagination.ts'

test('five-number groups follow the selected page, including a partial final group', () => {
  for (const [page, expected] of [[1, [1, 2, 3, 4, 5]], [5, [1, 2, 3, 4, 5]], [6, [6, 7, 8, 9, 10]], [10, [6, 7, 8, 9, 10]], [11, [11, 12]], [12, [11, 12]]]) {
    assert.deepEqual(paginationState(page, 231, 20).pages, expected)
  }
})

test('one through five pages show only existing numbers', () => {
  for (let count = 1; count <= 5; count++) {
    const state = paginationState(count, count * 20 - 1, 20)
    assert.equal(state.pageCount, count)
    assert.deepEqual(state.pages, Array.from({ length: count }, (_, i) => i + 1))
  }
})

test('range uses actual total, including a partial last page and empty results', () => {
  assert.deepEqual(paginationState(7, 123, 20), { page: 7, pageCount: 7, total: 123, start: 121, end: 123, pages: [6, 7] })
  assert.deepEqual(paginationState(7, 0, 20), { page: 1, pageCount: 1, total: 0, start: 0, end: 0, pages: [1] })
})

test('deleting the last row or changing page size clamps to the new last page', () => {
  assert.equal(paginationState(7, 121, 20).page, 7)
  assert.equal(paginationState(7, 120, 20).page, 6)
  assert.equal(paginationState(7, 121, 50).page, 3)
  assert.equal(paginationState(1, 121, 50).page, 1)
})

test('invalid bounds cannot create invalid pages or unbounded number lists', () => {
  for (const input of [[0, -1, 0], [NaN, NaN, NaN], [Infinity, Infinity, Infinity], [-3, 40, 20]]) {
    const state = paginationState(...input)
    assert.equal(state.page, 1)
    assert.ok(state.pages.length >= 1 && state.pages.length <= 5)
    assert.ok(state.start >= 0 && state.end <= state.total)
  }
  assert.equal(paginationState(2.9, 100, 20).page, 2)
})
