/**
 * LlmPolicyCard — admin control for the platform's own (paid) LLM.
 * Rendered in /admin/settings for admins only (returns null otherwise).
 *
 *   GET /api/platform/llm-policy  (admin view adds overrides, admin_bypass, updated_at/by)
 *   PUT /api/platform/llm-policy  partial: {system_llm_enabled, admin_bypass, external_hint,
 *                                          features: {<key>: true|false|null}}  (null = follow parent)
 *
 * Switches save immediately with optimistic UI and roll back on error; the hint is saved
 * with its own button.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Cpu, ShieldCheck, Save, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ADMIN_KEY = ['platform', 'llm-policy-admin'];

const detailText = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && d.message) return d.message;
  return e?.message || 'บันทึกไม่สำเร็จ';
};

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};

/** ตามนโยบายหลัก / เปิด / ปิด */
const Tri = ({ value, onChange, disabled, testId, label }) => {
  const opts = [
    { v: null, t: 'ตามนโยบายหลัก' },
    { v: true, t: 'เปิด' },
    { v: false, t: 'ปิด' },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-black/20 overflow-hidden text-xs shrink-0" data-testid={testId}>
      {opts.map((o) => {
        const active = (value === undefined ? null : value) === o.v;
        const tone = active
          ? o.v === true ? 'bg-[#0E5538] text-white' : o.v === false ? 'bg-[#C8102E] text-white' : 'bg-[#0A0A0A] text-white'
          : 'bg-white text-[#4A4A4A] hover:bg-black/5';
        return (
          <button
            key={String(o.v)} type="button" role="radio" aria-checked={active} disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`px-2.5 py-1.5 font-semibold border-l first:border-l-0 border-black/15 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10 ${tone}`}
            data-testid={`${testId}-${o.v === null ? 'inherit' : o.v ? 'on' : 'off'}`}
          >{o.t}</button>
        );
      })}
    </div>
  );
};

