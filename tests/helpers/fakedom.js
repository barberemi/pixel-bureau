// Faux DOM minimal pour les tests des fenêtres (47-fenetre.js) : arbre d'éléments, innerHTML analysé (balises, classes,
// attributs, texte), sélecteurs simples (tag, #id, .classe, [attr], [attr="v"], :not(...), :empty, descendant et >),
// focus, inert, hidden, clic qui remonte, écouteurs du document. Pas de mise en page : un élément est « visible »
// (getClientRects non vide) tant que ni lui ni un ancêtre n'est hidden ou en style display:none.
'use strict';

const VOID = new Set(['input', 'br', 'img', 'meta', 'hr', 'link', 'wbr', 'source']);
const FOCUSABLE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/;
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function makeDom() {
  const doc = {activeElement: null, listeners: {}};
  const ctx2d = new Proxy({}, {get: (t, k) => (k in t ? t[k] : () => ({width: 0})), set: (t, k, v) => { t[k] = v; return true; }});

  class Text {
    constructor(t) { this.nodeType = 3; this.text = t; this.parent = null; }
    get textContent() { return this.text; }
  }
  class El {
    constructor(tag) {
      this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this.nodes = []; this.parent = null;
      this.inert = false; this.style = {}; this.listeners = {}; this.value = ''; this.scrollTop = 0; this.offsetHeight = 0;
      const el = this;
      this.dataset = new Proxy({}, {
        get: (_, k) => el.getAttribute('data-' + String(k).replace(/[A-Z]/g, c => '-' + c.toLowerCase())) ?? undefined,
        set: (_, k, v) => { el.setAttribute('data-' + String(k).replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v); return true; },
      });
      this.classList = {
        add: (...c) => { const s = new Set(el.className.split(' ').filter(Boolean)); c.forEach(x => s.add(x)); el.className = [...s].join(' '); },
        remove: (...c) => { el.className = el.className.split(' ').filter(x => x && !c.includes(x)).join(' '); },
        contains: c => el.className.split(' ').includes(c),
        toggle: (c, on) => { if (on === undefined) on = !el.classList.contains(c); on ? el.classList.add(c) : el.classList.remove(c); return on; },
      };
    }
    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = String(v); }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get disabled() { return 'disabled' in this.attrs; }
    set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
    set tabIndex(v) { this.attrs.tabindex = String(v); }
    get tabIndex() { return this.attrs.tabindex != null ? +this.attrs.tabindex : -1; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; }
    removeAttribute(k) { delete this.attrs[k]; }
    get children() { return this.nodes.filter(n => n.nodeType === 1); }
    get firstChild() { return this.nodes[0] || null; }
    get childNodes() { return this.nodes.slice(); }
    get parentElement() { return this.parent; }
    get parentNode() { return this.parent; }
    get isConnected() { let e = this; while (e.parent) e = e.parent; return e === doc.documentElement; }
    get textContent() { return this.nodes.map(n => n.textContent).join(''); }
    set textContent(v) { this.nodes.forEach(n => { n.parent = null; }); this.nodes = []; if (v !== '' && v != null) this._add(new Text(String(v))); }
    set innerHTML(h) { this.nodes.forEach(n => { n.parent = null; }); this.nodes = []; parse(String(h), this); }
    get innerHTML() { return this.textContent; }
    insertAdjacentHTML(where, h) {
      const tmp = new El('div'); parse(String(h), tmp);
      const xs = [...tmp.nodes]; tmp.nodes = [];
      if (where === 'beforeend') xs.forEach(x => this._add(x));
      else if (where === 'afterbegin') this.prepend(...xs);
      else if (where === 'beforebegin') this.before(...xs);
      else throw new Error('insertAdjacentHTML ' + where);
    }
    _add(n, at) { if (n.parent) n.parent.nodes.splice(n.parent.nodes.indexOf(n), 1); n.parent = this; if (at == null) this.nodes.push(n); else this.nodes.splice(at, 0, n); return n; }
    append(...xs) { xs.forEach(x => this._add(typeof x === 'string' ? new Text(x) : x)); }
    appendChild(x) { return this._add(x); }
    prepend(...xs) { xs.reverse().forEach(x => this._add(typeof x === 'string' ? new Text(x) : x, 0)); }
    insertBefore(x, ref) { return this._add(x, ref ? this.nodes.indexOf(ref) : null); }
    before(...xs) { const p = this.parent; xs.forEach(x => p._add(x, p.nodes.indexOf(this))); }
    remove() { if (this.parent) this.parent.nodes.splice(this.parent.nodes.indexOf(this), 1); this.parent = null; }
    contains(x) { for (; x; x = x.parent) if (x === this) return true; return false; }
    closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parent) if (e.matches(sel)) return e; return null; }
    matches(sel) { return splitGroups(sel).some(g => matchChain(this, parseChain(g))); }
    querySelectorAll(sel) {
      const out = [], walk = e => { for (const k of e.children) { if (k.matches(sel)) out.push(k); walk(k); } };
      walk(this); return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    get shown() { for (let e = this; e && e.nodeType === 1; e = e.parent) if (e.hidden || e.style.display === 'none') return false; return true; }
    getClientRects() { return this.shown ? [{}] : []; }
    getBoundingClientRect() { return {left: 0, top: 0, width: +(this.width || this.attrs.width || 100), height: +(this.height || this.attrs.height || 100)}; } // à l'échelle 1 de son dessin
    focus() {
      const ok = this.isConnected && this.shown && !this.disabled && (FOCUSABLE.test(this.tagName) || this.hasAttribute('tabindex'));
      let inert = false; for (let e = this; e; e = e.parent) if (e.inert) inert = true;
      if (ok && !inert) doc.activeElement = this;
    }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    removeEventListener(t, f) { const l = this.listeners[t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      for (let e = this; e && !ev._stop; e = e.parent) {
        ev.currentTarget = e;
        for (const f of [...(e.listeners[ev.type] || [])]) f.call(e, ev);
        if (ev.type === 'click' && typeof e.onclick === 'function' && e.listeners) e.onclick(ev);
        if (e === doc.body) break;
      }
      return !ev.defaultPrevented;
    }
    click() { if (!this.disabled) this.dispatchEvent(event('click')); }
    getContext() { return ctx2d; }
  }
  const event = (type, o = {}) => ({type, defaultPrevented: false, _stop: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; }, stopImmediatePropagation() { this._stop = true; }, ...o});

  function parse(h, root) {
    const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|[^<]+|</g;
    let cur = root, m;
    while ((m = re.exec(h))) {
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) { for (let e = cur; e && e !== root.parent; e = e.parent) if (e.tagName === m[1].toUpperCase()) { cur = e.parent || root; break; } if (!root.contains(cur)) cur = root; continue; }
      if (m[2]) {
        const el = new El(m[2]);
        for (const a of (m[3] || '').matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
        if ('value' in el.attrs) el.value = el.attrs.value;
        cur._add(el);
        if (!VOID.has(m[2].toLowerCase())) cur = el;
        continue;
      }
      cur._add(new Text(decode(m[0])));
    }
  }
  function splitGroups(sel) { const out = []; let d = 0, s = ''; for (const c of sel) { if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && !d) { out.push(s); s = ''; } else s += c; } out.push(s); return out.map(x => x.trim()).filter(Boolean); }
  // « a b>c » -> [{sel:'a'}, {comb:' ', sel:'b'}, {comb:'>', sel:'c'}]
  function parseChain(g) {
    const parts = []; let s = '', d = 0, comb = null;
    const push = () => { if (s) { parts.push({comb, sel: s}); s = ''; comb = null; } };
    for (const c of g) {
      if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--;
      if (!d && (c === ' ' || c === '>')) { push(); if (c === '>') comb = '>'; else if (!comb && parts.length) comb = ' '; continue; }
      s += c;
    }
    push(); return parts;
  }
  function matchChain(el, chain) {
    const last = chain[chain.length - 1];
    if (!matchCompound(el, last.sel)) return false;
    if (chain.length === 1) return true;
    const rest = chain.slice(0, -1);
    if (last.comb === '>') return !!el.parent && el.parent.nodeType === 1 && el.parent !== doc.body.parent && matchChain(el.parent, rest);
    for (let p = el.parent; p && p.nodeType === 1; p = p.parent) if (matchChain(p, rest)) return true;
    return false;
  }
  function matchCompound(el, s) {
    const re = /^(\*|[a-zA-Z0-9]+)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|:not\(([^)]*\)?)\)|:empty|:scope/g;
    let m, i = 0;
    while ((m = re.exec(s))) {
      if (m.index !== i) throw new Error('sélecteur non géré : ' + s);
      i = re.lastIndex;
      if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false;
      if (m[2] && el.id !== m[2]) return false;
      if (m[3] && !el.className.split(' ').includes(m[3])) return false;
      if (m[4] && (!(m[4] in el.attrs) || (m[5] != null && el.attrs[m[4]] !== m[5]))) return false;
      if (m[6] != null && matchCompound(el, m[6])) return false;
      if (m[0] === ':empty' && el.nodes.length) return false;
    }
    if (i !== s.length) throw new Error('sélecteur non géré : ' + s);
    return true;
  }

  doc.body = new El('body');
  const html = new El('html'); html._add(doc.body);
  doc.documentElement = html;
  doc.createElement = t => new El(t);
  doc.querySelector = s => doc.body.querySelector(s);
  doc.querySelectorAll = s => doc.body.querySelectorAll(s);
  doc.getElementById = id => doc.body.querySelector('#' + id);
  doc.addEventListener = (t, f) => { (doc.listeners[t] = doc.listeners[t] || []).push(f); };
  doc.removeEventListener = (t, f) => { const l = doc.listeners[t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  doc.activeElement = doc.body;
  // une touche au document (écouteurs du document seulement : ceux de window sont des bouchons dans tests/helpers/page.js)
  doc.key = (key, o = {}) => { const ev = event('keydown', {key, ...o}); for (const f of [...(doc.listeners.keydown || [])]) { if (ev._stop) break; f(ev); } return ev; };
  return {doc, El, event};
}

// la page type : un .wrap (bouton qui a le focus avant l'ouverture, plan #cv), un panneau .side à côté
function pageDom() {
  const {doc, El, event} = makeDom();
  const wrap = doc.createElement('div'); wrap.className = 'wrap';
  const btn = doc.createElement('button'); btn.textContent = 'Ouvrir'; wrap.append(btn);
  const cv = doc.createElement('canvas'); cv.id = 'cv'; wrap.append(cv);
  const side = doc.createElement('div'); side.className = 'side'; side.id = 'side';
  doc.body.append(wrap, side);
  return {doc, El, event, wrap, btn, cv, side};
}

// remplace document (et navigator, au besoin) du contexte de la page le temps de f
function withDom(page, f, dom = pageDom()) {
  const real = page.ctx.document;
  page.ctx.document = dom.doc;
  try { return f(dom); } finally { page.ctx.document = real; }
}

module.exports = {makeDom, pageDom, withDom};
