import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Sparkles, Loader2, FileText, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://academic-tools-2.preview.emergentagent.com';

const AcademicFormatEditor = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [styleSelectionMode, setStyleSelectionMode] = useState('manual'); // 'auto' or 'manual'
  const [formData, setFormData] = useState({
    originalText: '',
    journalName: '',
    formatStyle: 'APA'
  });

  const [inputMode, setInputMode] = useState('file'); // 'file' or 'text'
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null);
  const [guidelines, setGuidelines] = useState('');
  const [formattingSpecs, setFormattingSpecs] = useState(null);
  const [fetchingGuidelines, setFetchingGuidelines] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [result, setResult] = useState(null);
  const [formattingProgress, setFormattingProgress] = useState('');
  const [estimatedSections, setEstimatedSections] = useState(0);

  const handleFetchGuidelines = async () => {
    if (!formData.journalName.trim()) {
      toast.error('กรุณาระบุชื่อวารสาร');
      return;
    }

    try {
      setFetchingGuidelines(true);
      
      const response = await axios.post(
        `${API}/api/format-editor/fetch-guidelines`,
        {
          journal_name: formData.journalName,
          target_language: 'th'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setGuidelines(response.data.guidelines);
      if (response.data.format_style) {
        setFormData({...formData, formatStyle: response.data.format_style});
      }
      
      // Store formatting specs if available
      if (response.data.formatting_specs) {
        setFormattingSpecs(response.data.formatting_specs);
        toast.success('ดึง Author Guidelines และ Formatting Parameters สำเร็จ!', { duration: 3000 });
      } else {
        setFormattingSpecs(null);
        toast.success('ดึง Author Guidelines สำเร็จ!');
      }
    } catch (error) {
      console.error('Fetch guidelines error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถดึง Author Guidelines ได้');
    } finally {
      setFetchingGuidelines(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error('กรุณาอัปโหลดไฟล์ .docx เท่านั้น');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result.split(',')[1];
      setUploadedFile(base64);
      setUploadedFileName(file.name);
      toast.success(`อัปโหลด ${file.name} สำเร็จ - กำลังวิเคราะห์...`, { duration: 2000 });
      
      // Analyze file
      try {
        const response = await axios.post(
          `${process.env.REACT_APP_BACKEND_URL}/api/format-editor/analyze-file`,
          {
            file_base64: base64,
            file_name: file.name
          },
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        setUploadedFileInfo(response.data);
        toast.success('วิเคราะห์ไฟล์สำเร็จ!', { duration: 2000 });
      } catch (error) {
        console.error('File analysis error:', error);
        toast.error('ไม่สามารถวิเคราะห์ไฟล์ได้ แต่ยังสามารถใช้งานต่อได้');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFormat = async () => {
    // Validate input mode
    if (inputMode === 'file' && !uploadedFile) {
      toast.error('กรุณาอัปโหลดไฟล์ .docx');
      return;
    }
    if (inputMode === 'text' && !formData.originalText.trim()) {
      toast.error('กรุณาใส่ข้อความที่ต้องการแก้ไข');
      return;
    }

    // Validate style selection mode
    if (styleSelectionMode === 'auto' && !formData.journalName.trim()) {
      toast.error('กรุณาใส่ชื่อวารสารและคลิก "ค้นหา" ก่อน');
      return;
    }

    try {
      setFormatting(true);
      setResult(null);
      setFormattingProgress('กำลังประมวลผลด้วย Pandoc...');

      const requestData = {
        format_style: formData.formatStyle,
        journal_name: styleSelectionMode === 'auto' ? formData.journalName : null,
        target_language: 'th'
      };

      if (inputMode === 'file') {
        requestData.file_base64 = uploadedFile;
        requestData.file_name = uploadedFileName;
      } else {
        requestData.original_text = formData.originalText;
      }

      const response = await axios.post(
        `${API}/api/format-editor/format`,
        requestData,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 60000  // 1 minute (Pandoc is fast!)
        }
      );

      setResult(response.data);
      setFormattingProgress('');
      toast.success('แก้ไข Format สำเร็จ! (ใช้ Pandoc - แม่นยำ 100%)');
    } catch (error) {
      console.error('Format error:', error);
      setFormattingProgress('');
      toast.error(error.response?.data?.detail || 'ไม่สามารถแก้ไข Format ได้');
    } finally {
      setFormatting(false);
    }
  };

  const handleDownload = () => {
    if (!result?.formatted_file_base64) return;

    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${result.formatted_file_base64}`;
    link.download = result.formatted_file_name || 'formatted_document.docx';
    link.click();
    toast.success('ดาวน์โหลดไฟล์สำเร็จ!');
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation showBackButton={true} backButtonPath="/market-research" showDashboardButton={true} showContentButton={true} showProfileButton={true} showAdminButton={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/market-research')}
            className="mb-4 text-gray-800 hover:text-[#00A9CE]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับหน้าเครื่องมือวิจัย
          </Button>
          
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2">
            Academic Format Editor
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            แก้ไขรูปแบบบทความวิจัยให้ตรงตาม Author Guidelines ของวารสารด้วย AI
          </p>
        </div>

        {/* Mode Selection Tabs */}
        <div className="mb-6 flex gap-2 border-b-2 border-gray-200">
          <button
            onClick={() => {setInputMode('file'); setResult(null);}}
            className={`px-6 py-3 font-bold transition-all ${
              inputMode === 'file'
                ? 'border-b-4 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-purple-500'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            อัปโหลดไฟล์ .docx
          </button>
          <button
            onClick={() => {setInputMode('text'); setResult(null);}}
            className={`px-6 py-3 font-bold transition-all ${
              inputMode === 'text'
                ? 'border-b-4 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-purple-500'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            ใส่ข้อความ
          </button>
        </div>

        {/* Input Section */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          {/* File Upload Card - Show only in file mode */}
          {inputMode === 'file' && (
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-300 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              อัปโหลดไฟล์ Word (.docx)
            </h3>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".docx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex-1 cursor-pointer"
              >
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition-all">
                  {uploadedFileName ? (
                    <div>
                      <div className="flex items-center justify-center gap-2 text-blue-700 mb-3">
                        <CheckCircle className="w-6 h-6" />
                        <span className="font-semibold">{uploadedFileName}</span>
                      </div>
                      {uploadedFileInfo && (
                        <div className="bg-blue-50 rounded-lg p-4 text-left space-y-3">
                          <p className="text-xs font-bold text-blue-800 mb-2">📊 ข้อมูลไฟล์:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                            <div>📝 <span className="font-semibold">{uploadedFileInfo.word_count.toLocaleString()}</span> คำ</div>
                            <div>📄 <span className="font-semibold">{uploadedFileInfo.paragraphs}</span> paragraphs</div>
                            <div>🔤 <span className="font-semibold">{uploadedFileInfo.headings_count}</span> headings (H1:{uploadedFileInfo.h1_count}, H2:{uploadedFileInfo.h2_count}, H3:{uploadedFileInfo.h3_count})</div>
                            <div>📊 <span className="font-semibold">{uploadedFileInfo.tables_count}</span> tables</div>
                            <div>📚 ~<span className="font-semibold">{uploadedFileInfo.estimated_citations}</span> citations</div>
                            <div>💾 <span className="font-semibold">{uploadedFileInfo.file_size_kb}</span> KB</div>
                          </div>
                          
                          {(uploadedFileInfo.detected_font || uploadedFileInfo.detected_font_size || uploadedFileInfo.detected_line_spacing || uploadedFileInfo.detected_margins || uploadedFileInfo.detected_citation_style) && (
                            <div className="border-t border-blue-200 pt-3 mt-3">
                              <p className="text-xs font-bold text-purple-800 mb-2">🎨 รูปแบบที่ตรวจพบ (จาก Pandoc):</p>
                              <div className="grid grid-cols-1 gap-1 text-xs text-gray-700">
                                {uploadedFileInfo.detected_citation_style && (
                                  <div className="bg-orange-50 p-2 rounded border border-orange-200 mb-1">
                                    📖 <span className="font-bold text-orange-800">Citation Style: {uploadedFileInfo.detected_citation_style}</span>
                                    {uploadedFileInfo.citation_confidence && (
                                      <span className="ml-2 text-xs text-orange-600">
                                        (Confidence: {uploadedFileInfo.citation_confidence})
                                      </span>
                                    )}
                                  </div>
                                )}
                                {uploadedFileInfo.detected_font && (
                                  <div>📝 Font: <span className="font-semibold">{uploadedFileInfo.detected_font}</span> {uploadedFileInfo.detected_font_size && `(${uploadedFileInfo.detected_font_size}pt)`}</div>
                                )}
                                {uploadedFileInfo.detected_line_spacing && (
                                  <div>📐 Line Spacing: <span className="font-semibold">{uploadedFileInfo.detected_line_spacing}</span></div>
                                )}
                                {uploadedFileInfo.detected_margins && (
                                  <div>📄 Margins: <span className="font-semibold text-xs">{uploadedFileInfo.detected_margins}</span></div>
                                )}
                                {uploadedFileInfo.detected_styles && uploadedFileInfo.detected_styles.length > 0 && (
                                  <div>🎨 Styles: <span className="font-semibold text-xs">{uploadedFileInfo.detected_styles.slice(0, 5).join(', ')}</span></div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-600">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-blue-400" />
                      <p className="font-semibold">คลิกเพื่ออัปโหลดไฟล์ .docx</p>
                      <p className="text-xs mt-1">หรือลากไฟล์มาวางที่นี่</p>
                    </div>
                  )}
                </div>
              </label>
              {uploadedFileName && (
                <Button
                  onClick={() => {
                    setUploadedFile(null); 
                    setUploadedFileName('');
                    setUploadedFileInfo(null);
                  }}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  ลบไฟล์
                </Button>
              )}
            </div>
            <p className="text-xs text-blue-600 mt-3 font-medium">
              💡 แนะนำ: อัปโหลดไฟล์ .docx จะได้ผลลัพธ์ที่แม่นยำที่สุด (Pandoc จะประมวลผล format, citations, และ references อัตโนมัติ)
            </p>
          </Card>
          )}

          {/* Style Selection Method */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              🎯 วิธีเลือก Citation Style
            </h3>

            {/* Radio Buttons */}
            <div className="space-y-4 mb-6">
              {/* Auto Mode */}
              <div 
                onClick={() => setStyleSelectionMode('auto')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  styleSelectionMode === 'auto' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-300 hover:border-purple-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={styleSelectionMode === 'auto'}
                    onChange={() => setStyleSelectionMode('auto')}
                    className="mt-1 w-4 h-4 text-purple-600"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 mb-1">ให้ AI หาให้อัตโนมัติ</p>
                    <p className="text-sm text-gray-600 mb-3">AI จะหา Author Guidelines และ Citation Style จากชื่อวารสาร</p>
                    
                    {styleSelectionMode === 'auto' && (
                      <div className="flex gap-2">
                        <Input
                          value={formData.journalName}
                          onChange={(e) => setFormData({...formData, journalName: e.target.value})}
                          className="h-10 border-2 border-purple-300 focus:border-purple-500"
                          placeholder="ชื่อวารสาร เช่น Journal of Marketing"
                        />
                        <Button
                          onClick={handleFetchGuidelines}
                          disabled={fetchingGuidelines || !formData.journalName.trim()}
                          className="bg-purple-600 hover:bg-purple-700 text-white h-10 px-4"
                        >
                          {fetchingGuidelines ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              ค้นหา
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Manual Mode */}
              <div 
                onClick={() => setStyleSelectionMode('manual')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  styleSelectionMode === 'manual' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-300 hover:border-purple-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={styleSelectionMode === 'manual'}
                    onChange={() => setStyleSelectionMode('manual')}
                    className="mt-1 w-4 h-4 text-purple-600"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 mb-1">เลือก Style เอง</p>
                    <p className="text-sm text-gray-600 mb-3">เลือก Citation Style ที่ต้องการด้วยตัวเอง</p>
                    
                    {styleSelectionMode === 'manual' && (
                      <select
                        value={formData.formatStyle}
                        onChange={(e) => setFormData({...formData, formatStyle: e.target.value})}
                        className="w-full h-10 border-2 border-purple-300 rounded-md px-3 focus:border-purple-500 focus:outline-none"
                      >
                        <optgroup label="📚 General Academic">
                          <option value="APA">APA (7th Edition)</option>
                          <option value="MLA">MLA (9th Edition)</option>
                          <option value="Chicago">Chicago Style (Author-Date)</option>
                          <option value="Turabian">Turabian (Notes-Bibliography)</option>
                          <option value="Harvard">Harvard Style</option>
                        </optgroup>
                        <optgroup label="🔬 Sciences">
                          <option value="IEEE">IEEE (Engineering)</option>
                          <option value="Vancouver">Vancouver (Medical)</option>
                          <option value="AMA">AMA (American Medical Association)</option>
                          <option value="ACS">ACS (American Chemical Society)</option>
                          <option value="Nature">Nature Journal</option>
                        </optgroup>
                        <optgroup label="📖 Publishers">
                          <option value="Emerald">Emerald (Harvard Style)</option>
                          <option value="Elsevier-Harvard">Elsevier-Harvard</option>
                          <option value="Springer">Springer (Basic Author-Date)</option>
                        </optgroup>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Format Button */}
            <div className="mt-6">
                <Button
                  onClick={handleFormat}
                  disabled={
                    formatting || 
                    (inputMode === 'file' && !uploadedFile) ||
                    (inputMode === 'text' && !formData.originalText.trim()) ||
                    (styleSelectionMode === 'auto' && !formData.journalName.trim())
                  }
                  className="w-full h-14 bg-gradient-to-r from-[#6B46C1] via-[#7C3AED] to-[#9333EA] hover:from-[#5B35A1] hover:to-[#7C3AED] text-white font-bold shadow-xl text-lg"
                >
                  {formatting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      กำลังแก้ไข...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      แก้ไข Format
                    </>
                  )}
                </Button>
              </div>

            {/* Guidelines Display */}
            {guidelines && (
              <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  Author Guidelines
                </h3>
                <div className="text-sm text-gray-700 max-h-40 overflow-y-auto whitespace-pre-line">
                  {guidelines}
                </div>
              </div>
            )}
            
            {/* Formatting Specs Display */}
            {formattingSpecs && (
              <div className="mt-4 p-5 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  พารามิเตอร์การจัดรูปแบบที่ตรวจพบ ({Object.keys(formattingSpecs).length} parameters)
                </h3>
                
                {/* Body Text Section */}
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">📝 Body Text</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Font:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.font_name || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Size:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.font_size || 'N/A'}pt</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Color:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.font_color || '#000000'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Line Spacing:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.line_spacing || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Alignment:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.text_alignment || 'left'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">1st Line:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.first_line_indent || 'N/A'}"</span>
                    </div>
                  </div>
                </div>
                
                {/* Citation Style Section - CRITICAL FOR PANDOC */}
                <div className="mb-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-orange-300 rounded-lg">
                  <h4 className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                    📖 Citation Style (สำคัญที่สุดสำหรับ Pandoc)
                  </h4>
                  <div className="flex items-center gap-3 p-3 bg-white rounded-md border border-orange-200">
                    <span className="text-sm font-bold text-orange-700">Style:</span>
                    <span className="text-lg font-bold text-gray-900 bg-orange-100 px-4 py-1 rounded-md">
                      {formattingSpecs.citation_style || 'N/A'}
                    </span>
                    {formattingSpecs.citation_format_notes && (
                      <span className="text-xs text-gray-600 italic">({formattingSpecs.citation_format_notes})</span>
                    )}
                  </div>
                </div>
                
                {/* Margins Section */}
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">📄 Margins (inches)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600">Top:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.margin_top || formattingSpecs.margin_inches || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600">Bottom:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.margin_bottom || formattingSpecs.margin_inches || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600">Left:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.margin_left || formattingSpecs.margin_inches || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600">Right:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.margin_right || formattingSpecs.margin_inches || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Headings Section */}
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">🔤 Headings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">H1 Size:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.heading_font_size || formattingSpecs.heading_size || 'N/A'}pt</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">H1 Bold:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.heading_bold ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">H1 Align:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.heading_alignment || 'center'}</span>
                    </div>
                    {formattingSpecs.heading_all_caps !== undefined && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">All Caps:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.heading_all_caps ? 'Yes' : 'No'}</span>
                    </div>
                    )}
                    {formattingSpecs.subheading_font_size && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">H2 Size:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.subheading_font_size}pt</span>
                    </div>
                    )}
                  </div>
                </div>
                
                {/* Page Setup Section */}
                {(formattingSpecs.page_size || formattingSpecs.page_orientation) && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">📃 Page Setup</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {formattingSpecs.page_size && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Size:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.page_size}</span>
                    </div>
                    )}
                    {formattingSpecs.page_orientation && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[80px]">Orientation:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.page_orientation}</span>
                    </div>
                    )}
                  </div>
                </div>
                )}
                
                {/* References Section */}
                {(formattingSpecs.reference_hanging_indent || formattingSpecs.reference_line_spacing) && (
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">📚 References</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {formattingSpecs.reference_hanging_indent && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[100px]">Hanging Indent:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.reference_hanging_indent}"</span>
                    </div>
                    )}
                    {formattingSpecs.reference_line_spacing && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-md">
                      <span className="text-xs font-semibold text-purple-600 min-w-[100px]">Line Spacing:</span>
                      <span className="text-sm font-medium text-gray-800">{formattingSpecs.reference_line_spacing}</span>
                    </div>
                    )}
                  </div>
                </div>
                )}
                
                <p className="text-xs text-purple-700 mt-3 font-medium border-t border-purple-200 pt-3">
                  ✨ ทุกพารามิเตอร์เหล่านี้จะถูกนำไปใช้ในการสร้าง Word template และจัดรูปแบบเอกสารของคุณผ่าน Pandoc
                </p>
              </div>
            )}
            
            {/* BibTeX Content from Upload Analysis */}
            {uploadedFileInfo && uploadedFileInfo.bib_content && (
              <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-300 rounded-lg">
                <h3 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  📚 BibTeX Preview (จาก anystyle parser)
                </h3>
                <div className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto font-mono text-xs max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{uploadedFileInfo.bib_content}</pre>
                </div>
                <p className="text-xs text-green-700 mt-2 font-medium">
                  💡 ไฟล์ .bib นี้ถูกสร้างจาก References section และจะถูกใช้ร่วมกับ Pandoc เมื่อกด "แก้ไข Format"
                </p>
              </div>
            )}
          </Card>

          {/* Text Input & Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Text - Show only in text mode */}
            {inputMode === 'text' && (
            <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                ข้อความต้นฉบับ
              </h2>
              <Textarea
                value={formData.originalText}
                onChange={(e) => setFormData({...formData, originalText: e.target.value})}
                className="min-h-[500px] border-2 border-gray-300 focus:border-orange-500 font-mono text-sm"
                placeholder="วางข้อความที่ต้องการแก้ไขที่นี่..."
              />
            </Card>
            )}

            {/* Formatted Text - Full width in file mode, half width in text mode */}
            <Card className={`p-6 bg-white/98 border-2 border-gray-300 shadow-xl ${inputMode === 'file' ? 'lg:col-span-2' : ''}`}>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                ข้อความที่แก้ไขแล้ว
              </h2>
              {!result && !formatting && (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                  <FileText className="w-20 h-20 mb-4 opacity-30" />
                  <p className="text-lg font-medium">ผลลัพธ์จะแสดงที่นี่</p>
                  <p className="text-sm">
                    {inputMode === 'file' ? 'อัปโหลดไฟล์และคลิก "แก้ไข Format"' : 'ใส่ข้อความและคลิก "แก้ไข Format"'}
                  </p>
                </div>
              )}

              {formatting && (
                <div className="flex flex-col items-center justify-center h-[500px]">
                  <Loader2 className="w-16 h-16 text-purple-600 animate-spin mb-4" />
                  <p className="text-lg font-medium text-gray-700">กำลังแก้ไข Format...</p>
                  <p className="text-sm text-gray-500 mt-2">AI กำลังประมวลผลแบบ Section-by-Section</p>
                  {formattingProgress && (
                    <div className="mt-4 px-4 py-2 bg-purple-50 border border-purple-300 rounded-lg">
                      <p className="text-xs text-purple-700 font-medium">{formattingProgress}</p>
                    </div>
                  )}
                  {estimatedSections > 0 && (
                    <p className="text-xs text-gray-400 mt-4">
                      ⏱️ เวลาโดยประมาณ: {estimatedSections * 30} - {estimatedSections * 40} วินาที
                    </p>
                  )}
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Download Button */}
                  {result.formatted_file_base64 && (
                    <Button
                      onClick={handleDownload}
                      className="w-full h-14 bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white font-bold shadow-xl text-lg"
                    >
                      <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      ดาวน์โหลดไฟล์ที่แก้ไขแล้ว (.docx)
                    </Button>
                  )}

                  <Textarea
                    value={result.formatted_text}
                    readOnly
                    className="min-h-[500px] border-2 border-green-300 bg-green-50/50 font-mono text-sm"
                  />
                  
                  {/* Summary */}
                  {result.summary && (
                    <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                      <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        สรุป
                      </h3>
                      <p className="text-sm text-gray-700 mb-2">{result.summary}</p>
                      {result.sections_processed && result.sections_processed.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-green-300">
                          <p className="text-xs font-semibold text-gray-600 mb-1">ส่วนที่ประมวลผล:</p>
                          <div className="flex flex-wrap gap-2">
                            {result.sections_processed.map((section, idx) => (
                              <span 
                                key={idx} 
                                className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded border border-green-300"
                              >
                                {section}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Changes List */}
          {result && result.changes && result.changes.length > 0 && (
            <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                รายการการเปลี่ยนแปลง ({result.changes.length} รายการ)
              </h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {result.changes.map((change, idx) => (
                  <div key={idx} className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                    <h3 className="font-bold text-gray-900 mb-2">{change.section}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-red-700 mb-1">ต้นฉบับ:</p>
                        <p className="text-gray-700 bg-red-50 p-2 rounded">{change.original}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-green-700 mb-1">แก้ไขเป็น:</p>
                        <p className="text-gray-700 bg-green-50 p-2 rounded">{change.formatted}</p>
                      </div>
                    </div>
                    {change.reason && (
                      <p className="text-xs text-gray-600 mt-2">
                        <strong>เหตุผล:</strong> {change.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
          
          {/* BibTeX Content Display */}
          {result && result.bib_content && (
            <Card className="p-6 bg-white/98 border-2 border-blue-300 shadow-xl mt-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                📚 BibTeX File (จาก anystyle parser)
              </h2>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto font-mono text-xs max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{result.bib_content}</pre>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                💡 ไฟล์ .bib นี้ถูกสร้างโดย anystyle parser จาก References section และใช้ร่วมกับ Pandoc ในการ process citations
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcademicFormatEditor;
