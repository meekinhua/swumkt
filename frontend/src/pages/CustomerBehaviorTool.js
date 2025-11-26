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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Sparkles, Image as ImageIcon, Save, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://market-analysis-27.preview.emergentagent.com';

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
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);

  // ESC key handler for fullscreen image
  React.useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showFullscreenImage) {
        setShowFullscreenImage(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showFullscreenImage]);
  
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
          image_url: imageUrl || null,
          image_base64: imageUrl || null  // Attach generated image
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Analysis saved as content with image attachment!');
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
      <Navigation />

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

        {/* Tabs: Phase 1 & Phase 2 */}
        <Tabs defaultValue="qualitative" className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-2 bg-white/98 border-2 border-gray-300 mb-8">
            <TabsTrigger value="qualitative" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00A9CE] data-[state=active]:to-[#33BCDA] data-[state=active]:text-white font-bold">
              Phase 1: การวิเคราะห์เชิงคุณภาพ
            </TabsTrigger>
            <TabsTrigger value="quantitative" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#007B9A] data-[state=active]:to-[#005A73] data-[state=active]:text-white font-bold">
              Phase 2: การวิเคราะห์เชิงปริมาณ
            </TabsTrigger>
          </TabsList>

          {/* Phase 1: Qualitative */}
          <TabsContent value="qualitative">
            {/* Two-Panel Layout: Input (Left) & Results (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
          {/* Left Panel: Input Section */}
          <Card className="p-4 md:p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-[#00A9CE]" />
              Research Data Input
            </h2>
            
            <div className="space-y-6">
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  Research Data (Interviews, Observations, Behavioral Data) *
                </Label>
                <p className="text-sm text-gray-600 mb-2 font-medium">
                  Paste your qualitative research data about customer behavior
                </p>
                <Textarea
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  className="mt-2 min-h-[200px] font-mono text-sm border-2 border-gray-300 focus:border-[#00A9CE]"
                  placeholder="Paste your qualitative research data here..."
                />
              </div>

              <div>
                <Label className="text-gray-800 font-bold mb-2">
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
                <Label className="text-gray-800 font-bold mb-2 block">Output Language</Label>
                <p className="text-sm text-gray-600 mb-2 font-medium">
                  Choose the language for analysis output
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="outputLanguage"
                      value="th"
                      checked={targetLanguage === 'th'}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                    />
                    <span className="text-gray-700 font-medium">ไทย (Thai)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="outputLanguage"
                      value="en"
                      checked={targetLanguage === 'en'}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-4 h-4 text-[#00A9CE] focus:ring-[#00A9CE]"
                    />
                    <span className="text-gray-700 font-medium">English</span>
                  </label>
                </div>
              </div>

              <Button
                onClick={handleGenerateAnalysis}
                disabled={generatingAnalysis || !rawData.trim()}
                className="w-full h-12 md:h-14 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl text-base md:text-lg"
              >
                {generatingAnalysis ? (
                  <>
                    <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
                    <span className="hidden sm:inline">Analyzing Behavior...</span>
                    <span className="sm:hidden">Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    <span className="hidden sm:inline">Generate Analysis</span>
                    <span className="sm:hidden">Generate</span>
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Right Panel: Results Section */}
          <Card className="p-4 md:p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3">
              <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
                <Save className="w-5 h-5 md:w-6 md:h-6 text-[#00A9CE]" />
                <span className="hidden sm:inline">Analysis Results</span>
                <span className="sm:hidden">Results</span>
              </h2>
              {analysisResult && (
                <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                  {!imageUrl ? (
                    <Button
                      onClick={handleGenerateImage}
                      disabled={generatingImage}
                      variant="outline"
                      size="sm"
                      className="border-2 border-blue-300 text-blue-700 p-2"
                      title="Generate Illustration"
                    >
                      {generatingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (window.confirm('Delete this image? You can generate a new one.')) {
                          setImageUrl(null);
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="border-2 border-red-300 text-red-700 p-2 hover:bg-red-50"
                      title="Delete Image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowSaveForm(true)}
                    variant="outline"
                    size="sm"
                    className="border-2 border-green-300 text-green-700 p-2"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {!analysisResult ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                <Sparkles className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Analysis will appear here</p>
                <p className="text-sm">Fill in the research data and click Generate</p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                {/* Analysis Text */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    📊 Comprehensive Analysis
                  </h3>
                  <div className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-200">
                    {analysisResult.analysis_text}
                  </div>
                </div>

                {/* Key Findings */}
                {analysisResult.key_findings && analysisResult.key_findings.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                      🔍 Key Findings
                    </h3>
                    <ul className="space-y-2">
                      {analysisResult.key_findings.map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700 text-sm">
                          <span className="text-[#00A9CE] font-bold">•</span>
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                      💡 Recommendations
                    </h3>
                    <ul className="space-y-2">
                      {analysisResult.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700 text-sm">
                          <span className="text-green-600 font-bold">→</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Generated Image */}
                {imageUrl && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                      🎨 Generated Illustration
                    </h3>
                    <div 
                      className="rounded-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-[#00A9CE] transition-all"
                      onClick={() => setShowFullscreenImage(true)}
                      title="Click to view fullscreen"
                    >
                      <img
                        src={imageUrl}
                        alt="Behavior Analysis Illustration"
                        className="w-full h-auto hover:opacity-90 transition-opacity"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center font-medium">
                      💡 Click image to view in fullscreen
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
          </TabsContent>

          {/* Phase 2: Quantitative (Coming Soon) */}
          <TabsContent value="quantitative">
            <Card className="p-8 md:p-12 bg-white/98 border-2 border-gray-300 shadow-xl">
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <Lock className="w-20 h-20 text-gray-300 mb-6" />
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-4">
                  Phase 2: การวิเคราะห์เชิงปริมาณ
                </h2>
                <p className="text-gray-600 text-base md:text-lg max-w-2xl mb-6">
                  ฟีเจอร์นี้อยู่ระหว่างการพัฒนา จะเปิดให้ใช้งานในเร็วๆ นี้
                </p>
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 max-w-xl">
                  <h3 className="font-bold text-gray-900 mb-3">คุณสมบัติที่กำลังจะมา:</h3>
                  <ul className="text-left text-gray-700 space-y-2">
                    <li>• อัพโหลดไฟล์ CSV สำหรับการวิเคราะห์</li>
                    <li>• สถิติเชิงพรรณนา (Mean, Median, Frequency)</li>
                    <li>• การแบ่งกลุ่มลูกค้า (Segmentation)</li>
                    <li>• การวิเคราะห์ความสัมพันธ์ (Correlation)</li>
                    <li>• กราฟและแผนภูมิแบบ Interactive</li>
                    <li>• Export ผลลัพธ์เป็น PDF/Excel</li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Fullscreen Image Modal */}
        {showFullscreenImage && imageUrl && (
          <div 
            className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
            onClick={() => setShowFullscreenImage(false)}
          >
            <div className="relative max-w-7xl max-h-screen">
              <button
                onClick={() => setShowFullscreenImage(false)}
                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-all z-10"
                title="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <img
                src={imageUrl}
                alt="Behavior Analysis Illustration - Fullscreen"
                className="max-w-full max-h-screen object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm">
                Press ESC or click outside to close
              </div>
            </div>
          </div>
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
