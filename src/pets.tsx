import { t, useLanguage, setLanguage, getLanguage } from './i18n';
import React, { useEffect, useId, useRef, useState } from 'react';
import { call, type Pet, type Pets } from './types';
import { actionVisual, appearanceDefaults } from '../shared/pet-format.mjs';
import { PetDesigner } from './pet-designer';
import { PetCanvas } from './pet-canvas';

export function PetAvatar({ pet, action = 'idle', playing = true }: { pet: Pet; action?: string; playing?: boolean }) {
  const [frame, setFrame] = useState(0), clip = useId().replaceAll(':', ''), visual = actionVisual(pet, action);
  useEffect(() => {
    setFrame(0); if (!visual || !playing) return;
    const count = visual.kind === 'sheet' ? visual.count || 1 : visual.files.length;
    if (count < 2) return;
    const timer = setInterval(() => setFrame(i => i + 1 >= count ? visual.loop || ['idle', 'sleep'].includes(action) ? 0 : count - 1 : i + 1), 1000 / visual.fps);
    return () => clearInterval(timer);
  }, [pet.id, action, JSON.stringify(visual), playing]);
  const assetUrl = (file: string) => 'mnote://pet?id=' + encodeURIComponent(pet.id) + '&file=' + encodeURIComponent(file);
  if (visual) {
    if (visual.kind === 'sheet') { const columns = visual.columns || 1, rows = visual.rows || 1, index = (visual.start || 0) + frame, column = index % columns, row = Math.floor(index / columns), ratio = visual.aspectRatio || 1; return <svg className="pet-sprite" role="img" aria-label={pet.name} data-frame={frame} viewBox={`0 0 ${ratio} 1`} preserveAspectRatio="xMidYMid meet"><svg width={ratio} height="1" overflow="hidden"><image href={assetUrl(visual.files[0])} width={columns * ratio} height={rows} x={-column * ratio} y={-row} preserveAspectRatio="none"/></svg></svg>; }
    return <img className="pet-image" data-frame={frame} draggable={false} src={assetUrl(visual.files[frame % visual.files.length])} alt={pet.name}/>;
  }
  const rabbit = pet.kind === 'rabbit', fox = pet.kind === 'fox', robot = pet.kind === 'robot', slime = pet.kind === 'slime', a = { ...appearanceDefaults, ...pet.appearance };
  const body = slime ? 'M31 150Q26 89 63 64Q106 28 143 77Q174 91 172 147Q177 177 143 173Q116 181 94 174Q38 185 31 150Z' : robot ? 'M48 58H152Q164 58 164 72V143Q164 160 146 160H54Q36 160 36 143V72Q36 58 48 58Z' : 'M35 110Q31 62 95 60Q163 54 165 111Q166 163 122 169H76Q35 165 35 110Z';
  const sleepy = action === 'sleep' || a.expression === 'sleepy', happy = ['pet', 'play', 'hello'].includes(action) || a.expression === 'happy', eyeColor = robot ? '#b5f5ea' : a.outline;
  return <svg className={'pet-art pet-' + pet.kind} viewBox={`${-Math.max(0,(a.bodyWidth-1)*95)} ${-Math.max(5,(a.bodyHeight*a.earSize-1)*140)} ${200+Math.max(0,(a.bodyWidth-1)*190)} ${200+Math.max(5,(a.bodyHeight*a.earSize-1)*140)+Math.max(0,(a.bodyHeight-1)*50)}`} role="img" aria-label={pet.name} style={{ '--pet-color': pet.color } as React.CSSProperties}>
    <defs><clipPath id={'body-' + clip}><path d={body}/></clipPath></defs><ellipse className="pet-shadow" cx="100" cy="183" rx="51" ry="8" fill="#242039" opacity=".13"/>
    <g transform={`translate(100 140) scale(${a.bodyWidth} ${a.bodyHeight}) translate(-100 -140)`}><g className="pet-body" stroke={a.outline} strokeWidth="3.2" strokeLinejoin="round" fill={pet.color}>
      {fox && <path className="pet-tail" d="M134 157Q192 170 179 98Q154 112 151 139Z"/>}
      {!robot && !slime && <g transform={`translate(100 73) scale(${a.earSize}) translate(-100 -73)`}><path d={rabbit ? 'M62 75Q28-12 57 15Q79 25 84 76' : 'M46 84 42 29 89 64'}/><path d={rabbit ? 'M114 76Q127-4 148 12Q164 37 139 81' : 'M112 62 161 30 158 87'}/><path fill={a.accent} stroke="none" d={rabbit ? 'M61 65Q45 12 58 28L75 69M125 69Q140 16 144 28L136 72' : 'M51 60 51 43 69 64M135 65 153 45 152 68'}/></g>}
      {robot && <><path d="M100 48V26" fill="none"/><circle cx="100" cy="23" r="7" fill={a.accent}/><rect x="25" y="82" width="15" height="37" rx="7"/><rect x="160" y="82" width="15" height="37" rx="7"/></>}
      <path d={body}/>
      <g clipPath={'url(#body-' + clip + ')'} stroke="none" opacity=".45" fill={a.accent}>{a.pattern === 'stripes' && <>{[55, 87, 119, 151].map(x => <path key={x} d={`M${x} 60l18 24-8 8-18-24Z`}/>)}</>}{a.pattern === 'spots' && <>{[[52,90],[144,87],[48,145],[145,150],[110,70]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="9"/>)}</>}</g>
      {!slime && <g className="pet-feet"><ellipse cx="68" cy="170" rx="19" ry="10"/><ellipse cx="132" cy="170" rx="19" ry="10"/></g>}
      {fox && <path d="M40 117Q63 93 99 131Q136 93 162 117Q160 163 102 164Q48 164 40 117" fill="#fff4e4" stroke="none"/>}
      {robot && <rect x="48" y="75" width="104" height="60" rx="17" fill="#293b52" stroke="none"/>}
      <g className="pet-eyes"><g transform={`translate(100 106) scale(${a.eyeSize}) translate(-100 -106)`} fill={eyeColor} stroke={eyeColor} strokeWidth="3" strokeLinecap="round">{[-1,1].map(side => { const x = 100 + side * 26 * a.eyeDistance; return sleepy ? <path key={side} d={`M${x - 6} 108h12`} fill="none"/> : happy ? <path key={side} d={`M${x - 6} 109q6-11 12 0`} fill="none"/> : <ellipse key={side} cx={x} cy="106" rx="5" ry="7" stroke="none"/>; })}</g></g>
      <g fill={a.accent} stroke="none" opacity=".85"><ellipse cx="57" cy="122" rx="10" ry="5"/><ellipse cx="143" cy="122" rx="10" ry="5"/></g>
      {action === 'feed' ? <ellipse className="pet-mouth" cx="100" cy="127" rx="8" ry="9" fill="#8a4263" stroke="none"/> : <path d={sleepy ? 'M96 127h8' : 'M93 123Q100 132 107 123'} fill="none" stroke={eyeColor} strokeLinecap="round"/>}
      {!robot && !slime && <path d="M30 116 51 120M29 129 49 127M151 120 172 116M151 127 171 130" fill="none" strokeWidth="2" strokeLinecap="round"/>}
      <path d="M76 151Q100 164 125 151" stroke="none" fill="#fff" opacity=".3"/>
      {a.accessory === 'glasses' && <g fill="none" strokeWidth="3"><rect x="55" y="94" width="35" height="25" rx="10"/><rect x="110" y="94" width="35" height="25" rx="10"/><path d="M90 103q10-6 20 0"/></g>}
      {a.accessory === 'bow' && <g fill={a.accent}><path d="m100 153-23-12v25Zm0 0 23-12v25Z"/><circle cx="100" cy="153" r="5"/></g>}
      {a.accessory === 'scarf' && <g fill={a.accent}><path d="M62 151q38 12 76-1v12q-38 11-76 0Z"/><path d="m112 159 18 2-5 23-18-5Z"/></g>}
      {a.accessory === 'crown' && <path d="m76 63-5-26 20 12 9-22 11 22 20-12-6 26Z" fill="#f2ce70"/>}
    </g></g><path d="m174 38 3 7 8 1-7 4 1 8-6-5-7 4 3-8-5-6 8 1Z" fill="#efc872"/>
  </svg>;
}

