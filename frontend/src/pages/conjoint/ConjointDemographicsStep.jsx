import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';

/**
 * Demographics step shown before the choice tasks on the Conjoint survey.
 * The list of fields is driven by `demographics_to_capture` on the study,
 * so disabling demographics for a particular study just skips this step.
 *
 * We deliberately use coarse Thai bucket labels (e.g. age ranges, not exact
 * age) because they match what the Brand Equity filter bar can slice by —
 * keeping a single segment vocabulary across both tools.
 */

// Bucket label maps — kept short so they fit on mobile chip layouts.
const FIELD_OPTIONS = {
  age: [
    { value: '<18',    label: 'ต่ำกว่า 18' },
    { value: '18-24',  label: '18-24' },
    { value: '25-34',  label: '25-34' },
    { value: '35-44',  label: '35-44' },
    { value: '45-54',  label: '45-54' },
    { value: '55+',    label: '55+' },
  ],
  gender: [
    { value: 'female', label: 'หญิง' },
    { value: 'male',   label: 'ชาย' },
    { value: 'other',  label: 'อื่นๆ / ไม่ระบุ' },
  ],
  occupation: [
    { value: 'student',   label: 'นักเรียน / นิสิต' },
    { value: 'employed',  label: 'พนักงานบริษัท' },
    { value: 'gov',       label: 'ราชการ / รัฐวิสาหกิจ' },
    { value: 'business',  label: 'เจ้าของธุรกิจ' },
    { value: 'freelance', label: 'ฟรีแลนซ์' },
    { value: 'other',     label: 'อื่นๆ' },
  ],
  education: [
    { value: 'high_school', label: 'มัธยม / ปวช' },
    { value: 'diploma',     label: 'ปวส / อนุปริญญา' },
    { value: 'bachelor',    label: 'ปริญญาตรี' },
    { value: 'master',      label: 'ปริญญาโท' },
    { value: 'doctorate',   label: 'ปริญญาเอก' },
  ],
  region: [
    { value: 'bangkok',    label: 'กรุงเทพฯ / ปริมณฑล' },
    { value: 'central',    label: 'ภาคกลาง' },
    { value: 'north',      label: 'ภาคเหนือ' },
    { value: 'northeast',  label: 'ภาคตะวันออกเฉียงเหนือ' },
    { value: 'south',      label: 'ภาคใต้' },
    { value: 'east',       label: 'ภาคตะวันออก' },
    { value: 'west',       label: 'ภาคตะวันตก' },
  ],
  income: [
    { value: '<15k',   label: 'ต่ำกว่า 15,000 บาท' },
    { value: '15-30k', label: '15,000-30,000' },
    { value: '30-50k', label: '30,001-50,000' },
    { value: '50-80k', label: '50,001-80,000' },
    { value: '80k+',   label: 'มากกว่า 80,000' },
  ],
};

const FIELD_LABELS = {
  age: 'ช่วงอายุ',
  gender: 'เพศ',
  occupation: 'อาชีพ',
  education: 'การศึกษา',
  region: 'ภูมิภาคที่อยู่',
  income: 'รายได้ต่อเดือน',
};

const ConjointDemographicsStep = ({ fields, value, onChange, onContinue }) => {
  const fieldList = (fields || []).filter(f => FIELD_OPTIONS[f]);
  if (fieldList.length === 0) {
    // No demographics requested — just signal "ready to go" via parent.
    return null;
  }
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <Card
      className="p-6 sm:p-8 bg-white border-2 border-blue-200"
      data-testid="conjoint-demographics-step"
    >
      <div className="be-eyebrow mb-2">
        <span className="be-dot-sm" style={{ background: 'var(--be-blue)' }}/>
        STEP 1 / 2 · ABOUT YOU
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'IBM Plex Serif' }}>
        ข้อมูลผู้ตอบ
      </h2>
      <p className="text-sm text-gray-600 mb-6">
        ข้อมูลนี้ใช้เพื่อแยกวิเคราะห์ตามกลุ่ม (segment) เท่านั้น — ไม่ระบุตัวตน
        และไม่ถูกส่งให้บุคคลที่สาม
      </p>

      <div className="space-y-5">
        {fieldList.map(field => (
          <div key={field}>
            <div className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-2">
              {FIELD_LABELS[field]}
            </div>
            <div className="flex flex-wrap gap-2" data-testid={`demo-chips-${field}`}>
              {FIELD_OPTIONS[field].map(opt => {
                const active = value?.[field] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set(field, opt.value)}
                    data-testid={`demo-chip-${field}-${opt.value}`}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onContinue({})}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          data-testid="demo-skip-btn"
        >
          ข้ามขั้นตอนนี้
        </button>
        <Button
          onClick={() => onContinue(value)}
          data-testid="demo-continue-btn"
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          ดำเนินการต่อ
          <ChevronRight className="w-4 h-4 ml-1"/>
        </Button>
      </div>
    </Card>
  );
};

export default ConjointDemographicsStep;
