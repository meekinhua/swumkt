import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Share2 } from 'lucide-react';

const ShareConjointModal = ({ 
  isOpen, 
  onClose, 
  onShare, 
  conjointData,
  loading 
}) => {
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    researchType: 'quantitative',
    sampleSize: '',
    dataSource: '',
    collectionMethod: '',
    researchDate: new Date().toISOString().split('T')[0],
    additionalNotes: ''
  });

  // Auto-fill form when modal opens
  useEffect(() => {
    if (isOpen && conjointData) {
      // Extract suggested values
      const suggestedTitle = conjointData.study?.title || 'Conjoint Analysis Results';
      const suggestedSampleSize = `${conjointData.respondent_count || 0} respondents`;
      
      setFormData({
        title: suggestedTitle,
        researchType: 'quantitative', // Conjoint is typically quantitative
        sampleSize: suggestedSampleSize,
        dataSource: 'Conjoint Survey',
        collectionMethod: 'Choice-Based Conjoint (CBC) online survey',
        researchDate: new Date().toISOString().split('T')[0],
        additionalNotes: ''
      });
    }
  }, [isOpen, conjointData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.title.trim() || !formData.dataSource.trim() || !formData.collectionMethod.trim()) {
      alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }
    
    onShare(formData);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Share2 className="w-6 h-6 text-blue-600" />
            แชร์ผลการวิจัยเป็นเนื้อหา
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            แชร์ผลการวิเคราะห์ Conjoint Analysis เป็นเนื้อหาวิจัยที่สามารถแชร์และค้นหาได้
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-sm font-semibold text-gray-700">
              หัวข้อการวิจัย <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="เช่น: การศึกษาความต้องการของผู้บริโภคต่อสมาร์ทโฟน"
              className="mt-1"
              required
            />
          </div>

          {/* Research Type */}
          <div>
            <Label htmlFor="researchType" className="text-sm font-semibold text-gray-700">
              ประเภทการวิจัย
            </Label>
            <select
              id="researchType"
              value={formData.researchType}
              onChange={(e) => handleChange('researchType', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="quantitative">Quantitative (เชิงปริมาณ)</option>
              <option value="qualitative">Qualitative (เชิงคุณภาพ)</option>
              <option value="mixed">Mixed Methods (ผสมผสาน)</option>
            </select>
          </div>

          {/* Sample Size */}
          <div>
            <Label htmlFor="sampleSize" className="text-sm font-semibold text-gray-700">
              ขนาดกลุ่มตัวอย่าง
            </Label>
            <Input
              id="sampleSize"
              value={formData.sampleSize}
              onChange={(e) => handleChange('sampleSize', e.target.value)}
              placeholder="เช่น: 200 respondents"
              className="mt-1"
            />
          </div>

          {/* Data Source */}
          <div>
            <Label htmlFor="dataSource" className="text-sm font-semibold text-gray-700">
              แหล่งข้อมูล <span className="text-red-500">*</span>
            </Label>
            <Input
              id="dataSource"
              value={formData.dataSource}
              onChange={(e) => handleChange('dataSource', e.target.value)}
              placeholder="เช่น: Online survey, Field research"
              className="mt-1"
              required
            />
          </div>

          {/* Collection Method */}
          <div>
            <Label htmlFor="collectionMethod" className="text-sm font-semibold text-gray-700">
              วิธีการเก็บข้อมูล <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="collectionMethod"
              value={formData.collectionMethod}
              onChange={(e) => handleChange('collectionMethod', e.target.value)}
              placeholder="เช่น: Choice-Based Conjoint (CBC) survey with 12 choice sets"
              rows={3}
              className="mt-1"
              required
            />
          </div>

          {/* Research Date */}
          <div>
            <Label htmlFor="researchDate" className="text-sm font-semibold text-gray-700">
              วันที่ทำการวิจัย
            </Label>
            <Input
              id="researchDate"
              type="date"
              value={formData.researchDate}
              onChange={(e) => handleChange('researchDate', e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Additional Notes */}
          <div>
            <Label htmlFor="additionalNotes" className="text-sm font-semibold text-gray-700">
              หมายเหตุเพิ่มเติม
            </Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e) => handleChange('additionalNotes', e.target.value)}
              placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับการวิจัย..."
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  กำลังแชร์...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  แชร์เป็นเนื้อหา
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ShareConjointModal;
