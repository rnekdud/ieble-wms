import test from 'node:test'
import assert from 'node:assert/strict'
import { iosApiBaseUrl, iosApiUrl } from '../src/ios-api-url.ts'

test('iOS keeps API paths, query, relative URLs and packaged assets separate', () => {
  const origin='capacitor://localhost/app/products',api='https://qa.example.test'
  for(const path of ['/api/auth/csrf','/api/products/image?version=2']) assert.equal(iosApiUrl(path,origin,api),api+path)
  assert.equal(iosApiUrl('capacitor://localhost/api/auth/me',origin,api),api+'/api/auth/me')
  for(const url of ['/assets/logo.svg','capacitor://other/api/data','https://other.example/api/data','https://localhost/api/data']) assert.equal(iosApiUrl(url,origin,api),url)
})
test('iPhone rejects loopback; release rejects HTTP; debug exceptions limited to local hosts', () => {
  assert.equal(iosApiBaseUrl('http://localhost:5080'),'http://localhost:5080')
  assert.equal(iosApiBaseUrl('http://test-mac.local:5080',{device:true}),'http://test-mac.local:5080')
  assert.equal(iosApiBaseUrl('https://qa.example.test',{device:true,release:true}),'https://qa.example.test')
  for(const url of ['http://localhost:5080','https://127.0.0.1','http://[::1]:5080']) assert.throws(()=>iosApiBaseUrl(url,{device:true}))
  for(const url of ['http://localhost:5080','http://test-mac.local:5080']) assert.throws(()=>iosApiBaseUrl(url,{release:true}))
  for(const url of ['http://192.168.0.10:5080','http://public.example','ftp://localhost','https://user:password@qa.example','https://qa.example/api','https://qa.example?token=x','https://qa.example#x']) assert.throws(()=>iosApiBaseUrl(url))
})
