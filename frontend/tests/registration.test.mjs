import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBusinessNumber, validBusinessNumber, validNewPassword } from '../src/registration-validation.ts'
test('business number normalizes hyphens and whitespace into ten digits', () => {
  assert.equal(normalizeBusinessNumber(' 123 - 45 - 67890 '), '1234567890')
  assert.equal(validBusinessNumber('123 45 67890'), true)
  assert.equal(validBusinessNumber('123456789'), false)
  assert.equal(validBusinessNumber('123456789a'), false)
})
for (const [value, expected] of [['lowercase123!',true],['Uppercase123!',true],['lowercaseonly!',false],['lowercase12345',false],['UPPERCASE123!',false],['short12!',false]])
  test(`registration password requirements: ${value}`, () => assert.equal(validNewPassword(value), expected))
