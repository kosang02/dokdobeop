const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
assert.doesNotMatch(html, /snapped|자동 정렬\(스냅\)/, 'coordinate reader must remain free-moving');
assert.doesNotMatch(html, /id="(?:prot|ruler|tgProt|tgRuler)"/, 'unused protractor and ruler must stay removed');
assert.doesNotMatch(html, /\bglobalThis\b/, 'mobile bootstrap must not require globalThis');
assert.match(html, /class="mapviewport"/, 'map must have a fixed square mobile viewport');
assert.match(html, /mapviewport::before[^}]*padding-top:100%/, 'mobile square must not depend only on aspect-ratio');
assert.match(html, /ZOOM_LEVELS=\[1,1\.5,2,3\]/, 'map and reader must support proportional zoom');
assert.match(html, /typeof mq\.addListener===['"]function['"]/, 'legacy Safari media-query listener fallback must exist');
assert.match(html, /id="mapStatus"/, 'canvas failures must show a visible fallback instead of a blank map');
const match = html.match(/<script>([\s\S]*)<\/script>/);
assert.ok(match, 'inline application script must exist');

function classList(){
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
    toggle(value, force){
      if(force===true){ values.add(value); return true; }
      if(force===false){ values.delete(value); return false; }
      if(values.has(value)){ values.delete(value); return false; }
      values.add(value); return true;
    }
  };
}

const context2d = new Proxy({}, {
  get(target, key){
    if(!(key in target)) target[key] = () => {};
    return target[key];
  },
  set(target, key, value){ target[key] = value; return true; }
});

function element(id=''){
  return {
    id, value:'', textContent:'', innerHTML:'', hidden:false, width:780, height:780,
    offsetLeft:0, offsetTop:0, offsetWidth:156, offsetHeight:156,
    clientWidth:780, clientHeight:780, scrollWidth:780, scrollHeight:780,
    scrollLeft:0, scrollTop:0,
    style:{}, className:'', classList:classList(),
    addEventListener(){}, setPointerCapture(){}, setAttribute(name,value){ this[name]=String(value); },
    getContext(){ return context2d; },
    getBoundingClientRect(){ return {left:0,top:0,width:780,height:780}; },
    querySelector(){ return element(`${id}-child`); }, click(){}
  };
}

const elements = new Map();
const get = id => {
  if(!elements.has(id)) elements.set(id, element(id));
  return elements.get(id);
};
const radios = [element('deg'), element('mil')];
radios[0].value='deg'; radios[1].value='mil';
let checkedUnit='deg';

const document = {
  documentElement:element('root'),
  createElement:tag => element(tag),
  getElementById:get,
  querySelector:selector => selector==='input[name=unit]:checked'
    ? radios.find(r=>r.value===checkedUnit) : element(selector),
  querySelectorAll:selector => selector==='input[name=unit]' ? radios : []
};

const sandbox = {
  console, document, URL, URLSearchParams, Math, Number, String, Array, Object,
  Uint32Array, parseFloat, isNaN, isFinite, setTimeout, clearTimeout, crypto:webcrypto,
  requestAnimationFrame:fn=>{ fn(); return 1; },
  globalThis:null,
  location:{href:'https://example.test/index.html',search:''},
  history:{replaceState(){}},
  getComputedStyle:()=>({getPropertyValue:name=>({
    '--paper':'#fff','--ink':'#111','--muted':'#666','--brown':'#765','--water':'#168'
  }[name]||'#000')}),
  window:{crypto:webcrypto,console,matchMedia:()=>({addEventListener(){}})}
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, {filename:'index.html'});
assert.match(get('scaleSvg').innerHTML, />1:25<\/text>/, '1:25 coordinate grid must be rendered');
assert.equal(get('mapStatus').hidden, true, 'successful bootstrap must uncover the map');
assert.equal(get('mapViewport')['aria-busy'], 'false', 'successful bootstrap must clear busy state');

const evaluate = code => vm.runInContext(code, sandbox);
evaluate('setZoom(1)');
assert.equal(get('frame').style.width, '150%', 'zoom must enlarge the full map frame');
assert.equal(get('frame').style.height, '150%', 'zoom must preserve the square map frame');
assert.equal(get('zoomRead').textContent, '150%');
evaluate('setZoom(0)');
assert.equal(evaluate('Math.round(azDeg({x:10,y:10},{x:10,y:0}))'), 0);
assert.equal(evaluate('Math.round(azDeg({x:10,y:10},{x:20,y:10}))'), 90);
assert.equal(evaluate('Math.round(azDeg({x:10,y:10},{x:10,y:20}))'), 180);
assert.equal(evaluate('Math.round(azDeg({x:10,y:10},{x:0,y:10}))'), 270);

assert.equal(evaluate(`(() => {
  const code=coordOf(210.2,350.7); const point=pointOf(code);
  return coordOf(point.x,point.y)===code;
})()`), true, '8-digit coordinates must round-trip');

assert.equal(evaluate(`(() => {
  const p=inter({from:{x:200,y:600},az:0},{from:{x:600,y:200},az:270});
  return Math.round(p.x)===200&&Math.round(p.y)===200;
})()`), true, 'back-azimuth rays must intersect correctly');

assert.equal(evaluate(`(() => {
  genMap(123456); newQ1(); const first=coordOf(P1.t.x,P1.t.y);
  genMap(123456); newQ1(); return first===coordOf(P1.t.x,P1.t.y);
})()`), true, 'a map number must reproduce its first question');

assert.equal(evaluate(`(() => {
  for(let seed=0;seed<200;seed++){
    genMap(seed); const q=pickResection();
    if(!q.p||q.lms.length!==2||q.lms.some(lm=>!lm)) return false;
  }
  return true;
})()`), true, 'resection generation must survive a range of map numbers');

evaluate('setMode(3)');
get('az1').value='90'; get('az2').value='180';
checkedUnit='mil'; radios[1].onchange();
assert.equal(get('az1').value, 1600);
assert.equal(get('az2').value, 3200);
checkedUnit='deg'; radios[0].onchange();
assert.equal(get('az1').value, 90);
assert.equal(get('az2').value, 180);

console.log('smoke tests: OK');
