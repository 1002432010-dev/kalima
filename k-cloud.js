// Kalima cloud: Supabase keeps teachers' work and students' results across devices.
// The page keeps working from this device's storage; the cloud is synced in the background.
(function () {
  const URL_ = 'https://tserowcnvtjpmbtnhbwr.supabase.co';
  const KEY = 'sb_publishable_nk4gbBsXEGkIAkfIBwWj-Q_l6l_MU6Q'; // publishable key: meant for the browser, protected by row-level security
  const C = { sb: null, user: null, ok: false, listeners: [] };
  window.KC = C;
  try { if (window.supabase) { C.sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } }); C.ok = true; } } catch (e) { C.ok = false; }
  const emit = () => C.listeners.forEach(f => { try { f(C.user); } catch (e) {} });
  C.onChange = f => C.listeners.push(f);

  // ---------- teacher sign-in (email link, no password) ----------
  C.signIn = async email => {
    if (!C.ok) throw new Error('offline');
    const back = location.origin + location.pathname;
    const { error } = await C.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: back, shouldCreateUser: true } });
    if (error) throw error;
  };
  C.signOut = async () => { if (C.ok) await C.sb.auth.signOut(); };

  // ---------- docs: activities, units, links ----------
  const KIND = { activities: 'activity', units: 'unit', links: 'link' };
  const keyOf = (kind, o) => kind === 'link' ? o.code : o.id;
  const queue = new Map(); let timer = null;
  function flush() {
    timer = null; if (!C.user) return;
    const rows = [...queue.values()]; queue.clear();
    const up = rows.filter(r => !r.del).map(r => ({ id: r.id, kind: r.kind, data: r.data, updated_at: new Date().toISOString() }));
    const del = rows.filter(r => r.del);
    if (up.length) C.sb.from('docs').upsert(up, { onConflict: 'owner,id' }).then(({ error }) => { if (error) console.warn('cloud save', error.message); });
    del.forEach(r => C.sb.from('docs').delete().eq('id', r.id).then(() => {}));
  }
  const push = (kind, o, del) => { if (!C.user || !o) return; const id = keyOf(kind, o); queue.set(id, { id, kind, data: o, del: !!del }); if (!timer) timer = setTimeout(flush, 900); };

  // wrap the local store so every save also goes to the cloud
  const DB = window.K && K.DB;
  if (DB) {
    const wrap = (name, kind, del) => { const f = DB[name]; DB[name] = function (x) { const r = f.apply(DB, arguments); if (del) push(kind, { id: x, code: x }, true); else push(kind, r || x); return r; }; };
    wrap('saveActivity', 'activity'); wrap('saveUnit', 'unit'); wrap('addLink', 'link');
    wrap('delActivity', 'activity', true); wrap('delUnit', 'unit', true);
  }

  // bring this teacher's work from the cloud, and send up anything made on this device before signing in
  C.pull = async () => {
    if (!C.user) return;
    const { data, error } = await C.sb.from('docs').select('id,kind,data,updated_at').limit(5000);
    if (error) { console.warn('cloud load', error.message); return; }
    for (const [lsKey, kind] of Object.entries(KIND)) {
      const local = K.ls.get(lsKey, []), remote = data.filter(r => r.kind === kind).map(r => r.data);
      const byId = new Map(remote.map(o => [keyOf(kind, o), o]));
      local.forEach(o => { const k = keyOf(kind, o), r = byId.get(k); if (!r) { byId.set(k, o); push(kind, o); } else if ((o.updated || o.created || 0) > (r.updated || r.created || 0)) { byId.set(k, o); push(kind, o); } });
      const all = [...byId.values()].sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
      K.ls.set(lsKey, all);
    }
  };

  // ---------- results ----------
  C.addResult = (code, r) => { if (!C.ok || !code || code === 'TRY') return; C.sb.from('results').insert({ code, act: String(r.act), name: String(r.name).slice(0, 60), score: r.score | 0, correct: r.correct | 0, total: r.total | 0, ms: Math.max(0, r.ms | 0), wrong: (r.wrong || []).slice(0, 40).map(w => String(w).slice(0, 80)) }).then(({ error }) => { if (error) console.warn('result', error.message); }); };
  // the results of one link from every device; they replace this device's copy
  C.results = async code => {
    if (!C.ok || !code) return null;
    const { data, error } = await C.sb.rpc('results_for', { p_code: code });
    if (error || !data) return null;
    const list = data.map(r => ({ name: r.name, act: r.act, score: r.score, correct: r.correct, total: r.total, ms: r.ms, wrong: r.wrong || [], at: Date.parse(r.at) }));
    K.ls.set('res:' + code, list); return list;
  };

  // ---------- session ----------
  if (C.ok) {
    C.sb.auth.getSession().then(({ data }) => { C.user = data.session ? data.session.user : null; emit(); if (C.user) C.pull().then(emit); });
    C.sb.auth.onAuthStateChange((ev, session) => { const was = C.user && C.user.id; C.user = session ? session.user : null; if ((C.user && C.user.id) !== was) { emit(); if (C.user) C.pull().then(emit); } });
  }
})();