const defaultSpeech: Record<string, string[]> = { pet: ['再摸摸～', '今天也要好好写作呀。'], feed: ['啊呜，吃饱啦！'], play: ['一起玩一会儿！'], sleep: ['呼……晚安。'], hello: ['嗨，我在这里。'], drop: ['稳稳落地！'] };
export function PetDesktop() {
  useLanguage();
  useEffect(() => { const update = () => void call("petLocale").then(s => setLanguage(s.language || "system", s.systemLanguage || navigator.language)); update(); return window.notebook.onPreferences(update); }, []);
  const [state, setState] = useState<Pets | null>(null), [message, setMessage] = useState(''), [action, setAction] = useState('idle'), [nonce, setNonce] = useState(0), [error, setError] = useState('');
  const stateRef = useRef(state), currentAction = useRef(action), actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null), speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null), clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null), pointer = useRef<{x:number;y:number;dragged:boolean;ready:Promise<any>} | null>(null), frame = useRef(0);
  stateRef.current = state; currentAction.current = action;
  const interactRef = useRef<(name: string) => void>(() => {});
  interactRef.current = name => {
    const s = stateRef.current, pet = s?.items.find(p => p.id === s.selected); if (!pet) return;
    if (!['idle','pet','feed','play','sleep','hello','drag','drop'].includes(name) && !pet.actions?.[name]) return;
    if (actionTimer.current) clearTimeout(actionTimer.current); if (speechTimer.current) clearTimeout(speechTimer.current);
    setAction(name); setNonce(n => n + 1);
    const lines = pet.behavior?.messages?.[name] ?? defaultSpeech[name] ?? []; const line = lines[Math.floor(Math.random() * lines.length)] || ''; setMessage(pet.behavior?.showSpeech === false ? '' : pet.behavior?.messages?.[name] ? line : t(line));
    speechTimer.current = setTimeout(() => setMessage(''), 2600);
    if (!['idle', 'sleep', 'drag'].includes(name)) actionTimer.current = setTimeout(() => { setAction('idle'); setNonce(n => n + 1); }, pet.actions?.[name]?.duration || 1800);
  };
  useEffect(() => {
    document.documentElement.dataset.pet = 'true';
    const update = () => void call<Pets>('petState').then(setState).catch(e => setError(e.message)); update();
    const a = window.notebook.onPetUpdate(update), b = window.notebook.onPetAction(value => interactRef.current(value.action));
    return () => { a(); b(); if (actionTimer.current) clearTimeout(actionTimer.current); if (speechTimer.current) clearTimeout(speechTimer.current); if (clickTimer.current) clearTimeout(clickTimer.current); cancelAnimationFrame(frame.current); };
  }, []);
  const pet = state?.items.find(p => p.id === state.selected);
  useEffect(() => { if (actionTimer.current) clearTimeout(actionTimer.current); if (clickTimer.current) clearTimeout(clickTimer.current); setAction('idle'); setMessage(''); pointer.current = null; }, [pet?.id]);
  const request = (command: string, args = {}) => call(command, args).catch(e => setError(e.message));
  const release = (event: React.PointerEvent<HTMLButtonElement>, canceled = false) => {
    const p = pointer.current; pointer.current = null; cancelAnimationFrame(frame.current); frame.current = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!p) return;
    void p.ready.then(() => request('petDrag', { phase: p.dragged ? 'end' : 'cancel' }));
    if (p.dragged) interactRef.current('drop');
    else if (!canceled) { if (clickTimer.current) clearTimeout(clickTimer.current); if (event.detail >= 2) interactRef.current(pet?.behavior?.doubleClick || 'play'); else clickTimer.current = setTimeout(() => interactRef.current(currentAction.current === 'sleep' ? 'idle' : pet?.behavior?.click || 'pet'), 240); }
  };
  const effect = ({ pet: '♥', feed: '🍪', play: '♫', sleep: 'Zzz', hello: '✦', drop: '✧', drag: '〰' } as Record<string, string>)[action];
  return <div className={'desktop-pet ' + (state?.motion ? 'pet-animated ' : '') + 'pet-action-' + action} data-action={action} onContextMenu={e => { e.preventDefault(); if (clickTimer.current) clearTimeout(clickTimer.current); pointer.current = null; void request('petContextMenu'); }}>
    {(message || error) && <div className="pet-bubble" role="status">{error ? t(error) : message}</div>}
    {pet && <button className="pet-figure" aria-label={getLanguage() === 'zh-CN' ? '与' + pet.name + '互动' : 'Interact with ' + pet.name} title={t("点击互动，双击玩耍；按住拖动，右键打开菜单")} onKeyDown={e => { if (e.key === 'ContextMenu' || e.shiftKey && e.key === 'F10') { e.preventDefault(); void request('petContextMenu'); } if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); interactRef.current(pet.behavior?.click || 'pet'); } }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { x: e.screenX, y: e.screenY, dragged: false, ready: request('petDrag', { phase: 'start' }) }; }} onPointerMove={e => { const p = pointer.current; if (!p) return; if (!p.dragged && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 6) { p.dragged = true; if (clickTimer.current) clearTimeout(clickTimer.current); interactRef.current('drag'); } if (p.dragged && !frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (pointer.current) void p.ready.then(() => request('petDrag', { phase: 'move' })); }); }} onPointerUp={e => release(e)} onPointerCancel={e => release(e, true)} onDoubleClick={e => { e.preventDefault(); if (clickTimer.current) clearTimeout(clickTimer.current); interactRef.current(pet.behavior?.doubleClick || 'play'); }}><div className="pet-motion" key={nonce}><PetAvatar pet={pet} action={action} playing={state?.motion !== false || action !== 'idle'}/></div>{effect && <span className="pet-effect" key={'effect-' + nonce} aria-hidden="true">{effect}</span>}</button>}
  </div>;
}

