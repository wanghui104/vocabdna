import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, setWordMark, wordMarks, mergeMarkEvents, masteryEvidence, samplingWeights, readState, createQuestionBank } from '../lib/study-engine.mjs';
const now = Date.parse('2026-10-13T12:00:00Z');
const event = (id, days, outcome) => ({ id, wordId: 'word', outcome, answeredAt: new Date(now - days * 86400000).toISOString() });
test('evidence decays chronologically, clamps after errors, and counts each event once', () => {
  const events = [event('a',365,'correct'),event('b',200,'wrong'),event('c',100,'correct'),event('d',50,'correct')];
  const expected = Math.pow(.8,100/365) + Math.pow(.8,50/365);
  assert.ok(Math.abs(masteryEvidence([...events.reverse(),events[0]],now).get('word')-expected)<1e-12);
  assert.equal(masteryEvidence([event('a',0,'correct'),event('b',0,'uncertain')],now).get('word'),0);
  assert.equal(masteryEvidence([event('a',0,'correct'),event('b',0,'wrong')],now).get('word'),0);
});
test('independent marks, timestamped cancellation, backups and default migration', () => {
  let state = emptyState();
  state = setWordMark(state,'word','important',true,'2026-10-10T00:00:00Z');
  state = setWordMark(state,'word','mastered',true,'2026-10-11T00:00:00Z');
  const stale = state.markEvents;
  state = setWordMark(state,'word','mastered',false,'2026-10-12T00:00:00Z');
  assert.deepEqual(wordMarks(mergeMarkEvents(state.markEvents,stale)).get('word'),{important:true,mastered:false});
  assert.deepEqual(readState({getItem:()=>JSON.stringify(state)}),state);
  assert.deepEqual(readState({getItem:()=>JSON.stringify({version:1,events:[],session:null})}).markEvents,[]);
  assert.throws(()=>mergeMarkEvents(stale,[{...stale[0],value:false}]));
});
test('only mastered flag affects weight; zero history, floor and cancellation work', () => {
  let state = setWordMark(emptyState(),'word','important',true);
  state.events = [event('a',0,'correct')];
  assert.equal(samplingWeights(state,now).get('word'),1);
  state = setWordMark(state,'word','mastered',true);
  assert.equal(samplingWeights(state,now).get('word'),.6);
  state.events=[]; assert.equal(samplingWeights(state,now).get('word'),1);
  state.events = Array.from({length:20},(_,i)=>event(String(i),0,'correct'));
  assert.equal(samplingWeights(state,now).get('word'),.1);
  state = setWordMark(state,'word','mastered',false);
  assert.equal(samplingWeights(state,now).get('word'),1);
});
test('weighted rounds remain unique and lower the mastered first-pick frequency', () => {
  const catalog = Array.from({length:8},(_,i)=>({id:String(i),word:'word'+i,allZh:['猫','狗','鱼','鸟','树','云','山','水'][i],senses:[{id:String(i),pos:'noun',zh:['猫','狗','鱼','鸟','树','云','山','水'][i]}],related:[],roots:[],otherRoots:[]}));
  let seed=1729; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const bank=createQuestionBank(catalog,[],random);
  const state=setWordMark(emptyState(),'0','mastered',true);
  state.events=Array.from({length:20},(_,i)=>({...event(String(i),0,'correct'),wordId:'0'}));
  let hits=0;
  for(let i=0;i<1200;i++) if(bank.start(1,'en-zh',state,now).questions[0].wordId==='0') hits++;
  assert.ok(hits<45,`mastered first picks ${hits}`);
  const round=bank.start(8,'zh-en',state,now);
  assert.equal(new Set(round.questions.map(q=>q.wordId)).size,8);
});
