'use strict';
// Kalima core: shared by the teacher app (index.html) and the student player (play.html).
// Data lives in a local store for now; DB is the only place that will change when Supabase is connected.
(function () {
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('kl2:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kl2:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('kl2:' + k); } catch (e) {} }
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scriptOf = s => /[؀-ۿ]/.test(s || '') ? 'ar' : /[֐-׿]/.test(s || '') ? 'he' : 'en';
  const dirOf = s => scriptOf(s) === 'en' ? 'ltr' : 'rtl';
  const norm = x => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[ً-ْ֑-ׇ]/g, '');

  // ---------- templates ----------
  const KINDS = {
    practice: { name: 'تمرين', soft: '#E4F5EE', ink: '#0B7A52', door: 'تمرّن' },
    test: { name: 'اختبار', soft: '#E6EEFC', ink: '#2557BF', door: 'اختبار' },
    play: { name: 'لعبة', soft: '#FDEEE3', ink: '#B24F0E', door: 'العب' },
    print: { name: 'طباعة', soft: '#F3EAFB', ink: '#7A3BB8', door: 'طباعة' }
  };
  // needs: 'pairs' = item front + back; 'questions' = question + right answer + up to 3 wrong answers
  const TEMPLATES = [
    { id: 'mcq', kind: 'practice', name: 'اختيار من 4', desc: 'سؤال وأربعة أجوبة، مع صور في السؤال أو الأجوبة.', needs: 'questions' },
    { id: 'quiz', kind: 'test', name: 'اختبار بعلامة', desc: 'اختيار من 4 بمحاولة واحدة لكل سؤال، والعلامة تصل إلى المعلم.', needs: 'questions', test: true },
    { id: 'match', kind: 'practice', name: 'مطابقة', desc: 'يصل الطالب كل عنصر بما يناسبه.', needs: 'pairs' },
    { id: 'flash', kind: 'practice', name: 'بطاقات تعليمية', desc: 'وجه وظهر مع صوت، والطالب يقول: عرفتها أو لم أعرفها.', needs: 'pairs' },
    { id: 'tf', kind: 'practice', name: 'صح أو خطأ', desc: 'هل هذا الجواب صحيح؟ يحكم الطالب على كل زوج.', needs: 'pairs' },
    { id: 'spell', kind: 'practice', name: 'رتّب الحروف', desc: 'يكوّن الطالب الجواب من حروفه.', needs: 'pairs' },
    { id: 'order', kind: 'practice', name: 'رتّب الجملة', desc: 'يرتّب الطالب كلمات الجملة بالترتيب الصحيح.', needs: 'sentences' },
    { id: 'type', kind: 'practice', name: 'اكتب الجواب', desc: 'يكتب الطالب الجواب بنفسه.', needs: 'pairs' },
    { id: 'snake', kind: 'play', name: 'الأفعى', desc: 'السؤال في الأعلى، والأفعى تأكل الجواب الصحيح وتكبر.', needs: 'pairs' },
    { id: 'cross', kind: 'play', name: 'كلمات متقاطعة', desc: 'لكل كلمة صورة أو تلميح، والطالب يملأ الشبكة.', needs: 'pairs' },
    { id: 'pop', kind: 'play', name: 'فقاعات الكلمات', desc: 'السؤال في الأعلى، والطالب يقذف الكرة ليُسقط فقاعات الكلمة الصحيحة.', needs: 'pairs' },
    { id: 'wall', kind: 'play', name: 'هدم المبنى', desc: 'تُقرأ الكلمة، والطالب يجد طوبتها: الكلمة نفسها أو معناها أو صورتها، والكرة تهدمها.', needs: 'pairs' },
    { id: 'bus', kind: 'play', name: 'باص الكلمات', desc: 'أخرج الحافلة التي عليها الجواب.', needs: 'pairs', game: 'bus.html' },
    { id: 'kicks', kind: 'play', name: 'ركلات الكلمات', desc: 'سدّد نحو الجواب الصحيح من أربعة.', needs: 'pairs', game: 'kicks.html' },
    { id: 'race', kind: 'play', name: 'سباق الكلمات', desc: 'قُد المركبة عبر بوابة الجواب.', needs: 'pairs', game: 'race.html' },
    { id: 'pcards', kind: 'print', name: 'بطاقات للطباعة', desc: 'صورة وكلمة، حرف وصورة، مطابقة، تسلسل… ملف Word أو PDF.', needs: 'pairs', print: true }
  ];
  const tpl = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
  const RECIPES = [
    { id: 'vocab', name: 'مفردات', list: ['flash', 'match', 'kicks', 'quiz'] },
    { id: 'reading', name: 'قراءة وفهم', list: ['flash', 'tf', 'mcq', 'quiz'] },
    { id: 'sentences', name: 'جمل', list: ['flash', 'order', 'match', 'quiz'] },
    { id: 'review', name: 'مراجعة قبل الامتحان', list: ['bus', 'mcq', 'quiz'] }
  ];
  const DEFAULT_SETTINGS = { allowSwitch: true, mode: 'practice', showScore: true, leaderboard: true, lbCount: 10, showAnswers: true, shuffle: true, readAloud: true, attempts: 0, timeLimit: 0, due: '', swap: false };
  const settingsFor = (t, s) => { const o = Object.assign({}, DEFAULT_SETTINGS, s || {}); if (tpl(t).test) { o.mode = 'test'; } if (o.mode === 'test') o.leaderboard = false; return o; };

  // ---------- items ----------
  // item: { id, q, qi, a, ai, w: [wrong1, wrong2, wrong3] }
  const newItem = (q = '', a = '') => ({ id: uid(), q, qi: '', a, ai: '', w: ['', '', ''] });
  const usable = items => (items || []).filter(i => (i.q || '').trim() || i.qi);
  const answered = items => usable(items).filter(i => (i.a || '').trim() || i.ai);
  // swap front/back when the teacher asks for the other direction
  const oriented = (items, swap) => answered(items).map(i => swap ? { ...i, q: i.a, qi: i.ai, a: i.q, ai: i.qi, w: ['', '', ''] } : i);
  // four options: the right answer plus the teacher's wrong answers, filled from other items when missing
  function options(item, pool) {
    const right = { t: item.a, i: item.ai, ok: true };
    const own = (item.w || []).filter(x => x && x.trim() && norm(x) !== norm(item.a)).map(t => ({ t, i: '', ok: false }));
    const others = shuffle(pool.filter(p => p.id !== item.id && norm(p.a) !== norm(item.a))).map(p => ({ t: p.a, i: p.ai, ok: false }));
    const seen = new Set([norm(item.a)]), wrong = [];
    for (const o of [...own, ...others]) { const k = norm(o.t) + '|' + (o.i ? o.i.slice(-24) : ''); if (!seen.has(k)) { seen.add(k); wrong.push(o); } if (wrong.length === 3) break; }
    return shuffle([right, ...wrong]);
  }
  // paste an exam from Word: "1. question" then "a) / أ) / א)" options; a leading * marks the right one (else the first)
  function parseExam(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = [];
    const optRe = /^(\*?)\s*(?:[a-dA-D]|[أابجد]|[אבגד])\s*[\).\-:]\s*(.+)$/, qRe = /^(?:\d+|[٠-٩]+)\s*[\).\-:]\s*(.+)$/;
    let cur = null;
    for (const l of lines) {
      const om = optRe.exec(l);
      if (om && cur) { cur.opts.push({ t: om[2].replace(/^\*/, '').trim(), star: !!om[1] || /^\*/.test(om[2]) }); continue; }
      const qm = qRe.exec(l); cur = { q: (qm ? qm[1] : l).trim(), opts: [] }; out.push(cur);
    }
    return out.filter(x => x.opts.length >= 2).map(x => { const ri = Math.max(0, x.opts.findIndex(o => o.star)); const right = x.opts[ri]; const wrong = x.opts.filter((_, k) => k !== ri).map(o => o.t);
      return { id: uid(), q: x.q, qi: '', a: right.t, ai: '', w: [wrong[0] || '', wrong[1] || '', wrong[2] || ''], p: Math.min(ri, 3), marked: x.opts.some(o => o.star) }; });
  }
  // paste a list: "word - meaning" per line (tab, -, =, : or ،)
  // one line = one item. A separator (Tab, " - ", "=", " : ") splits front and back; a line without one stays whole (a word or a sentence).
  const SEP = /\t+|\s+[-–—]\s+|\s*=\s*|\s+:\s+|\s*\|\s*/;
  function parseList(text) {
    return String(text).split(/\r?\n/).map(l => l.trim().replace(/^(?:\d+|[٠-٩]+)\s*[\).]\s+/, '').replace(/^[•\-–*]\s+/, '')).filter(Boolean).map(l => { const m = l.split(SEP); return newItem((m[0] || '').trim(), m.slice(1).join(' ').trim()); });
  }
  // detect what was pasted: an exam (numbered questions with a) b) c) options), pairs, or single lines
  function parseAny(text) {
    const ex = parseExam(text);
    if (ex.length && ex.some(i => (i.w || []).some(Boolean))) { const marked = ex.filter(i => i.marked).length; ex.forEach(i => delete i.marked); return { kind: 'questions', items: ex, marked }; }
    const items = parseList(text), paired = items.filter(i => i.a).length;
    const sentences = items.filter(i => words(i.q) >= 3).length;
    return { kind: paired >= Math.ceil(items.length / 2) ? 'pairs' : 'single', items, paired, sentences };
  }
  const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  // the sentence an item offers for "order the sentence": its front, or its back, if it has 3–14 words
  const sentenceOf = it => [it.q, it.a].find(x => words(x) >= 3 && words(x) <= 14) || '';
  // how many items a template can actually use
  function fits(tid, items) {
    const t = tpl(tid);
    if (t.needs === 'sentences') return usable(items).filter(i => sentenceOf(i)).length;
    if (t.print) return usable(items).length;
    return answered(items).length;
  }

  // ---------- links (share) ----------
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if ('CompressionStream' in window) { const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer(); return 'z' + b64u(new Uint8Array(buf)); }
    return 'j' + b64u(raw);
  }
  async function unpack(str) {
    const kind = str[0], bytes = unb64u(str.slice(1));
    const raw = kind === 'z' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
    return JSON.parse(new TextDecoder().decode(raw));
  }

  // ---------- local database (to be replaced by Supabase) ----------
  const DB = {
    activities() { return ls.get('activities', []); },
    units() { return ls.get('units', []); },
    links() { return ls.get('links', []); },
    saveActivity(a) { const all = DB.activities().filter(x => x.id !== a.id); a.updated = Date.now(); all.unshift(a); ls.set('activities', all); return a; },
    saveUnit(u) { const all = DB.units().filter(x => x.id !== u.id); u.updated = Date.now(); all.unshift(u); ls.set('units', all); return u; },
    delActivity(id) { ls.set('activities', DB.activities().filter(x => x.id !== id)); },
    delUnit(id) { ls.set('units', DB.units().filter(x => x.id !== id)); },
    activity(id) { return DB.activities().find(x => x.id === id); },
    unit(id) { return DB.units().find(x => x.id === id); },
    addLink(l) { const all = DB.links(); all.unshift(l); ls.set('links', all); return l; },
    link(c) { return DB.links().find(l => l.code === c); },
    results(c) { return ls.get('res:' + c, []); },
    addResult(c, r) { const all = DB.results(c); all.push(r); ls.set('res:' + c, all.slice(-2000)); },
    library() { return ls.get('library', []); },
    publish(entry) { const all = DB.library().filter(x => x.id !== entry.id); all.unshift(entry); ls.set('library', all); },
    teacher() { return ls.get('teacher', ''); }, setTeacher(n) { ls.set('teacher', n); },
    school() { return ls.get('school', ''); }, setSchool(n) { ls.set('school', n); }
  };
  // deep copies always get new ids, so a copy never edits its original
  const cloneItems = items => (items || []).map(i => ({ ...i, id: uid(), w: [...(i.w || ['', '', ''])] }));
  const cloneActivity = a => ({ ...JSON.parse(JSON.stringify(a)), id: uid(), items: cloneItems(a.items), from: a.by || a.from || '', updated: Date.now() });
  const cloneUnit = u => ({ ...JSON.parse(JSON.stringify(u)), id: uid(), items: cloneItems(u.items), acts: (u.acts || []).map(x => ({ ...x, id: uid() })), from: u.by || u.from || '', updated: Date.now() });

  // best score per student for one activity of a link: the leaderboard
  function board(c, actId) {
    const best = {};
    DB.results(c).filter(r => r.act === actId).forEach(r => { const k = norm(r.name); if (!best[k] || r.score > best[k].score || (r.score === best[k].score && r.ms < best[k].ms)) best[k] = r; });
    return Object.values(best).sort((a, b) => b.score - a.score || a.ms - b.ms);
  }

  // ---------- voice ----------
  const LANG = { en: 'en-US', ar: 'ar-SA', he: 'he-IL' };
  let audio = null;
  function speak(text, file) {
    try { speechSynthesis.cancel(); } catch (e) {}
    if (audio) { audio.pause(); audio = null; }
    if (file) { audio = new Audio(file); audio.play().catch(() => {}); return; }
    if (!text || !('speechSynthesis' in window)) return;
    const code = LANG[scriptOf(text)], u = new SpeechSynthesisUtterance(text); u.lang = code; u.rate = .85;
    try { const vs = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').startsWith(code.slice(0, 2))); u.voice = vs.find(v => /(Enhanced|Premium|Natural|Neural|Online|Google)/i.test(v.name)) || vs[0] || null; } catch (e) {}
    speechSynthesis.speak(u);
  }
  let AC = null;
  function tone(ok) { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    (ok ? [660, 880] : [300, 220]).forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; o.type = ok ? 'sine' : 'triangle'; const t0 = AC.currentTime + i * .12;
      g.gain.setValueAtTime(.15, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .2); o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + .22); }); } catch (e) {} }

  window.K = { ls, uid, code, esc, shuffle, scriptOf, dirOf, norm, KINDS, TEMPLATES, tpl, RECIPES, DEFAULT_SETTINGS, settingsFor, newItem, usable, answered, oriented, options,
    parseExam, parseList, parseAny, words, sentenceOf, fits, pack, unpack, DB, cloneActivity, cloneUnit, cloneItems, board, speak, tone };
})();
