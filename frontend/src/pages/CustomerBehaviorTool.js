import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Sparkles, Image as ImageIcon, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://formsphere.preview.emergentagent.com';

const CustomerBehaviorTool = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useTranslation();

  // Step 1: Input
  const [rawData, setRawData] = useState('');
  const [researchContext, setResearchContext] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('en');
  
  // Step 2: Analysis result
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  
  // Step 3: Image generation
  const [imageUrl, setImageUrl] = useState(null);
  const [imageStyle, setImageStyle] = useState('infographic');
  const [generatingImage, setGeneratingImage] = useState(false);
  
  // Step 4: Save as content
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    title: '',
    researchType: 'qualitative',
    sampleSize: '',
    dataSource: '',
    collectionMethod: '',
    researchDate: new Date().toISOString().split('T')[0],
    additionalNotes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleGenerateAnalysis = async () => {
    if (!rawData.trim()) {
      toast.error('Please enter research data');
      return;
    }

    try {
      setGeneratingAnalysis(true);
      const response = await axios.post(
        `${API}/api/generate-behavior-analysis`,
        {
          raw_data: rawData,
          research_context: researchContext || null,
          target_language: targetLanguage
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setAnalysisResult(response.data);
      toast.success('Analysis generated successfully!');
    } catch (error) {
      console.error('Analysis generation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate analysis');
    } finally {
      setGeneratingAnalysis(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!analysisResult) {
      toast.error('Please generate analysis first');
      return;
    }

    try {
      setGeneratingImage(true);
      const response = await axios.post(
        `${API}/api/generate-behavior-image`,
        {
          analysis_text: analysisResult.analysis_text,
          image_style: imageStyle,
          target_language: targetLanguage
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setImageUrl(response.data.image_url);
      toast.success('Image generated successfully!');
    } catch (error) {
      console.error('Image generation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate image');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleSaveContent = async () => {
    if (!saveFormData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API}/api/behavior-analysis/share-content`,
        {
          title: saveFormData.title,
          research_type: saveFormData.researchType,
          sample_size: saveFormData.sampleSize || null,
          data_source: saveFormData.dataSource,
          collection_method: saveFormData.collectionMethod,
          research_date: saveFormData.researchDate,
          additional_notes: saveFormData.additionalNotes || null,
          analysis_text: analysisResult.analysis_text,
          key_findings: analysisResult.key_findings || [],
          recommendations: analysisResult.recommendations || [],
          raw_data: rawData,
          research_context: researchContext || null,
          output_language: targetLanguage,
          image_url: imageUrl || null
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Analysis saved as content successfully!');
      setShowSaveForm(false);
      // Optionally navigate to content page
      // navigate('/content');
    } catch (error) {
      console.error('Save content error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation showMarketResearchButton={true} showContentButton={true} showProfileButton={true} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/market-research')}
            className="mb-4 text-gray-800 hover:text-[#00A9CE]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Market Research
          </Button>
          
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2">
            Customer Behavior Analysis
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Analyze qualitative research data to understand customer behavior patterns
          </p>
        </div>

        {/* Step 1: Input Data */}
        <Card className="p-6 sm:p-8 bg-white/98 border-2 border-gray-300 mb-6">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-6">Research Data Input</h2>
          
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold">
                Research Data (Interviews, Observations, Behavioral Data) *
              </Label>
              <Textarea
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
                className="mt-2 min-h-[200px] border-2 border-gray-300 focus:border-[#00A9CE]"
                placeholder="Paste your qualitative research data here..."
              />
            </div>

            <div>
              <Label className="text-gray-700 font-semibold">
                Research Context (Optional)
              </Label>
              <Textarea
                value={researchContext}
                onChange={(e) => setResearchContext(e.target.value)}
                className="mt-2 min-h-[100px] border-2 border-gray-300 focus:border-[#00A9CE]"
                placeholder="Additional context about the research..."
              />
            </div>

            <div>
              <Label className="text-gray-700 font-semibold">Output Language</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger className="mt-2 border-2 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="th">ไทย (Thai)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerateAnalysis}
              disabled={generatingAnalysis || !rawData.trim()}
              className="w-full bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
            >
              {generatingAnalysis ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Analysis
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Step 2: Analysis Result */}
        {analysisResult && (
          <Card className="p-6 sm:p-8 bg-white/98 border-2 border-gray-300 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900">Analysis Result</h2>
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                  variant="outline"
                  className="border-2 border-blue-300"
                >
                  {generatingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Generate Illustration
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowSaveForm(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save as Content
                </Button>
              </div>
            </div>

            <div className="prose max-w-none">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Comprehensive Analysis</h3>
              <div className="text-gray-700 whitespace-pre-wrap mb-6">
                {analysisResult.analysis_text}
              </div>

              {analysisResult.key_findings && analysisResult.key_findings.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Key Findings</h3>
                  <ul className="list-disc list-inside space-y-2 mb-6">
                    {analysisResult.key_findings.map((finding, idx) => (
                      <li key={idx} className="text-gray-700">{finding}</li>
                    ))}
                  </ul>
                </>
              )}

              {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Recommendations</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {analysisResult.recommendations.map((rec, idx) => (
                      <li key={idx} className="text-gray-700">{rec}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Step 3: Generated Image */}
        {imageUrl && (
          <Card className="p-6 sm:p-8 bg-white/98 border-2 border-gray-300 mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-6">Generated Illustration</h2>
            <div className="flex justify-center">
              <img
                src={imageUrl}
                alt="Behavior Analysis Illustration"
                className="max-w-full h-auto rounded-lg shadow-lg"
              />
            </div>
          </Card>
        )}

        {/* Save Form Modal */}
        {showSaveForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-6">
              <h2 className="text-2xl font-black text-gray-900 mb-6">Save as Content</h2>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-700 font-semibold">Title *</Label>
                  <Input
                    value={saveFormData.title}
                    onChange={(e) => setSaveFormData({...saveFormData, title: e.target.value})}
                    className="mt-2 border-2 border-gray-300"
                    placeholder="Enter content title"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 font-semibold">Research Type</Label>
                    <Select
                      value={saveFormData.researchType}
                      onValueChange={(value) => setSaveFormData({...saveFormData, researchType: value})}
                    >
                      <SelectTrigger className="mt-2 border-2 border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="qualitative">Qualitative</SelectItem>
                        <SelectItem value="quantitative">Quantitative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-gray-700 font-semibold">Sample Size</Label>
                    <Input
                      value={saveFormData.sampleSize}
                      onChange={(e) => setSaveFormData({...saveFormData, sampleSize: e.target.value})}
                      className="mt-2 border-2 border-gray-300"
                      placeholder="e.g., 50 participants"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-gray-700 font-semibold">Data Source</Label>
                  <Input
                    value={saveFormData.dataSource}
                    onChange={(e) => setSaveFormData({...saveFormData, dataSource: e.target.value})}
                    className="mt-2 border-2 border-gray-300"
                    placeholder="e.g., Customer interviews"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 font-semibold">Collection Method</Label>
                  <Input
                    value={saveFormData.collectionMethod}
                    onChange={(e) => setSaveFormData({...saveFormData, collectionMethod: e.target.value})}
                    className="mt-2 border-2 border-gray-300"
                    placeholder="e.g., In-depth interviews"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 font-semibold">Research Date</Label>
                  <Input
                    type="date"
                    value={saveFormData.researchDate}
                    onChange={(e) => setSaveFormData({...saveFormData, researchDate: e.target.value})}
                    className="mt-2 border-2 border-gray-300"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 font-semibold">Additional Notes</Label>
                  <Textarea
                    value={saveFormData.additionalNotes}
                    onChange={(e) => setSaveFormData({...saveFormData, additionalNotes: e.target.value})}
                    className="mt-2 min-h-[100px] border-2 border-gray-300"
                    placeholder="Any additional notes..."
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => setShowSaveForm(false)}
                    variant="outline"
                    className="flex-1"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveContent}
                    disabled={saving}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Content
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerBehaviorTool;
