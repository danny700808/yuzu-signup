'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {sortProgramSection_:sort, resolveNearbyRequests_:resolve} = require('../backend/scheduling');
function entry(name, at, extra) {
  return Object.assign({name, performerDisplay:name, createdAt:at, rowIndex:at, id:name, matchKeys:[name], type:'鋼琴'}, extra);
}
function names(list) { return list.map(it=>it.name); }
function distance(list,a,b) { return Math.abs(names(list).indexOf(a)-names(list).indexOf(b)); }
test('all matching requests, including late requests, receive a nearby position',()=>{
  const list=Array.from({length:25},(_,i)=>entry('P'+i,i));
  list[1].preferredWith='P9'; list[2].preferredWith='P10'; list[24].preferredWith='P4';
  const result=sort(list);
  for(const [a,b] of [['P1','P9'],['P2','P10'],['P24','P4']]) assert.ok(distance(result,a,b)<=3);
  assert.equal(new Set(names(result)).size,list.length);
  assert.deepEqual(names(sort(list)),names(result));
  assert.equal(list[0].scheduleWarnings,undefined);
});
test('multiple names and reciprocal triangle requests do not overwrite each other',()=>{
  const list=Array.from({length:12},(_,i)=>entry('P'+i,i));
  list[0].preferredWith='P5、P9'; list[5].preferredWith='P0、P9'; list[9].preferredWith='P5';
  const result=sort(list);
  for(const [a,b] of [['P0','P5'],['P0','P9'],['P5','P9']]) assert.ok(distance(result,a,b)<=3);
});
test('full group display resolves before splitting; duplicate members yield one target',()=>{
  const group=entry('Band\nAmy\nBob',2,{groupName:'Band',performerNames:['Amy','Bob']});
  assert.equal(resolve([entry('A',1,{preferredWith:'Band／Amy／Bob'}),group]).links.length,1);
  assert.equal(resolve([entry('A',1,{preferredWith:'Amy、Bob'}),group]).links.length,1);
});
test('unmatched notes and ambiguous names are flagged without guessing',()=>{
  const result=sort([entry('A',1,{preferredWith:'8:00左右、Sam'}),entry('B',2,{performerNames:['Sam']}),entry('C',3,{performerNames:['Sam']})]);
  const a=result.find(x=>x.name==='A');
  assert.equal(a.nearbyAssignments.length,0);
  assert.equal(a.scheduleWarnings.length,2);
});
test('first ten requests win oversubscription in registration order',()=>{
  const list=Array.from({length:22},(_,i)=>entry('P'+i,i,{front:i<12,type:i%2?'鼓':'鋼琴'}));
  const result=sort(list);
  assert.deepEqual(new Set(names(result.slice(0,10))),new Set(names(list.slice(0,10))));
  for(const it of result.filter(x=>x.front && Number(x.name.slice(1))>=10)) assert.match(it.scheduleWarnings.join(''),/超過 10/);
});
test('nearby requests take priority while compatible front and back requests survive',()=>{
  const list=Array.from({length:24},(_,i)=>entry('P'+i,i,{front:i===0,back:i===23,type:String(i%3)}));
  list[0].preferredWith='P23';
  const result=sort(list);
  assert.ok(distance(result,'P0','P23')<=3);
  assert.ok(names(result).indexOf('P0')<10);
  assert.ok(result.find(x=>x.name==='P23').scheduleWarnings.length);
});
test('final positions handle moves from both sides and short sessions',()=>{
  for (const n of [2,3,4,8]) {
    const list=Array.from({length:n},(_,i)=>entry('P'+i,i,{front:true,back:false}));
    list[n-1].preferredWith='P0';
    const result=sort(list);
    assert.ok(distance(result,'P0','P'+(n-1))<=3);
    if(n>=4) assert.equal(distance(result,'P0','P'+(n-1)),3);
    assert.ok(result.every(x=>!x.scheduleWarnings.length));
  }
});
test('empty and no-preference sessions retain all entries',()=>{
  assert.deepEqual(sort([]),[]);
  const list=Array.from({length:10},(_,i)=>entry('P'+i,i,{type:String(i%2)}));
  assert.deepEqual(names(sort(list)),names(list));
});
test('explicit ordinal range notes remain satisfied alongside nearby requests',()=>{
  const list=Array.from({length:12},(_,i)=>entry('P'+i,i,{front:i<7}));
  list[0].preferredWith='可以的話，希望第4組～第7組之間，謝謝您！';
  list[1].preferredWith='P0';
  const result=sort(list), pos=names(result).indexOf('P0')+1;
  assert.ok(pos>=4 && pos<=7);
  assert.ok(distance(result,'P0','P1')<=3);
  assert.equal(result.find(x=>x.name==='P0').scheduleWarnings.length,0);
});
