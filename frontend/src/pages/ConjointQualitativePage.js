import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { BeTopbar, Icon } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ExternalAiWorkflowModal from '@/components/ExternalAiWorkflowModal';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileText,
  Eye,
  Trash2,
  Sparkles,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

const ConjointQualitativePage = () => {
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  
  const [qualitativeInputs, setQualitativeInputs] = useState([]);
  const [newInput, setNewInput] = useState({
    type: 'interview',
    content: '',
    filename: ''
  });
  
  const [analysisResult, setAnalysisResult] = useState(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [externalAiOpen, setExternalAiOpen] = useState(false);

  useEffect(() => {
    if (user && token && studyId) {
      loadStudy();
    }
  }, [user, token, studyId]);

  const loadStudy = async () => {
    try {
      const response = await axios.get(`${API}/conjoint/studies/${studyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudy(response.data);
      
      // Load existing qualitative data
      if (response.data.qualitative_data) {
        setQualitativeInputs(response.data.qualitative_data);
      }
      
      // Load existing analysis
      if (response.data.llm_analysis) {
        setAnalysisResult(response.data);
      }
    } catch (error) {
      console.error('Error loading study:', error);
      toast.error('ไม่สามารถโหลดข้อมูลการศึกษาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAddInput = () => {
    if (!newInput.content.trim()) {
      toast.error('กรุณากรอกเนื้อหา');
      return;
    }

    setQualitativeInputs([...qualitativeInputs, { ...newInput }]);
    setNewInput({ type: 'interview', content: '', filename: '' });
    setShowAddInput(false);
    toast.success('เพิ่มข้อมูลเรียบร้อย');
  };

  const handleRemoveInput = (index) => {
    setQualitativeInputs(qualitativeInputs.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (qualitativeInputs.length === 0) {
      toast.error('กรุณาเพิ่มข้อมูลเชิงคุณภาพอย่างน้อย 1 รายการ');
      return;
    }

    setAnalyzing(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/qualitative-analysis`,
        {
          study_id: studyId,
          qualitative_data: qualitativeInputs,
          target_language: 'th'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAnalysisResult(response.data);
      
      // Add to history
      setAnalysisHistory([
        ...analysisHistory,
        {
          timestamp: new Date(),
          result: response.data,
          input_count: qualitativeInputs.length
        }
      ]);
      
      toast.success('วิเคราะห์ข้อมูลเสร็จสิ้น!');
      
      // Reload study to get updated status
      await loadStudy();
    } catch (error) {
      console.error('Error analyzing:', error);
      toast.error('AI ภายในไม่พร้อมใช้งาน — แนะนำกด "ใช้ AI ภายนอก (ฟรี)" เพื่อ Copy Prompt ไปรันกับ ChatGPT/Gemini/Claude ได้ทันที');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSkipToDesign = () => {
    // Allow skipping directly to Phase 2 without LLM analysis
    navigate(`/research/conjoint/${studyId}/design`);
  };

  const handleProceedToDesign = () => {
    navigate(`/research/conjoint/${studyId}/design`);
  };

  const handleReanalyze = () => {
    setAnalysisResult(null);
    toast.info('กรุณาตรวจสอบข้อมูลและวิเคราะห์ใหม่');
  };

  const getInputTypeLabel = (type) => {
    const labels = {
      interview: 'ข้อมูลสัมภาษณ์',
      observation: 'การสังเกต',
      constraints: 'ข้อจำกัดการผลิต'
    };
    return labels[type] || type;
  };

  const getInputTypeColor = (type) => {
    const colors = {
      interview: 'bg-blue-100 text-blue-700',
      observation: 'bg-green-100 text-green-700',
      constraints: 'bg-orange-100 text-orange-700'
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }}>LOADING…</div>
      </div>
    );
  }

  return (
    <div className="be-root">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                subtitle="CONJOINT ANALYSIS" active="conjoint"
                right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/market-research/conjoint-analysis')}>
                         <Icon name="chevronL" size={10}/>Studies
                       </button>}/>

      <div className="be-conjoint-page" style={{ maxWidth: 1200 }}>
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/market-research/conjoint-analysis')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <h1 className="text-4xl font-black text-gray-900 mb-2">
            Phase 1: Qualitative Analysis
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            {study?.title}
          </p>
          <p className="text-gray-600">
            ใช้ LLM วิเคราะห์ข้อมูลเชิงคุณภาพเพื่อค้นหา Attributes และ Levels ที่เหมาะสม
          </p>
        </div>

        {/* Progress Indicator — Unified 4-step workflow */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-3 min-w-max">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[#00A9CE] text-white flex items-center justify-center font-bold text-sm">
                1
              </div>
              <span className="font-bold text-[#00A9CE] text-sm">Qualitative (ไม่บังคับ)</span>
            </div>
            <div className="h-1 w-8 sm:w-12 bg-gray-300"></div>
            <button type="button" onClick={() => navigate(`/research/conjoint/${studyId}/design`)}
                    className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <span className="text-gray-700 text-sm">Design &amp; Preview</span>
            </button>
            <div className="h-1 w-8 sm:w-12 bg-gray-300"></div>
            <button type="button" onClick={() => navigate(`/research/conjoint/${studyId}/design`)}
                    className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <span className="text-gray-600 text-sm">เปิดรับคำตอบ</span>
            </button>
            <div className="h-1 w-8 sm:w-12 bg-gray-300"></div>
            <button type="button" onClick={() => navigate(`/research/conjoint/${studyId}/results`)}
                    className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <span className="text-gray-600 text-sm">วิเคราะห์ผล</span>
            </button>
          </div>
        </div>

        {/* Qualitative Data Input */}
        <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-gray-900">ข้อมูลเชิงคุณภาพ</h2>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowAddInput(true)}
                className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white"
              >
                <Upload className="w-4 h-4 mr-2" />
                เพิ่มข้อมูล
              </Button>
              {analysisResult && qualitativeInputs.length > 0 && (
                <Button
                  onClick={() => setAnalysisResult(null)}
                  variant="outline"
                  className="border-2 border-blue-400 text-blue-700"
                  size="sm"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  แก้ไขและวิเคราะห์ใหม่
                </Button>
              )}
            </div>
          </div>

          {qualitativeInputs.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold mb-4">ยังไม่มีข้อมูล</p>
              <Button
                onClick={() => setShowAddInput(true)}
                variant="outline"
              >
                <Upload className="w-4 h-4 mr-2" />
                เพิ่มข้อมูลเชิงคุณภาพ
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {qualitativeInputs.map((input, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getInputTypeColor(input.type)}`}>
                        {getInputTypeLabel(input.type)}
                      </span>
                      {input.filename && (
                        <span className="text-sm text-gray-600">
                          {input.filename}
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={() => handleRemoveInput(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {input.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Analysis Button & Skip Option */}
        {qualitativeInputs.length > 0 && !analysisResult && (
          <Card className="p-6 mb-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300">
            <div className="text-center">
              <Sparkles className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-blue-900 mb-2">
                พร้อมวิเคราะห์ด้วย AI
              </h3>
              <p className="text-blue-700 mb-4">
                LLM จะวิเคราะห์ข้อมูลของคุณและแนะนำ Attributes และ Levels ที่เหมาะสม
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  onClick={() => setExternalAiOpen(true)}
                  disabled={analyzing}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  data-testid="conjoint-qual-external-ai"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  ใช้ AI ภายนอก (ฟรี · Copy Prompt → วางผล)
                </Button>
                {isAdmin && (
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    variant="outline"
                    className="border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-bold"
                    data-testid="conjoint-qual-server-ai"
                  >
                    {analyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                        กำลังวิเคราะห์...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Server AI (Admin)
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={handleSkipToDesign}
                  variant="outline"
                  className="border-2 border-blue-400 text-blue-700 hover:bg-blue-100"
                >
                  ข้ามไป Step 2
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              <p className="text-xs text-blue-600 mt-3">
                💡 หรือข้ามขั้นตอนนี้และไปกรอก Attributes เองใน Phase 2
              </p>
            </div>
          </Card>
        )}

        {/* No Data - Skip Option */}
        {qualitativeInputs.length === 0 && (
          <Card className="p-6 mb-6 bg-gray-50 border-2 border-gray-300">
            <div className="text-center">
              <p className="text-gray-700 mb-4">
                คุณสามารถข้าม Phase 1 และไปกรอก Attributes เองใน Phase 2 ได้เลย
              </p>
              <Button
                onClick={handleSkipToDesign}
                variant="outline"
                className="border-2 border-gray-400 text-gray-700 hover:bg-gray-100"
              >
                ข้ามไป Phase 2
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <>
            <Card className="p-6 mb-6 bg-white border-2 border-green-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">
                      ผลการวิเคราะห์
                      {analysisHistory.length > 0 && (
                        <span className="ml-3 text-sm font-normal text-gray-600">
                          (รอบที่ {analysisHistory.length})
                        </span>
                      )}
                    </h2>
                    {analysisResult.recommendations && (
                      <p className="text-gray-700 mb-4">
                        {analysisResult.recommendations}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Reanalyze Button */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleReanalyze}
                    variant="outline"
                    size="sm"
                    className="border-2 border-orange-400 text-orange-700 hover:bg-orange-50"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    วิเคราะห์ใหม่
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                {analysisResult.suggested_attributes?.map((attr, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <div className="mb-3">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {index + 1}. {attr.name}
                      </h3>
                      {attr.description && (
                        <p className="text-sm text-gray-600 mb-2">
                          {attr.description}
                        </p>
                      )}
                      {attr.rationale && (
                        <p className="text-xs text-blue-600 italic">
                          💡 {attr.rationale}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {attr.levels?.map((level, levelIndex) => (
                        <div
                          key={levelIndex}
                          className="px-3 py-2 bg-white rounded-lg border-2 border-[#00A9CE] text-sm"
                        >
                          <div className="font-semibold text-gray-900">
                            {level.value}
                          </div>
                          {level.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              {level.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Analysis History */}
            {analysisHistory.length > 1 && (
              <Card className="p-4 mb-6 bg-gray-50 border-2 border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 mb-3">
                  ประวัติการวิเคราะห์ ({analysisHistory.length} รอบ)
                </h3>
                <div className="space-y-2">
                  {analysisHistory.slice(0, -1).reverse().map((item, idx) => (
                    <div key={idx} className="p-2 bg-white rounded border border-gray-200 text-xs text-gray-600">
                      <span className="font-semibold">รอบที่ {analysisHistory.length - idx - 1}:</span> {' '}
                      {new Date(item.timestamp).toLocaleString('th-TH')} - {' '}
                      {item.result.suggested_attributes?.length || 0} attributes
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Proceed Button */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div className="text-sm text-gray-600">
                💡 ไม่พอใจผล? คุณสามารถ
                <button 
                  type="button"
                  onClick={() => {
                    setAnalysisResult(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-blue-600 hover:underline mx-1 font-semibold"
                >
                  กลับไปแก้ไขข้อมูลแล้ววิเคราะห์ใหม่
                </button>
                หรือไปปรับ Attributes เองในขั้นตอนถัดไป
              </div>
              <Button
                onClick={handleProceedToDesign}
                className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white font-bold"
              >
                ดำเนินการต่อไป Step 2 (Design)
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Add Input Modal */}
      {showAddInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-3xl w-full p-6 bg-white max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              เพิ่มข้อมูลเชิงคุณภาพ
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  ประเภทข้อมูล
                </label>
                <select
                  value={newInput.type}
                  onChange={(e) => setNewInput({ ...newInput, type: e.target.value })}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                >
                  <option value="interview">ข้อมูลสัมภาษณ์</option>
                  <option value="observation">การสังเกต</option>
                  <option value="constraints">ข้อจำกัดการผลิต/ต้นทุน</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  นำเข้าจากไฟล์ข้อความ (ถ้ามี — .txt / .csv) หรือพิมพ์ชื่อแหล่งที่มา
                </label>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="text"
                    value={newInput.filename}
                    onChange={(e) => setNewInput({ ...newInput, filename: e.target.value })}
                    placeholder="เช่น: interview_transcript_01.txt"
                    className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                  />
                  <label className="inline-flex items-center justify-center px-4 py-2 border-2 border-[#00A9CE] text-[#007B9A] rounded-lg cursor-pointer hover:bg-cyan-50 text-sm font-semibold">
                    <Upload className="w-4 h-4 mr-2" />
                    เลือกไฟล์ .txt/.csv
                    <input
                      type="file"
                      accept=".txt,.csv,.md,text/plain,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const text = await f.text();
                        setNewInput(prev => ({
                          ...prev,
                          filename: prev.filename || f.name,
                          content: text.slice(0, 50000),
                        }));
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  เนื้อหา *
                </label>
                <textarea
                  value={newInput.content}
                  onChange={(e) => setNewInput({ ...newInput, content: e.target.value })}
                  placeholder="วางข้อมูลสัมภาษณ์, บันทึกการสังเกต, หรือข้อมูลอื่นๆ ที่เกี่ยวข้อง..."
                  rows={12}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 ยิ่งมีข้อมูลละเอียดมากเท่าไหร่ LLM จะวิเคราะห์ได้แม่นยำมากขึ้น
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowAddInput(false)}
                variant="outline"
                className="flex-1"
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleAddInput}
                className="flex-1 bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white"
              >
                เพิ่มข้อมูล
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ExternalAiWorkflowModal
        open={externalAiOpen}
        onClose={() => setExternalAiOpen(false)}
        title="สกัดปัจจัย Conjoint จากข้อมูลเชิงคุณภาพด้วย AI ภายนอก (ฟรี)"
        subtitle="คัดลอก Prompt พร้อมบทสัมภาษณ์ของคุณไปรันใน ChatGPT / Gemini / Claude แล้วนำ JSON กลับมาวางเพื่อสร้าง Attributes & Levels ทันที"
        fetchPrompt={async () => {
          const r = await axios.post(
            `${API}/conjoint/studies/${studyId}/qualitative-prompt`,
            { study_id: studyId, qualitative_data: qualitativeInputs, target_language: 'th' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return r.data;
        }}
        validatePayload={async (rawText) => {
          const r = await axios.post(
            `${API}/conjoint/studies/${studyId}/qualitative-import`,
            { raw_text: rawText, dry_run: true },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return r.data;
        }}
        applyPayload={async (rawText) => {
          const r = await axios.post(
            `${API}/conjoint/studies/${studyId}/qualitative-import`,
            { raw_text: rawText, qualitative_data: qualitativeInputs, dry_run: false },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setAnalysisResult(r.data);
          toast.success(`นำเข้า ${r.data?.suggested_attributes?.length || 0} Attributes สำเร็จ!`);
          await loadStudy();
        }}
        renderPreview={(preview) => (
          <div className="space-y-1.5">
            <div><strong>สกัดได้ {preview.attribute_count} ปัจจัย ({preview.total_levels} levels):</strong></div>
            <ul className="list-disc pl-5 space-y-0.5">
              {(preview.attributes || []).map((a, idx) => (
                <li key={idx}>
                  <strong>{a.name}:</strong> {(a.levels || []).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      />
    </div>
  );
};

export default ConjointQualitativePage;
