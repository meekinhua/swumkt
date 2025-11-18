import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DemographicsForm = ({ initialData = {}, onSave, onCancel, allowIncomeTypeChoice = false }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    birth_sex: initialData.birth_sex || '',
    gender_identity: initialData.gender_identity || '',
    date_of_birth: initialData.date_of_birth || '',
    education: initialData.education || '',
    occupation: initialData.occupation || '',
    income_type: initialData.income_type || 'range',
    income_value: initialData.income_value || '',
    marital_status: initialData.marital_status || '',
    province: initialData.province || '',
    region: initialData.region || ''
  });

  const [age, setAge] = useState(null);

  useEffect(() => {
    if (formData.date_of_birth) {
      const birthDate = new Date(formData.date_of_birth);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setAge(calculatedAge);
    }
  }, [formData.date_of_birth]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const incomeRanges = [
    { value: '<10000', label: t('demographics.income.below10k', 'ต่ำกว่า 10,000 บาท') },
    { value: '10001-15000', label: '10,001 - 15,000 บาท' },
    { value: '15001-20000', label: '15,001 - 20,000 บาท' },
    { value: '20001-25000', label: '20,001 - 25,000 บาท' },
    { value: '25001-30000', label: '25,001 - 30,000 บาท' },
    { value: '30001-40000', label: '30,001 - 40,000 บาท' },
    { value: '40001-50000', label: '40,001 - 50,000 บาท' },
    { value: '50001-75000', label: '50,001 - 75,000 บาท' },
    { value: '75001-100000', label: '75,001 - 100,000 บาท' },
    { value: '100001-150000', label: '100,001 - 150,000 บาท' },
    { value: '>150000', label: t('demographics.income.above150k', 'มากกว่า 150,000 บาท') }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Birth Sex */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.birthSex', 'เพศเกิด')} <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.birth_sex}
          onChange={(e) => handleChange('birth_sex', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
          required
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="male">{t('demographics.male', 'ชาย')}</option>
          <option value="female">{t('demographics.female', 'หญิง')}</option>
        </select>
      </div>

      {/* Gender Identity */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.genderIdentity', 'เพศสภาพ')}
        </label>
        <select
          value={formData.gender_identity}
          onChange={(e) => handleChange('gender_identity', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="male">{t('demographics.male', 'ชาย')}</option>
          <option value="female">{t('demographics.female', 'หญิง')}</option>
          <option value="lgbtq+">{t('demographics.lgbtq', 'LGBTQ+')}</option>
          <option value="other">{t('demographics.other', 'อื่นๆ')}</option>
          <option value="prefer_not_to_say">{t('demographics.preferNotToSay', 'ไม่ระบุ')}</option>
        </select>
      </div>

      {/* Date of Birth */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.dateOfBirth', 'วันเกิด')} <span className="text-red-500">*</span>
          {age !== null && <span className="ml-2 text-sm text-gray-500">({age} {t('demographics.yearsOld', 'ปี')})</span>}
        </label>
        <input
          type="date"
          value={formData.date_of_birth}
          onChange={(e) => handleChange('date_of_birth', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
          required
        />
      </div>

      {/* Education */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.education', 'การศึกษาสูงสุด')}
        </label>
        <select
          value={formData.education}
          onChange={(e) => handleChange('education', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="below_highschool">{t('demographics.belowHighschool', 'ต่ำกว่า ม.6')}</option>
          <option value="highschool_vocational">{t('demographics.highschool', 'ม.6/ปวช./ปวส.')}</option>
          <option value="bachelor">{t('demographics.bachelor', 'ปริญญาตรี')}</option>
          <option value="master">{t('demographics.master', 'ปริญญาโท')}</option>
          <option value="phd">{t('demographics.phd', 'ปริญญาเอก')}</option>
        </select>
      </div>

      {/* Occupation */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.occupation', 'อาชีพ')}
        </label>
        <select
          value={formData.occupation}
          onChange={(e) => handleChange('occupation', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="student">{t('demographics.student', 'นักเรียน/นักศึกษา')}</option>
          <option value="government">{t('demographics.government', 'ข้าราชการ')}</option>
          <option value="private_company">{t('demographics.privateCompany', 'พนักงานบริษัทเอกชน')}</option>
          <option value="business_owner">{t('demographics.businessOwner', 'ธุรกิจส่วนตัว')}</option>
          <option value="freelance">{t('demographics.freelance', 'Freelance')}</option>
          <option value="unemployed">{t('demographics.unemployed', 'ว่างงาน')}</option>
          <option value="retired">{t('demographics.retired', 'เกษียณ')}</option>
          <option value="other">{t('demographics.other', 'อื่นๆ')}</option>
        </select>
      </div>

      {/* Income */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.income', 'รายได้ต่อเดือน')}
        </label>
        
        {allowIncomeTypeChoice && (
          <div className="mb-3 flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="range"
                checked={formData.income_type === 'range'}
                onChange={(e) => handleChange('income_type', e.target.value)}
                className="mr-2"
              />
              {t('demographics.selectRange', 'เลือกช่วง')}
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="freetext"
                checked={formData.income_type === 'freetext'}
                onChange={(e) => handleChange('income_type', e.target.value)}
                className="mr-2"
              />
              {t('demographics.enterAmount', 'กรอกจำนวน')}
            </label>
          </div>
        )}
        
        {formData.income_type === 'range' ? (
          <select
            value={formData.income_value}
            onChange={(e) => handleChange('income_value', e.target.value)}
            className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
          >
            <option value="">{t('demographics.select', 'เลือก')}</option>
            {incomeRanges.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={formData.income_value}
            onChange={(e) => handleChange('income_value', e.target.value)}
            placeholder={t('demographics.incomePlaceholder', 'กรอกรายได้โดยประมาณ (บาท)')}
            className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
          />
        )}
      </div>

      {/* Marital Status */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.maritalStatus', 'สถานภาพ')}
        </label>
        <select
          value={formData.marital_status}
          onChange={(e) => handleChange('marital_status', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="single">{t('demographics.single', 'โสด')}</option>
          <option value="married">{t('demographics.married', 'สมรส')}</option>
          <option value="divorced">{t('demographics.divorced', 'หย่า')}</option>
          <option value="widowed">{t('demographics.widowed', 'หม้าย')}</option>
        </select>
      </div>

      {/* Province */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.province', 'จังหวัด')}
        </label>
        <input
          type="text"
          value={formData.province}
          onChange={(e) => handleChange('province', e.target.value)}
          placeholder={t('demographics.provincePlaceholder', 'กรอกจังหวัด')}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        />
      </div>

      {/* Region */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {t('demographics.region', 'ภูมิภาค')}
        </label>
        <select
          value={formData.region}
          onChange={(e) => handleChange('region', e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-[#00A9CE] focus:outline-none"
        >
          <option value="">{t('demographics.select', 'เลือก')}</option>
          <option value="north">{t('demographics.north', 'ภาคเหนือ')}</option>
          <option value="northeast">{t('demographics.northeast', 'ภาคตะวันออกเฉียงเหนือ')}</option>
          <option value="central">{t('demographics.central', 'ภาคกลาง')}</option>
          <option value="south">{t('demographics.south', 'ภาคใต้')}</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button type="submit" className="flex-1 bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold">
          {t('common.save', 'บันทึก')}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            {t('common.cancel', 'ยกเลิก')}
          </Button>
        )}
      </div>
    </form>
  );
};

export default DemographicsForm;
