import { useState, useEffect, useRef } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Kanit:wght@300;400;500;600;700&display=swap');`;
const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const pad = (n) => String(n).padStart(2, '0');
const FIELD_LABELS = { email: 'Email', firstName: 'First Name', lastName: 'Last Name', idNumber: 'CCCD / Passport', phone: 'Phone', confirm: 'Xác nhận (Yes)' };

const getStored = (key, def) => {
  const v = localStorage.getItem(key);
  try { return v ? JSON.parse(v) : def; } catch { return def; }
};

export default function App() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(() => getStored('gmmtv_data', { email: '', firstName: '', lastName: '', idNumber: '', phone: '' }));
  const [profiles, setProfiles] = useState(() => getStored('gmmtv_profiles', []));
  const [cfg, setCfg] = useState(() => getStored('gmmtv_cfg', { formUrl: '', targetDate: '', targetTime: '' }));
  const [fields, setFields] = useState([]);
  const [submitUrl, setSubmitUrl] = useState('');
  const [mapping, setMapping] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [status, setStatus] = useState('idle');
  const [submitErr, setSubmitErr] = useState('');
  const [submitTime, setSubmitTime] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [quickPaste, setQuickPaste] = useState('');
  const intervalRef = useRef(null);
  const submittedRef = useRef(false);

  useEffect(() => { localStorage.setItem('gmmtv_data', JSON.stringify(data)); }, [data]);
  useEffect(() => { localStorage.setItem('gmmtv_profiles', JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem('gmmtv_cfg', JSON.stringify(cfg)); }, [cfg]);

  useEffect(() => {
    if (!fields.length) return;
    const m = {};
    const nameFields = fields.filter(f => f.autoMap === 'firstName' || f.autoMap === 'lastName');

    for (const f of fields) {
      if (f.autoMap === 'email') m[f.entryId] = data.email;
      else if (f.autoMap === 'firstName') {
        // If there's only one name field in the form, combine First + Last
        m[f.entryId] = nameFields.length === 1 ? `${data.firstName} ${data.lastName}`.trim() : data.firstName;
      }
      else if (f.autoMap === 'lastName') m[f.entryId] = data.lastName;
      else if (f.autoMap === 'idNumber') m[f.entryId] = data.idNumber;
      else if (f.autoMap === 'phone') m[f.entryId] = data.phone;
      else if (f.autoMap === 'confirm') {
        const yesOpt = f.options.find(o => o.toLowerCase().includes('yes') || o.includes('ใช่'));
        m[f.entryId] = yesOpt || f.options[0] || 'Yes';
      }
    }
    setMapping(m);
  }, [fields, data]);

  useEffect(() => {
    if (step !== 4) return;
    submittedRef.current = false;
    intervalRef.current = setInterval(() => {
      const target = new Date(`${cfg.targetDate}T${cfg.targetTime}`);
      const diff = target - new Date();
      if (diff <= 0) {
        setCountdown({ h: 0, m: 0, s: 0, cs: 0 });
        clearInterval(intervalRef.current);
        if (!submittedRef.current) { submittedRef.current = true; doSubmit(); }
      } else {
        setCountdown({ h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000), cs: Math.floor((diff % 1000) / 10) });
      }
    }, 16);
    return () => clearInterval(intervalRef.current);
  }, [step, cfg, submitUrl, mapping]);

  const analyzeForm = async () => {
    setAnalyzing(true); setAnalyzeErr(''); setFields([]);
    try {
      const res = await fetch(`/api/form-info?url=${encodeURIComponent(cfg.formUrl)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setFields(json.fields);
      setSubmitUrl(json.submitUrl);
      setStep(3);
    } catch (e) { setAnalyzeErr(e.message); }
    setAnalyzing(false);
  };

  const doSubmit = async () => {
    const now = new Date();
    setTriggerTime(now.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'));
    setStatus('submitting');
    try {
      const body = new URLSearchParams();
      for (const [entryId, val] of Object.entries(mapping)) { if (val) body.append(entryId, val); }
      if (data.email) body.append('emailAddress', data.email);
      await fetch(submitUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      const done = new Date();
      setSubmitTime(done.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(done.getMilliseconds()).padStart(3, '0'));
      setStatus('success');
    } catch (e) { setStatus('error'); setSubmitErr(e.message); }
  };

  const typeLabel = (t) => ({ 0: 'Văn bản', 2: 'Radio', 4: 'Checkbox', 1: 'Đoạn văn', 9: 'Ngày', 10: 'Giờ' }[t] || `type ${t}`);
  const stateOf = (s) => s < step ? 'done' : s === step ? 'active' : 'idle';
  const mappedCount = fields.filter(f => f.autoMap && mapping[f.entryId]).length;
  const unmappedFields = fields.filter(f => !f.autoMap);

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
                  <label>Profiles đã lưu</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select style={{ flex: 2 }} value="" onChange={e => {
                      const p = profiles.find(x => x.idNumber === e.target.value);
                      if (p) setData(p);
                    }}>
                      <option value="">-- Chọn profile --</option>
                      {profiles.map(p => <option key={p.idNumber} value={p.idNumber}>{p.firstName} {p.lastName} ({p.idNumber})</option>)}
                    </select>
                    <button className="bsecondary" style={{ flex: 1 }} onClick={() => {
                      if (!data.idNumber) return;
                      if (profiles.find(p => p.idNumber === data.idNumber)) {
                        setProfiles(profiles.map(p => p.idNumber === data.idNumber ? data : p));
                      } else {
                        setProfiles([...profiles, data]);
                      }
                    }}>Lưu Profile</button>
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
                <label>Số CCCD / Hộ chiếu</label>
                <input type="text" placeholder="0123456789" value={data.idNumber} onChange={e => setData({ ...data, idNumber: e.target.value })} />
              </div>
              <div className="fgrp">
                <label>Số điện thoại</label>
                <input type="tel" placeholder="0912345678" value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} />
              </div>
              <div className="warn"><strong>⚠️ Lưu ý</strong>Hệ thống tự động VIẾT HOA và BỎ DẤU. Tên cần khớp hoàn toàn với CCCD/Hộ chiếu.</div>
              <button className="bprimary" onClick={() => { if (Object.values(data).every(v => v.trim())) setStep(2); else alert('Điền đầy đủ thông tin!'); }}>Tiếp theo →</button>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="card">
              <div className="ctitle"><div className="cicon">🔗</div>Link form &amp; Thời gian mở</div>
              <div className="fgrp">
                <label>Link Google Form</label>
                <input type="url" placeholder="https://docs.google.com/forms/d/..." value={cfg.formUrl} onChange={e => setCfg({ ...cfg, formUrl: e.target.value })} />
              </div>
              <div className="frow fgrp">
                <div>
                  <label>Ngày mở form</label>
                  <input type="date" value={cfg.targetDate} onChange={e => setCfg({ ...cfg, targetDate: e.target.value })} />
                </div>
                <div>
                  <label>Giờ mở form (VN)</label>
                  <input type="time" step="1" value={cfg.targetTime} onChange={e => setCfg({ ...cfg, targetTime: e.target.value })} />
                </div>
              </div>
              {analyzeErr && <div className="err-box">❌ {analyzeErr}</div>}
              {analyzing && <div className="loader-row"><div className="spin spin-sm"></div>Đang phân tích form...</div>}
              <div className="brow">
                <button className="bsecondary" onClick={() => setStep(1)}>← Quay lại</button>
                <button className="bprimary" disabled={analyzing} onClick={() => {
                  if (!cfg.formUrl || !cfg.targetDate || !cfg.targetTime) { alert('Điền đầy đủ!'); return; }
                  analyzeForm();
                }}>{analyzing ? 'Đang phân tích...' : '🔍 Phân tích Form →'}</button>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="card">
              <div className="ctitle">
                <div className="cicon">✅</div>
                Kiểm tra mapping dữ liệu
                <span className="gtag">{mappedCount}/{fields.length} auto</span>
                {unmappedFields.length > 0 && <span className="utag">{unmappedFields.length} cần chọn</span>}
              </div>

              <div className="fmap">
                <div className="fmap-hdr"><div>Trường trong Form</div><div /><div>Giá trị sẽ điền</div></div>
                {fields.map((f, i) => (
                  <div className="fmap-row" key={i}>
                    <div>
                      <div style={{ color: '#ccc', fontWeight: 600, fontSize: '12.5px' }}>{f.title}</div>
                      <div className="ftype">{typeLabel(f.type)}</div>
                    </div>
                    <div className="farr">→</div>
                    <div>
                      {f.autoMap ? (
                        <>
                          <div className="fval">{mapping[f.entryId] || '—'}</div>
                          <div className="ftype" style={{ color: '#ff69b4' }}>{FIELD_LABELS[f.autoMap]}</div>
                        </>
                      ) : (
                        <select value={mapping[f.entryId] || ''} onChange={e => setMapping({ ...mapping, [f.entryId]: e.target.value })} style={{ fontSize: '12px', padding: '6px 10px' }}>
                          <option value="">-- Chọn --</option>
                          {Object.entries(data).map(([k, v]) => <option key={k} value={v}>{FIELD_LABELS[k]}: {v}</option>)}
                          {f.options.map(o => <option key={o} value={o}>Option: {o}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(0,230,118,.05)', border: '1px solid rgba(0,230,118,.15)', borderRadius: '10px', padding: '11px 14px', fontSize: '12px', color: '#5a8a6a', marginBottom: '14px', lineHeight: '1.7' }}>
                🚀 Đúng giờ mở form, tool sẽ <strong style={{ color: '#00e676' }}>tự động POST trực tiếp lên Google Forms</strong> — không cần mở tab, không cần Tampermonkey, không cần bạn làm gì.
              </div>

              <div className="brow">
                <button className="bsecondary" onClick={() => setStep(2)}>← Sửa</button>
                <button className="bprimary" onClick={() => { setStatus('idle'); setStep(4); }}>🚀 Kích hoạt đếm ngược →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <div className="card">
              <div className="ctitle">
                <div className="cicon">⏱️</div>
                {status === 'idle' && <><span className="glowdot" />Đang chờ giờ mở form...</>}
                {status === 'submitting' && <><span className="glowdot" />Đang submit...</>}
                {status === 'success' && '🎉 Đã submit!'}
                {status === 'error' && '❌ Lỗi'}
              </div>

              {status === 'idle' && (
                <div style={{ background: 'rgba(255,255,255,.02)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#666', lineHeight: '1.7' }}>
                  🎯 Submit lúc <strong style={{ color: '#ff1493' }}>{cfg.targetDate} {cfg.targetTime}</strong>
                  &nbsp;·&nbsp; {fields.length} trường &nbsp;·&nbsp;
                  <strong style={{ color: '#00e676' }}>Zero interaction</strong>
                </div>
              )}

              {status === 'idle' && countdown && (
                <div className="cdwrap">
                  <div className="cddigits">
                    <div className="dblk"><span className="dval">{pad(countdown.h)}</span><div className="dlbl">Giờ</div></div>
                    <div className="dsep">:</div>
                    <div className="dblk"><span className="dval">{pad(countdown.m)}</span><div className="dlbl">Phút</div></div>
                    <div className="dsep">:</div>
                    <div className="dblk"><span className="dval">{pad(countdown.s)}</span><div className="dlbl">Giây</div></div>
                    <div className="dsep" style={{ fontSize: 'clamp(18px,4vw,28px)', paddingBottom: '20px' }}>.</div>
                    <div className="dblk csblk"><span className="dval">{pad(countdown.cs)}</span><div className="dlbl">cs</div></div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#444', marginTop: '8px' }}>Giữ tab này mở · Tự động submit khi hết giờ đếm ngược</div>
                </div>
              )}

              {status === 'submitting' && (
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div className="spin" style={{ margin: '0 auto 14px' }} />
                  <div style={{ color: '#ff69b4', fontWeight: 700, fontSize: '15px' }}>Đang gửi đến Google Forms server...</div>
                  <div style={{ fontSize: '11px', color: '#444', marginTop: '10px' }}>Triggered: {triggerTime}</div>
                </div>
              )}

              {status === 'success' && (
                <div className="success-box">
                  <span className="big">🎉</span>
                  <strong>ĐÃ SUBMIT THÀNH CÔNG!</strong>
                  <p>Dữ liệu đã được gửi lúc <strong style={{ color: '#00e676' }}>{submitTime}</strong><br />
                    Kiểm tra email <strong style={{ color: '#00e676' }}>{data.email}</strong> để nhận xác nhận từ GMMTV.</p>
                  <div className="ts">Timestamp: {submitTime}</div>
                </div>
              )}

              {status === 'error' && (
                <div className="err-box" style={{ padding: '14px' }}>
                  <strong>❌ Lỗi:</strong> {submitErr}
                  <button className="bprimary" style={{ marginTop: '10px' }} onClick={doSubmit}>Thử lại ngay</button>
                </div>
              )}

              {status !== 'success' && (
                <div style={{ background: 'rgba(255,255,255,.02)', borderRadius: '10px', padding: '12px 14px', marginTop: '14px' }}>
                  <div style={{ fontSize: '11px', color: '#444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Preview dữ liệu submit</div>
                  {[['Email', data.email], ['First Name', data.firstName], ['Last Name', data.lastName], ['ID / Passport', data.idNumber], ['Phone', data.phone]].map(([k, v]) => (
                    <div className="irow" key={k}><span className="ik">{k}</span><span className="iv">{v}</span></div>
                  ))}
                </div>
              )}

              {status !== 'success' && (
                <div className="brow" style={{ marginTop: '14px' }}>
                  <button className="bsecondary" onClick={() => { setStep(3); setStatus('idle'); submittedRef.current = false; clearInterval(intervalRef.current); }}>← Sửa</button>
                  {status === 'idle' && (
                    <button className="bprimary" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#888', boxShadow: 'none' }} onClick={doSubmit}>
                      ⚡ Test Submit ngay
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