const LlmPolicyCard = () => {
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const headers = { Authorization: `Bearer ${token}` };
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState('');

  const q = useQuery({
    queryKey: ADMIN_KEY,
    enabled: isAdmin && !!token,
    staleTime: 0,
    retry: false,
    queryFn: async () => (await axios.get(`${API}/platform/llm-policy`, { headers })).data,
  });
  const p = q.data;

  useEffect(() => { if (p) setHint(p.external_hint || ''); }, [p?.external_hint]);

  if (!isAdmin) return null;

  const apply = (cur, patch) => {
    const next = { ...cur, ...patch };
    delete next.features; // features in the admin view are *effective*; overrides hold the raw values
    next.features = cur.features;
    if (patch.features) {
      const ov = { ...(cur.overrides || {}) };
      Object.entries(patch.features).forEach(([k, v]) => { if (v === null) delete ov[k]; else ov[k] = v; });
      next.overrides = ov;
    }
    return next;
  };

  const save = async (patch, okMsg) => {
    const before = qc.getQueryData(ADMIN_KEY);
    qc.setQueryData(ADMIN_KEY, (cur) => (cur ? apply(cur, patch) : cur));
    setSaving(true);
    try {
      await axios.put(`${API}/platform/llm-policy`, patch, { headers });
      if (okMsg) toast.success(okMsg);
      // Server is the truth (effective map, updated_by); also refresh what users see.
      await qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: ['platform', 'llm-policy'] });
    } catch (e) {
      qc.setQueryData(ADMIN_KEY, before);
      toast.error('บันทึกไม่สำเร็จ — คืนค่าเดิมแล้ว', { description: detailText(e) });
    } finally {
      setSaving(false);
    }
  };

  const overrides = p?.overrides || {};
  const groups = p?.registry?.groups || [];
  const featureMeta = p?.registry?.features || [];
  const on = p?.system_llm_enabled === true;
  const hintDirty = p && (hint.trim() !== (p.external_hint || '').trim());

  return (
    <Card className="p-4 sm:p-8 mb-6 bg-white/98 border-2 border-gray-300 shadow-xl" data-testid="llm-policy-card">
      <div className="flex items-center gap-2 sm:gap-3 mb-4">
        <Cpu className="w-6 h-6 sm:w-8 sm:h-8 text-[#E63946]" aria-hidden="true" />
        <h2 className="text-lg sm:text-2xl font-black text-gray-900">AI ของระบบ (LLM)</h2>
      </div>

      {q.isLoading && <div className="flex items-center gap-2 text-sm text-gray-600" role="status"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดนโยบาย…</div>}
      {q.isError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> โหลดนโยบาย AI ไม่ได้: {detailText(q.error)}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => q.refetch()}>ลองอีกครั้ง</Button>
        </div>
      )}

      {p && (
        <div className="space-y-6">
          {/* Master */}
          <div className={`rounded-lg border-2 p-4 ${on ? 'border-[#C8102E]/40 bg-[#C8102E]/5' : 'border-[#0E5538]/40 bg-[#0E5538]/5'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="llm-master" className="text-base font-bold">อนุญาตให้ผู้ใช้ใช้ AI ของระบบ</Label>
                <p className="mt-1 text-sm text-gray-700 leading-relaxed" data-testid="llm-master-explain">
                  {on
                    ? 'เปิดอยู่: ทุกครั้งที่ผู้ใช้กดปุ่ม AI ระบบจะเรียก LLM ของแพลตฟอร์ม และเกิดค่าใช้จ่ายจริงตามการใช้งาน'
                    : 'ปิดอยู่: ระบบจะไม่เรียก LLM เลย จึงไม่มีค่าใช้จ่าย LLM — ผู้ใช้ต้องคัดลอกพรอมต์ไปใช้ใน ChatGPT / Claude / Gemini ของตนเอง แล้ววางผลลัพธ์กลับมา (ใช้ได้ทุกฟังก์ชันเสมอ)'}
                </p>
              </div>
              <Switch id="llm-master" checked={on} disabled={saving} onCheckedChange={(v) => save({ system_llm_enabled: v }, v ? 'เปิด AI ของระบบแล้ว' : 'ปิด AI ของระบบแล้ว')} className="data-[state=unchecked]:bg-gray-400 data-[state=checked]:bg-[#C8102E]" data-testid="llm-master-switch" aria-label="อนุญาต AI ของระบบ" />
            </div>
          </div>

          {/* Groups */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">กำหนดรายกลุ่มฟังก์ชัน</h3>
            <p className="text-xs text-gray-600 mb-3">"ตามนโยบายหลัก" = ใช้ค่าจากสวิตช์ด้านบน · "เปิด/ปิด" = บังคับเฉพาะกลุ่มนั้น</p>
            <ul className="divide-y divide-black/10 border border-black/15 rounded-md bg-white">
              {groups.map((g) => (
                <li key={g.key} className="p-3" data-testid={`llm-group-${g.key}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{g.label}</span>
                    <Tri value={overrides[g.key] === undefined ? null : overrides[g.key]} disabled={saving} label={g.label}
                      onChange={(v) => save({ features: { [g.key]: v } })} testId={`llm-group-${g.key}-tri`} />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-600">รายฟังก์ชัน ({(g.features || []).length})</summary>
                    <ul className="mt-2 space-y-2">
                      {(g.features || []).map((k) => {
                        const meta = featureMeta.find((f) => f.key === k);
                        return (
                          <li key={k} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pl-2 border-l-2 border-black/10">
                            <span className="text-xs text-gray-800">{meta?.label || k} <code className="text-[10px] text-gray-500">{k}</code></span>
                            <Tri value={overrides[k] === undefined ? null : overrides[k]} disabled={saving} label={meta?.label || k}
                              onChange={(v) => save({ features: { [k]: v } })} testId={`llm-feature-${k}-tri`} />
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          {/* Admin bypass */}
          <div className="flex items-start justify-between gap-4 rounded-md border border-black/15 p-3">
            <div>
              <Label htmlFor="llm-bypass" className="text-sm font-bold flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> ผู้ดูแลระบบใช้ AI ของระบบได้เสมอ</Label>
              <p className="text-xs text-gray-600 mt-1">แม้ปิดสำหรับผู้ใช้ทั่วไป แอดมินยังทดสอบด้วย AI ของระบบได้ (ยังมีค่าใช้จ่ายเมื่อแอดมินใช้)</p>
            </div>
            <Switch id="llm-bypass" checked={p.admin_bypass === true} disabled={saving} onCheckedChange={(v) => save({ admin_bypass: v })} className="data-[state=unchecked]:bg-gray-400 data-[state=checked]:bg-[#0A0A0A]" data-testid="llm-bypass-switch" aria-label="แอดมินข้ามข้อจำกัด" />
          </div>

          {/* Hint */}
          <div>
            <Label htmlFor="llm-hint" className="text-sm font-bold">ข้อความแนะนำผู้ใช้</Label>
            <p className="text-xs text-gray-600 mb-1.5">แสดงให้ผู้ใช้เห็นเมื่อ AI ของระบบปิด เช่น "ใช้ ChatGPT ฟรีก็ได้ ถ้าติดปัญหาติดต่อ ..."</p>
            <Textarea id="llm-hint" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={2000} rows={3} placeholder="(ไม่บังคับ)" data-testid="llm-hint-input" />
            <Button type="button" size="sm" className="mt-2" disabled={saving || !hintDirty} onClick={() => save({ external_hint: hint.trim() }, 'บันทึกข้อความแนะนำแล้ว')} data-testid="llm-hint-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกข้อความ
            </Button>
          </div>

          <p className="text-xs text-gray-500" data-testid="llm-updated-by">
            {p.updated_at
              ? `แก้ไขล่าสุดโดย ${p.updated_by || 'ไม่ทราบ'} เมื่อ ${fmtWhen(p.updated_at)}`
              : `ยังไม่เคยตั้งค่า — ใช้ค่าเริ่มต้น: ${p.default_when_unset === true ? 'เปิด' : 'ปิด'}`}
          </p>
        </div>
      )}
    </Card>
  );
};

export default LlmPolicyCard;