export function PetsPanel({ state, onChange, report }: { state?: Pets; onChange: (s: Pets) => void; report: (error: string) => void }) {
  const [busy, setBusy] = useState(false), [editing, setEditing] = useState<Pet | null>(null), [deleting, setDeleting] = useState(''), [drawing, setDrawing] = useState(false), [canvasTarget, setCanvasTarget] = useState<{id: string; action: string; name: string} | null>(null), [notice, setNotice] = useState('');
  useEffect(() => { if (!state) void call<Pets>('petState').then(onChange).catch(e => report(e.message)); }, []);
  const run = async (command: string, args = {}, close = true) => { setBusy(true); try { const value = await call<Pets | null>(''+command, args); if (value) { onChange(value); if (close) { setEditing(null); setDeleting(''); setDrawing(false); } } } catch (e) { report((e as Error).message); } finally { setBusy(false); } };
  const drawAction = async (pet: Pet, action: string) => { setBusy(true); try { const value = await call<Pets>('petEdit', pet); onChange(value); setCanvasTarget({id:pet.id, action, name:pet.name}); setDrawing(true); setEditing(null); } catch (e) { report((e as Error).message); } finally { setBusy(false); } };
  const exportPet = async (id?: string) => { setBusy(true); try { const value = await call(id ? 'petExport' : 'petTemplate', { id }); if (value) setNotice('宠物包已导出。包内含素材、配置和制作指南，可以直接分享。'); } catch (e) { report((e as Error).message); } finally { setBusy(false); } };
  return <section className="pets-panel" id="pet-settings"><label className="field">{t("桌面宠物")}</label><p className="hint">{t("点击摸摸、双击玩耍，按住拖动，右键喂食、睡觉、切换伙伴或管理。功能都在右键菜单，身上不再放按钮和名字。")}</p>
    <label className="integration-toggle"><span><b>{t("开启桌面宠物")}</b><small>{t("关闭风车笔记时一起退出，重新打开后恢复。")}</small></span><input type="checkbox" aria-label={t("开启桌面宠物")} checked={!!state?.enabled} disabled={busy || !state?.items.length} onChange={e => void run('petSettings', { enabled: e.target.checked }, false)}/></label>
    <div className="pet-library">{state?.items.map(pet => <article className={'pet-card' + (state.selected === pet.id ? ' selected' : '')} key={pet.id}>
      <button className="pet-select" aria-label={t('选择宠物：' + pet.name)} aria-pressed={state.selected === pet.id} disabled={busy} onClick={() => void run('petSettings', { selected: pet.id }, false)}><PetAvatar pet={pet} playing={false}/><b>{pet.name}</b><small>{state.selected === pet.id ? t('正在陪伴') : t('选择这个伙伴')}</small></button>
      <div className="pet-card-actions"><button disabled={busy} onClick={() => { setEditing(structuredClone(pet)); setDeleting(''); setDrawing(false); }} aria-label={t('编辑宠物：' + pet.name)}>{t("定制")}</button><button disabled={busy} aria-label={t('导出宠物：' + pet.name)} onClick={() => void exportPet(pet.id)}>{t("导出")}</button><button disabled={busy} onClick={() => { setDeleting(pet.id); setEditing(null); }} aria-label={t('删除宠物：' + pet.name)}>{t("删除")}</button></div>
      {deleting === pet.id && <div className="inline-confirm"><span>{t("删除「")}{pet.name}{t("」及其素材副本？")}</span><button disabled={busy} onClick={() => void run('petDelete', { id: pet.id })}>{t("确认删除宠物")}</button><button onClick={() => setDeleting('')}>{t("取消")}</button></div>}
    </article>)}</div>
    {!state?.items.length && <p className="hint">{t("宠物库还是空的，制作一个伙伴吧。")}</p>}
    <div className="preference-actions"><button disabled={busy} onClick={() => { setDeleting(''); setDrawing(false); setEditing({ id: '', kind: 'cat', name: '我的小伙伴', color: '#a899ed' }); }}>{t("＋ 新增宠物")}</button><button disabled={busy} onClick={() => { setCanvasTarget(null); setDrawing(true); setEditing(null); }}>{t("打开像素画板")}</button><button disabled={busy} onClick={() => void run('petImport')}>{t("导入图片 / GIF")}</button><button disabled={busy} onClick={() => void run('petImportPackage')}>{t("导入宠物包")}</button><button disabled={busy} onClick={() => void run('petImportFolder')}>{t("导入宠物文件夹")}</button><button disabled={busy} onClick={() => void exportPet()}>{t("导出制作模板")}</button></div>
    {notice && <p className="hint" role="status">{t(notice)}</p>}
    {editing && <PetDesigner key={editing.id || 'new'} pet={editing} busy={busy} onSave={pet => void run(pet.id ? 'petEdit' : 'petAdd', pet)} onCancel={() => setEditing(null)} onChanged={onChange} onDraw={(pet, action) => void drawAction(pet, action)} report={report}/>}
    {drawing && <><p className="hint">{canvasTarget ? t(`正在为「${canvasTarget.name}」绘制 ${canvasTarget.action} 动作，保存后替换该动作。`) : t('自由绘制一个新伙伴。')}</p><PetCanvas busy={busy} onSave={(bytes, name) => void run('petDrawing', { bytes, name, id: canvasTarget?.id, action: canvasTarget?.action })} onCancel={() => setDrawing(false)}/></>}
    <label className="field">{t("宠物大小 ")}<span>{state?.size || 160}px</span><input type="range" min="96" max="256" step="8" aria-label={t("宠物大小")} value={state?.size || 160} disabled={busy} onChange={e => void run('petSettings', { size: Number(e.target.value) }, false)}/></label><label className="integration-toggle"><span><b>{t("待机动画")}</b><small>{t("呼吸、眨眼和待机素材轮播；手动互动仍可播放。")}</small></span><input type="checkbox" aria-label={t("宠物待机动画")} checked={state?.motion !== false} disabled={busy} onChange={e => void run('petSettings', { motion: e.target.checked }, false)}/></label><button className="organize-button" disabled={busy} onClick={() => void run('petSettings', { resetPosition: true }, false)}>{t("找回宠物 / 重置位置")}</button><p className="hint">{t("支持 PNG、JPEG、WebP、GIF、逐帧图片和规则网格精灵图。单图不超过 10 MB、4096 × 4096；整包不超过 80 MB。素材复制到宠物库，可导出分享；模板中附完整制作指南。")}</p>
  </section>;
}
