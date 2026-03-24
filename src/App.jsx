import { useState, useEffect, useRef } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Kanit:wght@300;400;500;600;700&display=swap');`;
const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const pad = (n) => String(n).padStart(2, '0');
const FIELD_LABELS = { email: 'Email', firstName: 'Họ và Tên (First-Last Name)', lastName: 'Last Name', idNumber: 'Số giấy tờ (Identification No.)', phone: 'Số điện thoại (Phone Number)', confirm: 'Xác nhận (Yes)' };

const getStored = (key, def) => {
  const v = localStorage.getItem(key);
  try { return v ? JSON.parse(v) : def; } catch { return def; }
};

export default function App() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(() => getStored('gmmtv_data', { email: '', firstName: '', lastName: '', idNumber: '', phone: '' }));
  const [profiles, setProfiles] = useState(() => getStored('gmmtv_profiles', []));
  const [targets, setTargets] = useState(() => getStored('gmmtv_targets', []));
  const [countdowns, setCountdowns] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState('');
  const [quickPaste, setQuickPaste] = useState('');
  const [bulkData, setBulkData] = useState('');
  const intervalRef = useRef(null);
  const submittedMapRef = useRef({});

  const parseTable = (text) => {
    const lines = text.trim().split('\n').map(l => l.split('\t'));
    if (lines.length < 2) return [];
    const headers = lines[0].map(h => h.trim());
    return lines.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (row[i]) obj[h] = row[i].trim(); });
      return obj;
    });
  };

  const getMatch = (title, rowData) => {
    const t = removeAccents(title).toLowerCase();
    for (const [key, val] of Object.entries(rowData)) {
      const k = removeAccents(key).toLowerCase();
      if (t.includes(k) || k.includes(t)) return val;
    }
    // Standard defaults if not in table
    if (t.includes('email')) return data.email;
    if (t.includes('hoo') || t.includes('first')) return data.firstName;
    if (t.includes('ten') || t.includes('last')) return data.lastName;
    if (t.includes('cccd') || t.includes('id') || t.includes('passport')) return data.idNumber;
    if (t.includes('sdt') || t.includes('phone') || t.includes('dien thoai')) return data.phone;
    return '';
  };

  useEffect(() => { localStorage.setItem('gmmtv_data', JSON.stringify(data)); }, [data]);
  useEffect(() => { localStorage.setItem('gmmtv_profiles', JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem('gmmtv_targets', JSON.stringify(targets)); }, [targets]);

  const analyzeAll = async () => {
    setAnalyzing(true); setAnalyzeErr('');
    const newTargets = [...targets];
    for (let i = 0; i < newTargets.length; i++) {
      if (newTargets[i].fields) continue;

      const row = newTargets[i].row || {}; // The data from the Excel row
      const url = row['URL'] || row['Link'] || row['link'] || newTargets[i].url;
      if (!url) { setAnalyzeErr(`Dòng ${i + 1} thiếu link form!`); break; }

      try {
        const res = await fetch(`/api/form-info?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        newTargets[i].url = url;
        newTargets[i].fields = json.fields;
        newTargets[i].submitUrl = json.submitUrl;
        newTargets[i].mapping = {};

        // Target settings from table
        newTargets[i].date = row['Date'] || row['Ngày'] || targets[targets.length - 1]?.date || '';
        newTargets[i].time = row['Time'] || row['Giờ'] || targets[targets.length - 1]?.time || '';

        const nameFields = json.fields.filter(f => f.autoMap === 'firstName' || f.autoMap === 'lastName');

        for (const f of json.fields) {
          // 1. Try matching from Table columns
          let val = getMatch(f.title, row);

          // 2. Fallback to Profile/Data if empty
          if (!val) {
            if (f.autoMap === 'email') val = row['Email'] || data.email;
            else if (f.autoMap === 'firstName') val = nameFields.length === 1 ? `${data.firstName} ${data.lastName}`.trim() : data.firstName;
            else if (f.autoMap === 'lastName') val = data.lastName;
            else if (f.autoMap === 'idNumber') val = data.idNumber;
            else if (f.autoMap === 'phone') val = data.phone;
          }

          if (f.autoMap === 'confirm') {
            const yesOpt = f.options.find(o => o.toLowerCase().includes('yes') || o.includes('ใช่'));
            val = yesOpt || f.options[0] || 'Yes';
          }

          newTargets[i].mapping[f.entryId] = val;
        }
        // Capture email for submit
        const emailField = json.fields.find(f => f.autoMap === 'email');
        newTargets[i].email = emailField ? newTargets[i].mapping[emailField.entryId] : data.email;

      } catch (e) { setAnalyzeErr(`Lỗi form ${i + 1}: ${e.message}`); break; }
    }
    setTargets(newTargets);
    setAnalyzing(false);
    if (!analyzeErr) setStep(3);
  };

  const instantShoot = async (url) => {
    if (!url.includes('docs.google.com/forms') && !url.includes('forms.gle')) {
      alert('Link Google Form không hợp lệ!');
      return;
    }
    setTargets([{ id: 'fast', url, status: 'submitting', submitTime: '' }]);
    setStep(4);
    
    try {
      const res = await fetch(`/api/form-info?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      const mapping = {};
      const nameFields = json.fields.filter(f => f.autoMap === 'firstName' || f.autoMap === 'lastName');
      for (const f of json.fields) {
        let val = '';
        if (f.autoMap === 'email') val = data.email;
        else if (f.autoMap === 'firstName') val = nameFields.length === 1 ? `${data.firstName} ${data.lastName}`.trim() : data.firstName;
        else if (f.autoMap === 'lastName') val = data.lastName;
        else if (f.autoMap === 'idNumber') val = data.idNumber;
        else if (f.autoMap === 'phone') val = data.phone;
        
        if (f.autoMap === 'confirm') {
          const yesOpt = f.options.find(o => o.toLowerCase().includes('yes') || o.includes('ใช่'));
          val = yesOpt || f.options[0] || 'Yes';
        }
        mapping[f.entryId] = val;
      }
      
      const emailField = json.fields.find(f => f.autoMap === 'email');
      const email = emailField ? mapping[emailField.entryId] : data.email;
      
      const body = new URLSearchParams();
      for (const [entryId, val] of Object.entries(mapping)) { if (val) body.append(entryId, val); }
      if (email) body.append('emailAddress', email);
      
      const now = new Date();
      const triggerStr = now.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      
      await fetch(json.submitUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      
      const done = new Date();
      const doneStr = done.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(done.getMilliseconds()).padStart(3, '0');
      
      setTargets([{ id: 'fast', url, status: 'success', submitTime: doneStr, triggerTime: triggerStr }]);
    } catch (e) {
      setTargets([{ id: 'fast', url, status: 'error', err: e.message }]);
    }
  };

  const doSubmit = async (tid) => {
    const t = targets.find(x => x.id === tid);
    if (!t || t.status === 'success' || t.status === 'submitting') return;

    const now = new Date();
    const triggerStr = now.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

    setTargets(prev => prev.map(x => x.id === tid ? { ...x, status: 'submitting', triggerTime: triggerStr } : x));

    try {
      const body = new URLSearchParams();
      for (const [entryId, val] of Object.entries(t.mapping)) { if (val) body.append(entryId, val); }
      if (t.email) body.append('emailAddress', t.email);
      await fetch(t.submitUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      const done = new Date();
      const doneStr = done.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(done.getMilliseconds()).padStart(3, '0');
      setTargets(prev => prev.map(x => x.id === tid ? { ...x, status: 'success', submitTime: doneStr } : x));
    } catch (e) {
      setTargets(prev => prev.map(x => x.id === tid ? { ...x, status: 'error', err: e.message } : x));
    }
  };

  useEffect(() => {
    if (step !== 4) return;
    submittedMapRef.current = {};
    intervalRef.current = setInterval(() => {
      const now = new Date();
      const newCDs = {};
      targets.forEach(t => {
        const targetDate = new Date(`${t.date}T${t.time}`);
        const diff = targetDate - now;
        if (diff <= 0) {
          newCDs[t.id] = { h: 0, m: 0, s: 0, cs: 0 };
          if (!submittedMapRef.current[t.id]) {
            submittedMapRef.current[t.id] = true;
            doSubmit(t.id);
          }
        } else {
          newCDs[t.id] = { h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000), cs: Math.floor((diff % 1000) / 10) };
        }
      });
      setCountdowns(newCDs);
    }, 16);
    return () => clearInterval(intervalRef.current);
  }, [step, targets]);

  const typeLabel = (t) => ({ 0: 'Văn bản', 2: 'Radio', 4: 'Checkbox', 1: 'Đoạn văn', 9: 'Ngày', 10: 'Giờ' }[t] || `type ${t}`);
  const stateOf = (s) => s < step ? 'done' : s === step ? 'active' : 'idle';

  const css = `
    ${FONTS}
    *{box-sizing:border-box;margin:0;padding:0}
    .app{min-height:100vh;background:#07070f;background-image:radial-gradient(ellipse 60% 40% at 15% 15%,rgba(255,20,147,.18) 0%,transparent 60%),radial-gradient(ellipse 50% 40% at 85% 85%,rgba(160,0,255,.13) 0%,transparent 60%);color:#eeeef8;font-family:'Kanit',sans-serif;padding:28px 16px 48px}
    .wrap{max-width:680px;margin:0 auto}
    .hdr{text-align:center;margin-bottom:36px}
    .badge{display:inline-block;background:linear-gradient(135deg,#ff1493,#a000ff);color:#fff;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;padding:5px 18px;border-radius:20px;margin-bottom:14px}
    .hdr h1{font-family:'Orbitron',monospace;font-size:clamp(18px,5vw,26px);font-weight:900;background:linear-gradient(135deg,#ff1493 0%,#ff69b4 50%,#a000ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.25;margin-bottom:6px}
    .hdr p{color:#666;font-size:12.5px}
    .steps{display:flex;position:relative;margin-bottom:30px}
    .steps::before{content:'';position:absolute;top:19px;left:12.5%;right:12.5%;height:1px;background:rgba(255,255,255,.07)}
    .si{flex:1;text-align:center;position:relative;z-index:1}
    .sc{width:38px;height:38px;border-radius:50%;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',monospace;font-size:13px;font-weight:700;border:2px solid;transition:.3s}
    .sc.done{border-color:#00e676;background:rgba(0,230,118,.12);color:#00e676}
    .sc.active{border-color:#ff1493;background:rgba(255,20,147,.15);color:#ff1493;box-shadow:0 0 18px rgba(255,20,147,.35)}
    .sc.idle{border-color:#252535;background:transparent;color:#444}
    .sl{font-size:10px;font-weight:600;letter-spacing:.4px}
    .sl.done{color:#00e676}.sl.active{color:#ff1493}.sl.idle{color:#444}
    .card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:26px 24px;margin-bottom:16px}
    .ctitle{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;margin-bottom:20px;color:#eeeef8}
    .cicon{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#ff1493,#a000ff);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
    .fgrp{margin-bottom:15px}
    .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    label{display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:5px;letter-spacing:.6px;text-transform:uppercase}
    input,select{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:11px 13px;color:#eeeef8;font-family:'Kanit',sans-serif;font-size:13.5px;outline:none;transition:.2s}
    input:focus,select:focus{border-color:#ff1493;background:rgba(255,20,147,.05);box-shadow:0 0 0 3px rgba(255,20,147,.08)}
    input::placeholder{color:#383850}
    select option{background:#1a1a2e}
    .bprimary{width:100%;background:linear-gradient(135deg,#ff1493,#a000ff);border:none;border-radius:12px;padding:13px 24px;color:#fff;font-family:'Kanit',sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;margin-top:6px;transition:.2s}
    .bprimary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 28px rgba(255,20,147,.35)}
    .bprimary:disabled{opacity:.5;cursor:not-allowed}
    .bsecondary{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:11px 20px;color:#888;font-family:'Kanit',sans-serif;font-size:13.5px;cursor:pointer;transition:.2s}
    .bsecondary:hover{border-color:rgba(255,255,255,.18);color:#eeeef8}
    .brow{display:flex;gap:10px;margin-top:6px}
    .brow .bsecondary{flex:1}.brow .bprimary{flex:2}
    .warn{background:rgba(255,176,0,.07);border:1px solid rgba(255,176,0,.2);border-radius:10px;padding:11px 14px;font-size:12px;color:#ffb800;margin:12px 0;line-height:1.65}
    .warn strong{display:block;font-size:13px;margin-bottom:3px}
    .err-box{background:rgba(255,60,60,.07);border:1px solid rgba(255,60,60,.2);border-radius:10px;padding:11px 14px;font-size:12px;color:#ff6b6b;margin:12px 0;line-height:1.65}
    .fmap{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.07);margin-bottom:16px}
    .fmap-hdr{display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;padding:9px 14px;background:rgba(255,255,255,.04);font-size:10.5px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.8px}
    .fmap-row{display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;align-items:center;padding:9px 14px;border-top:1px solid rgba(255,255,255,.04);font-size:12.5px}
    .farr{color:#444;text-align:center}
    .ftype{font-size:10px;color:#555;margin-top:2px}
    .fval{color:#eeeef8;font-weight:500;font-size:12.5px}
    .gtag{display:inline-block;background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.2);color:#00e676;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;margin-left:6px}
    .utag{display:inline-block;background:rgba(255,176,0,.1);border:1px solid rgba(255,176,0,.2);color:#ffb800;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;margin-left:6px}
    .cdwrap{text-align:center;padding:20px 0 12px}
    .cddigits{display:flex;justify-content:center;align-items:flex-end;gap:6px}
    .dblk{text-align:center}
    .dval{font-family:'Orbitron',monospace;font-size:clamp(36px,10vw,62px);font-weight:900;background:linear-gradient(180deg,#ff1493,#a000ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;display:block;min-width:2ch}
    .dlbl{font-size:9px;color:#555;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-top:4px}
    .dsep{font-family:'Orbitron',monospace;font-size:clamp(26px,7vw,44px);font-weight:900;color:#252535;line-height:1;padding-bottom:16px}
    .csblk .dval{font-size:clamp(18px,4vw,28px);background:none;-webkit-text-fill-color:#2a2a40}
    .spin{display:inline-block;width:40px;height:40px;border:3px solid rgba(255,20,147,.2);border-top-color:#ff1493;border-radius:50%;animation:spin .8s linear infinite}
    .spin-sm{width:18px;height:18px;border-width:2px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .success-box{background:linear-gradient(135deg,rgba(0,230,118,.1),rgba(0,180,80,.06));border:1px solid rgba(0,230,118,.25);border-radius:16px;padding:28px 20px;text-align:center}
    .success-box .big{font-size:48px;display:block;margin-bottom:10px}
    .success-box strong{color:#00e676;font-size:20px;font-weight:900;font-family:'Orbitron',monospace;display:block;margin-bottom:8px}
    .success-box p{color:#778;font-size:13px;line-height:1.7}
    .ts{font-family:'Orbitron',monospace;font-size:11px;color:#00e676;opacity:.7;margin-top:10px}
    .glowdot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff1493;margin-right:6px;animation:glw 1.4s infinite alternate}
    @keyframes glw{from{box-shadow:0 0 4px #ff1493}to{box-shadow:0 0 14px #ff1493,0 0 28px rgba(255,20,147,.4)}}
    .irow{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px}
    .irow:last-child{border-bottom:none}
    .ik{color:#555}.iv{color:#eeeef8;font-weight:500}
    .loader-row{display:flex;align-items:center;gap:10px;font-size:13px;color:#888;padding:8px 0}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#252535;border-radius:4px}
  `;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="wrap">
          <div className="hdr">
            <div className="badge">⚡ GMMTV FANIVAL 2026</div>
            <h1>MERCH FORM<br />AUTO-BOT</h1>
            <p>Submit 100% tự động · Không cần extension · Không cần mở tab form</p>
          </div>

          <div className="steps">
            {[['Thông tin'], ['Form & Giờ'], ['Kiểm tra'], ['Đếm ngược']].map(([lbl], i) => (
              <div className="si" key={i}>
                <div className={`sc ${stateOf(i + 1)}`}>{i + 1 < step ? '✓' : i + 1}</div>
                <div className={`sl ${stateOf(i + 1)}`}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="card">
              <div className="ctitle"><div className="cicon">📋</div>Nhập thông tin cá nhân</div>

              <div className="fgrp">
                <label>Dán nhanh (Email | First | Last | ID | Phone)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ flex: 1 }} placeholder="thu.hyy@gmail.com | THU | DINH THI | 0123... | 098..." value={quickPaste} onChange={e => setQuickPaste(e.target.value)} />
                  <button className="bsecondary" style={{ width: 'auto', padding: '0 15px' }} onClick={() => {
                    const parts = quickPaste.split(/[|,,;]/).map(p => p.trim());
                    if (parts.length >= 5) {
                      setData({ email: parts[0], firstName: removeAccents(parts[1]).toUpperCase(), lastName: removeAccents(parts[2]).toUpperCase(), idNumber: parts[3], phone: parts[4] });
                      setQuickPaste('');
                    } else alert('Vui lòng nhập đúng định dạng!');
                  }}>Dán</button>
                </div>
              </div>

              <div className="frow fgrp">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Profiles đã lưu (Hàng loạt từ Excel)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select style={{ width: '100%' }} value="" onChange={e => {
                      const p = profiles.find(x => x.idNumber === e.target.value);
                      if (p) setData(p);
                    }}>
                      <option value="">-- Chọn profile đã lưu --</option>
                      {profiles.map(p => <option key={p.idNumber} value={p.idNumber}>{p.firstName} {p.lastName} ({p.idNumber})</option>)}
                    </select>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="bsecondary" style={{ flex: 1 }} onClick={() => {
                        if (!data.idNumber) return;
                        if (profiles.find(p => p.idNumber === data.idNumber)) {
                          setProfiles(profiles.map(p => p.idNumber === data.idNumber ? data : p));
                        } else {
                          setProfiles([...profiles, data]);
                        }
                        alert('Đã lưu profile hiện tại!');
                      }}>Lưu người này</button>

                      <button className="bsecondary" style={{ flex: 1 }} onClick={() => {
                        const txt = prompt("Dán danh sách Excel (Email	First	Last	ID	Phone):");
                        if (!txt) return;
                        const lines = txt.trim().split('\n').map(l => l.split('\t'));
                        const newProfiles = lines.map(cols => {
                          if (cols.length < 5) return null;
                          return { email: cols[0].trim(), firstName: removeAccents(cols[1]).toUpperCase(), lastName: removeAccents(cols[2]).toUpperCase(), idNumber: cols[3].trim(), phone: cols[4].trim() };
                        }).filter(p => p);
                        if (newProfiles.length) {
                          setProfiles([...profiles, ...newProfiles]);
                          alert(`Đã thêm ${newProfiles.length} profiles!`);
                        }
                      }}>📥 Nhập hàng loạt Profile</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="fgrp">
                <label>Email nhận xác nhận</label>
                <input type="email" placeholder="example@gmail.com" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} />
              </div>
              <div className="frow fgrp">
                <div>
                  <label>First Name (Họ)</label>
                  <input type="text" placeholder="DINH" value={data.firstName} onChange={e => setData({ ...data, firstName: removeAccents(e.target.value).toUpperCase() })} />
                </div>
                <div>
                  <label>Last Name (Tên đệm & Tên)</label>
                  <input type="text" placeholder="THI THU" value={data.lastName} onChange={e => setData({ ...data, lastName: removeAccents(e.target.value).toUpperCase() })} />
                </div>
              </div>
              <div className="fgrp">
                <label>Số giấy tờ (Identification / Passport No.)</label>
                <input type="text" placeholder="Dãy số CCCD hoặc Passport" value={data.idNumber} onChange={e => setData({ ...data, idNumber: e.target.value })} />
              </div>
              <div className="fgrp">
                <label>Số điện thoại (Phone Number)</label>
                <input type="tel" placeholder="Ví dụ: 0912345678" value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} />
              </div>
              <div className="warn"><strong>⚠️ Lưu ý</strong>Hệ thống tự động VIẾT HOA và BỎ DẤU. Tên cần khớp hoàn toàn với CCCD/Hộ chiếu.</div>
              <button className="bprimary" onClick={() => { if (Object.values(data).every(v => v.trim())) setStep(2); else alert('Điền đầy đủ thông tin!'); }}>Tiếp theo →</button>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="card">
              <div className="ctitle"><div className="cicon">⚡</div>Cách thức Submit</div>
              
              <div style={{ background: 'rgba(255,20,147,.05)', border: '1px solid rgba(255,20,147,.3)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', color: '#ff1493', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🔥</span> BẮN TỐC ĐỘ (Dành cho form sát giờ mới có link)
                </h3>
                <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', lineHeight: '1.5' }}>
                  Sử dụng profile đang chọn. Chỉ cần dán link vào ô bên dưới, tool sẽ <strong>TỰ PHÂN TÍCH</strong> và <strong>TỰ GỬI</strong> ngay lập tức trong nháy mắt. Không cần phải qua bước hẹn giờ!
                </p>
                <input 
                  type="text" 
                  placeholder="Dán link Google Form vào đây (Ctrl+V)..." 
                  style={{ width: '100%', borderColor: '#ff1493', background: 'rgba(0,0,0,0.2)', padding: '14px', fontSize: '13px' }}
                  onChange={(e) => {
                    const u = e.target.value.trim();
                    if (u.includes('docs.google.com/forms') || u.includes('forms.gle')) {
                      instantShoot(u);
                    }
                  }}
                />
              </div>

              <div style={{ textAlign: 'center', marginBottom: '20px', fontSize: '12px', color: '#555', fontWeight: 600, letterSpacing: '2px' }}>--- HOẶC ---</div>

              <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#eeeef8', marginBottom: '8px' }}>🕒 HẸN GIỜ NHIỀU FORM (Có link trước)</h3>
                <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>Dùng dữ liệu Excel (gồm Link, Date, Time) để hẹn giờ bắn song song nhiều form cùng lúc.</p>

                <div className="fgrp" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ flex: 1, fontSize: '11px', color: '#888', lineHeight: '1.4' }}>
                      <span style={{ color: '#ff1493' }}>Yêu cầu cột: <strong>Link, Date, Time</strong></span>
                    </div>
                    <button className="bsecondary" style={{ fontSize: '10px', height: 'fit-content', padding: '4px 10px' }} onClick={() => {
                      const sample = "Link\tDate\tTime\tName\tCCCD\nhttps://forms.gle/K5GdudyfVgvFXgX5A\t2026-03-26\t10:00:00\tTHU\t012345\nhttps://forms.gle/GgjnPxYYdukDUfp39\t2026-03-27\t10:00:00\tNGA\t67890";
                      navigator.clipboard.writeText(sample);
                      alert('Đã copy dữ liệu mẫu! Hãy dán (Ctrl+V) vào ô bên dưới.');
                    }}>📋 Copy mẫu Excel</button>
                  </div>
                  <textarea
                    style={{ width: '100%', minHeight: '120px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,147,20,0.3)', borderRadius: '12px', padding: '12px', color: '#eeeef8', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                    placeholder="Dán nội dung bôi đen từ Excel vào đây..."
                    value={bulkData} onChange={e => setBulkData(e.target.value)}
                  />
                  <button className="bprimary" style={{ marginTop: '10px' }} onClick={() => {
                    const rows = parseTable(bulkData);
                    if (!rows.length) return alert('Dữ liệu không đúng định dạng!');
                    const newTargets = rows.map(r => ({
                      id: Math.random().toString(36).substr(2, 9),
                      url: r['Link'] || r['URL'] || '',
                      date: r['Date'] || r['Ngày'] || '',
                      time: r['Time'] || r['Giờ'] || '',
                      row: r,
                      status: 'idle'
                    }));
                    setTargets(newTargets);
                  }}>⚡ Xác nhận danh sách ({targets.length} form)</button>
                </div>

                {targets.length > 0 && (
                  <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '16px', border: '1px solid rgba(255,255,255,.05)', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                      <thead style={{ background: 'rgba(255,255,255,.05)', color: '#888' }}>
                        <tr><th style={{ padding: '8px', textAlign: 'left' }}>#</th><th style={{ padding: '8px', textAlign: 'left' }}>Link</th><th style={{ padding: '8px', textAlign: 'left' }}>Thời gian</th><th style={{ padding: '8px', textAlign: 'left' }}>Dữ liệu</th></tr>
                      </thead>
                      <tbody>
                        {targets.map((t, idx) => (
                          <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,.03)' }}>
                            <td style={{ padding: '8px', color: '#ff1493' }}>{idx + 1}</td>
                            <td style={{ padding: '8px', color: '#aaa' }}>{t.url?.substring(0, 25)}...</td>
                            <td style={{ padding: '8px' }}>{t.date} {t.time}</td>
                            <td style={{ padding: '8px', color: '#00e676' }}>{t.row ? Object.keys(t.row).filter(k => !['Link', 'URL', 'Date', 'Time', 'Ngày', 'Giờ'].includes(k)).join(', ') : 'No data'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyzeErr && <div className="err-box">❌ {analyzeErr}</div>}
                {analyzing && <div className="loader-row"><div className="spin spin-sm"></div>Đang phân tích và gán dữ liệu...</div>}

                <div className="brow">
                  <button className="bprimary" disabled={analyzing || !targets.length} onClick={analyzeAll}>
                    {analyzing ? 'Đang phân tích...' : '🔍 Phân tích Mapping →'}
                  </button>
                </div>
              </div>

              <div className="brow" style={{ marginTop: '16px' }}>
                <button className="bsecondary" style={{ width: '100%' }} onClick={() => setStep(1)}>← Quay lại</button>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="card">
              <div className="ctitle"><div className="cicon">✅</div>Kiểm tra dữ liệu ({targets.length} form)</div>

              <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid rgba(255,255,255,.07)', borderRadius: '12px', padding: '10px' }}>
                {targets.map((t, idx) => (
                  <div key={t.id} style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#ff1493' }}># {idx + 1}. {t.url?.substring(0, 30)}...</div>
                      <div style={{ fontSize: '11px', color: '#aaa' }}>{t.date} {t.time}</div>
                    </div>
                    <div className="fmap">
                      {t.fields?.map((f, fi) => (
                        <div className="fmap-row" key={fi}>
                          <div>
                            <div style={{ color: '#ccc', fontSize: '11px' }}>{f.title}</div>
                          </div>
                          <div className="farr">→</div>
                          <div>
                            {f.autoMap ? (
                              <div className="fval" style={{ fontSize: '11px' }}>{t.mapping[f.entryId] || '—'}</div>
                            ) : (
                              <select
                                value={t.mapping[f.entryId] || ''}
                                onChange={e => {
                                  const newTargets = [...targets];
                                  newTargets[idx].mapping[f.entryId] = e.target.value;
                                  setTargets(newTargets);
                                }}
                                style={{ fontSize: '10px', padding: '4px' }}
                              >
                                <option value="">-- Chọn --</option>
                                {Object.entries(data).map(([k, v]) => <option key={k} value={v}>{FIELD_LABELS[k]}: {v}</option>)}
                                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(0,230,118,.05)', border: '1px solid rgba(0,230,118,.15)', borderRadius: '10px', padding: '11px 14px', fontSize: '11px', color: '#5a8a6a', margin: '14px 0', lineHeight: '1.7' }}>
                🚀 Tool sẽ trigger song song tất cả các form trên đúng vào giờ đã hẹn.
              </div>

              <div className="brow">
                <button className="bsecondary" onClick={() => setStep(2)}>← Sửa</button>
                <button className="bprimary" onClick={() => setStep(4)}>🚀 Kích hoạt tất cả ({targets.length}) →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <div className="card">
              <div className="ctitle"><div className="cicon">⏱️</div>Dashboard Theo Dõi ({targets.length})</div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {targets.map((t, idx) => (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: '16px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#555' }}>FORM #{idx + 1}</span>
                        <span style={{ fontSize: '11px', color: '#aaa' }}>{t.url?.substring(0, 30)}...</span>
                      </div>
                      <span className={`gtag ${t.status}`} style={{
                        background: t.status === 'success' ? 'rgba(0,230,118,.1)' : t.status === 'submitting' ? 'rgba(255,20,147,.1)' : 'rgba(255,255,255,.05)',
                        color: t.status === 'success' ? '#00e676' : t.status === 'submitting' ? '#ff1493' : '#666'
                      }}>
                        {t.status === 'idle' ? 'Đang chờ...' : t.status === 'submitting' ? '⚡ Gửi...' : t.status === 'success' ? '✓ Xong' : '❌ Lỗi'}
                      </span>
                    </div>

                    {t.status === 'idle' && (
                      <div className="cdwrap" style={{ padding: '5px 0' }}>
                        <div className="cddigits" style={{ gap: '4px' }}>
                          <div className="dblk"><span className="dval" style={{ fontSize: '24px' }}>{pad(countdowns[t.id]?.h || 0)}</span></div>
                          <div className="dsep" style={{ fontSize: '18px', paddingBottom: '10px' }}>:</div>
                          <div className="dblk"><span className="dval" style={{ fontSize: '24px' }}>{pad(countdowns[t.id]?.m || 0)}</span></div>
                          <div className="dsep" style={{ fontSize: '18px', paddingBottom: '10px' }}>:</div>
                          <div className="dblk"><span className="dval" style={{ fontSize: '24px' }}>{pad(countdowns[t.id]?.s || 0)}</span></div>
                          <div className="dsep" style={{ fontSize: '14px', paddingBottom: '12px' }}>.</div>
                          <div className="dblk"><span className="dval" style={{ fontSize: '18px', color: '#555' }}>{pad(countdowns[t.id]?.cs || 0)}</span></div>
                        </div>
                      </div>
                    )}

                    {t.status === 'success' && (
                      <div style={{ fontSize: '11px', color: '#00e676', textAlign: 'center', fontStyle: 'italic' }}>
                        Gửi lúc {t.submitTime} (Trigger: {t.triggerTime})
                      </div>
                    )}

                    {t.status === 'error' && (
                      <div style={{ fontSize: '11px', color: '#ff6b6b', textAlign: 'center' }}>
                        Lỗi: {t.err} <button className="bsecondary" style={{ padding: '2px 8px', marginLeft: '5px' }} onClick={() => doSubmit(t.id)}>Thử lại</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="brow" style={{ marginTop: '20px' }}>
                <button className="bsecondary" style={{ flex: 1 }} onClick={() => setStep(3)}>← Quay lại</button>
                <button className="bprimary" style={{ flex: 1, background: '#252535', boxShadow: 'none' }} onClick={() => {
                  if (confirm('Dừng tất cả countdown?')) setStep(1);
                }}>Dừng Tất Cả</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
