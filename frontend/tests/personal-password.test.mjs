import test from 'node:test'
import assert from 'node:assert/strict'
import { validPersonalPassword } from '../src/personal-password.ts'

for (const [password, current, allowed] of [
  ['initial_staff123', 'initial_staff123', false],
  ['INITIAL_staff123', 'initial_staff123', false],
  ['initial_staff123', 'personalpass123!', false],
  ['personalpass123!', 'personalpass123!', false],
  ['newpersonal123!', 'initial_staff123', true],
  ['newpersonalonly!', 'initial_staff123', false],
  ['NEWPERSONAL123!', 'initial_staff123', false],
  ['short12!', 'initial_staff123', true],
  ['short123', 'initial_staff123', false],
  ['short!!!', 'initial_staff123', false],
  ['short1!', 'initial_staff123', false],
]) {
  test(`personal password policy rejects initial/current credentials and preserves complexity: ${password}/${current}`, () => {
    assert.equal(validPersonalPassword(password, 'initial_staff123', current), allowed)
  })
}
