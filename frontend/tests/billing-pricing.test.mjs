import assert from 'node:assert/strict'
import test from 'node:test'
import {billingPreviewPolicy as policy, pricingEstimate, eventEndTime} from '../src/billing-pricing.ts'
test('shared prices: monthly, annual, event without double discount',()=>{
 assert.equal(policy.monthlyPerUserKrw,5000);assert.equal(policy.annualDiscountPercent,20)
 const e=pricingEstimate(10);assert.equal(e.monthlyTotal,20000);assert.equal(e.annualTotal,240000);assert.equal(e.annualMonthly,4000)
 const n=pricingEstimate(10,{...policy,eventEnabled:false});assert.equal(n.monthlyTotal,50000);assert.equal(n.annualTotal,480000)
 for(const users of [0,1,3,100])assert.equal(pricingEstimate(users).annualTotal,users*24000)
})
test('Korea end date inclusive, server clock required, historic data not involved',()=>{
 const p={...policy,eventEndsOn:'2026-11-20'},end=Date.parse('2026-11-20T15:00:00Z')
 assert.equal(eventEndTime(p),end)
 assert.equal(pricingEstimate(10,p,end-1).eventActive,true)
 assert.equal(pricingEstimate(10,p,end).eventActive,false)
 assert.equal(pricingEstimate(10,p,end).annualTotal,480000)
 assert.equal(pricingEstimate(10,p,null).known,false)
 assert.equal(pricingEstimate(10,p,NaN).known,false)
 assert.equal(pricingEstimate(10,{...p,eventEnabled:false}).known,true)
 assert.equal(pricingEstimate(10).known,true)
 assert.equal(eventEndTime(policy),null)
})
