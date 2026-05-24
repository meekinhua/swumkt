import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Users, Info } from 'lucide-react';

/**
 * Inline config widget for choosing which demographic fields the public
 * survey will collect. The list of fields is intentionally a fixed
 * whitelist that matches the chip labels in `ConjointDemographicsStep`
 * and the buckets understood by the `BeFilterBar` segment selector.
 */
const FIELDS = [
  { key: 'age',        label: 'ช่วงอายุ',        hint: '<18 / 18-24 / 25-34 / 35-44 / 45-54 / 55+' },
  { key: 'gender',     label: 'เพศ',             hint: 'หญิง / ชาย / อื่นๆ' },
  { key: 'occupation', label: 'อาชีพ',           hint: 'นิสิต / พนักงาน / ราชการ / เจ้าของธุรกิจ / ฟรีแลนซ์' },
  { key: 'education',  label: 'การศึกษา',        hint: 'มัธยม / ปวส / ป.ตรี / ป.โท / ป.เอก' },
  { key: 'region',     label: 'ภูมิภาคที่อยู่',  hint: 'กทม / ภาคกลาง / เหนือ / อีสาน / ใต้ / ตะวันออก / ตะวันตก' },
  { key: 'income',     label: 'รายได้ต่อเดือน',  hint: '< 15K / 15-30K / 30-50K / 50-80K / 80K+' },
];

const ConjointDemographicsConfig = ({ studyId, token, initialValue, disabled, onChange }) => {
  const [selected, setSelected] = useState(() => new Set(initialValue || []));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync when parent reloads study (e.g. after page-level save).
  useEffect(() => {
    setSelected(new Set(initialValue || []));
    setDirty(false);
  }, [JSON.stringify(initialValue || [])]); // eslint-disable-line

  const toggle = (key) => {
    if (disabled) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      setDirty(true);
      return next;
    });
  };

  const handleSave = async () => {
    if (!studyId || !token) return;
    const list = FIELDS.map(f => f.key).filter(k => selected.has(k));
    setSaving(true);
    try {
      await axios.put(
        `${API}/conjoint/studies/${studyId}/demographics-config`,
        { demographics_to_capture: list },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDirty(false);
      toast.success('บันทึกการตั้งค่าข้อมูลผู้ตอบสำเร็จ');
      if (onChange) onChange(list);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'ไม่สามารถบันทึกได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 bg-white border-2 border-indigo-100" data-testid="conjoint-demo-config">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-indigo-600"/>
            ข้อมูลผู้ตอบที่จะเก็บ
          </h3>
          <p className="text-xs text-gray-500">
            เลือกข้อมูลที่อยากใช้แบ่ง segment ในหน้าผลวิเคราะห์ — ไม่เลือกอะไรเลย = ข้ามขั้นตอนนี้ในแบบสอบถาม
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={disabled || !dirty || saving}
          size="sm"
          data-testid="demo-config-save-btn"
          className={`bg-indigo-600 hover:bg-indigo-700 text-white ${dirty ? 'ring-2 ring-orange-300 animate-pulse' : ''}`}
        >
          <Save className="w-3.5 h-3.5 mr-1.5"/>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {FIELDS.map(f => {
          const active = selected.has(f.key);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => toggle(f.key)}
              disabled={disabled}
              data-testid={`demo-config-toggle-${f.key}`}
              className={`text-left px-3 py-2 rounded-lg border transition-all ${
                active
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  active ? 'bg-indigo-600 border-indigo-700' : 'border-gray-300'
                }`}>
                  {active && <span className="text-white text-[10px]">✓</span>}
                </div>
                <div className="font-medium text-sm">{f.label}</div>
              </div>
              <div className="text-[11px] text-gray-500 mt-1 ml-6">{f.hint}</div>
            </button>
          );
        })}
      </div>

      {disabled && (
        <div className="mt-3 text-xs text-amber-700 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5"/>
          ไม่สามารถเปลี่ยนได้หลังเริ่มสำรวจ — ข้อมูลที่ผู้ตอบเก่าให้แล้วจะยังอยู่
        </div>
      )}
    </Card>
  );
};

export default ConjointDemographicsConfig;
