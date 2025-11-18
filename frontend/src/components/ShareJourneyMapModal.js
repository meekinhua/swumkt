import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Share2, X } from 'lucide-react';

const ShareJourneyMapModal = ({ 
  isOpen, 
  onClose, 
  onShare, 
  journeyMapData,
  loading 
}) => {
  const { t } = useTranslation();
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    researchType: 'qualitative',
    sampleSize: '',
    dataSource: '',
    collectionMethod: '',
    researchDate: new Date().toISOString().split('T')[0],
    additionalNotes: ''
  });

  // Auto-fill form when modal opens
  useEffect(() => {
    if (isOpen && journeyMapData) {
      // Extract suggested values from journey map data
      const suggestedTitle = journeyMapData.analysis_summary
        ? journeyMapData.analysis_summary.split('\n')[0].substring(0, 100)
        : 'Customer Journey Map Analysis';
      
      // Extract sample size from raw data if mentioned
      const sampleSizeMatch = journeyMapData.rawData?.match(/(\d+)\s*(participants|respondents|customers|users|people|คน|ผู้เข้าร่วม)/i);
      const suggestedSampleSize = sampleSizeMatch ? `${sampleSizeMatch[1]} ${sampleSizeMatch[2]}` : '';
      
      // Suggest data source based on raw data content
      let suggestedDataSource = '';
      if (journeyMapData.rawData?.toLowerCase().includes('interview')) {
        suggestedDataSource = 'Customer interviews';
      } else if (journeyMapData.rawData?.toLowerCase().includes('survey')) {
        suggestedDataSource = 'Online surveys';
      } else if (journeyMapData.rawData?.toLowerCase().includes('review')) {
        suggestedDataSource = 'Customer reviews';
      } else {
        suggestedDataSource = 'Multiple sources';
      }
      
      // Suggest collection method from research context
      const suggestedMethod = journeyMapData.researchContext || 'In-depth interviews and observations';
      
      setFormData({
        title: suggestedTitle,
        researchType: 'qualitative', // Default to qualitative for Phase 1
        sampleSize: suggestedSampleSize,
        dataSource: suggestedDataSource,
        collectionMethod: suggestedMethod,
        researchDate: new Date().toISOString().split('T')[0],
        additionalNotes: ''
      });
    }
  }, [isOpen, journeyMapData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.title.trim() || !formData.dataSource.trim() || !formData.collectionMethod.trim()) {
      alert(t('common.error') + ': Please fill in all required fields');
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
            <Share2 className="w-6 h-6 text-[#00A9CE]" />
            {t('customerJourney.shareModal.title')}
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {t('customerJourney.shareModal.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Content Title */}
          <div>
            <Label htmlFor="title" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.contentTitle')}
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder={t('customerJourney.shareModal.contentTitlePlaceholder')}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
              required
            />
          </div>

          {/* Research Type */}
          <div>
            <Label className="text-gray-800 font-bold mb-2 block">
              {t('customerJourney.shareModal.researchType')}
            </Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="researchType"
                  value="qualitative"
                  checked={formData.researchType === 'qualitative'}
                  onChange={(e) => handleChange('researchType', e.target.value)}
                  className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                />
                <span className="text-gray-700 font-medium">{t('customerJourney.shareModal.qualitative')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="researchType"
                  value="quantitative"
                  checked={formData.researchType === 'quantitative'}
                  onChange={(e) => handleChange('researchType', e.target.value)}
                  className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                />
                <span className="text-gray-700 font-medium">{t('customerJourney.shareModal.quantitative')}</span>
              </label>
            </div>
          </div>

          {/* Sample Size */}
          <div>
            <Label htmlFor="sampleSize" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.sampleSize')}
            </Label>
            <Input
              id="sampleSize"
              value={formData.sampleSize}
              onChange={(e) => handleChange('sampleSize', e.target.value)}
              placeholder={t('customerJourney.shareModal.sampleSizePlaceholder')}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
            />
          </div>

          {/* Data Source */}
          <div>
            <Label htmlFor="dataSource" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.dataSource')}
            </Label>
            <Input
              id="dataSource"
              value={formData.dataSource}
              onChange={(e) => handleChange('dataSource', e.target.value)}
              placeholder={t('customerJourney.shareModal.dataSourcePlaceholder')}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
              required
            />
          </div>

          {/* Collection Method */}
          <div>
            <Label htmlFor="collectionMethod" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.collectionMethod')}
            </Label>
            <Input
              id="collectionMethod"
              value={formData.collectionMethod}
              onChange={(e) => handleChange('collectionMethod', e.target.value)}
              placeholder={t('customerJourney.shareModal.collectionMethodPlaceholder')}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
              required
            />
          </div>

          {/* Research Date */}
          <div>
            <Label htmlFor="researchDate" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.researchDate')}
            </Label>
            <Input
              id="researchDate"
              type="date"
              value={formData.researchDate}
              onChange={(e) => handleChange('researchDate', e.target.value)}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
              required
            />
          </div>

          {/* Additional Notes */}
          <div>
            <Label htmlFor="additionalNotes" className="text-gray-800 font-bold mb-2">
              {t('customerJourney.shareModal.additionalNotes')}
            </Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e) => handleChange('additionalNotes', e.target.value)}
              placeholder={t('customerJourney.shareModal.additionalNotesPlaceholder')}
              rows={3}
              className="border-2 border-gray-300 focus:border-[#00A9CE]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 h-12 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  {t('customerJourney.shareModal.sharing')}
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  {t('customerJourney.shareModal.share')}
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              disabled={loading}
              variant="outline"
              className="px-6 h-12 border-2 border-gray-300 hover:bg-gray-100 font-bold"
            >
              <X className="w-4 h-4 mr-2" />
              {t('customerJourney.shareModal.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ShareJourneyMapModal;
