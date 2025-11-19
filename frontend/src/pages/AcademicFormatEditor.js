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

const API = process.env.REACT_APP_BACKEND_URL || 'https://acadtools.preview.emergentagent.com';

const AcademicFormatEditor = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [formData, setFormData] = useState({
    originalText: '',
    journalName: '',
    formatStyle: 'APA'
  });

  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [guidelines, setGuidelines] = useState('');
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
      toast.success('ดึง Author Guidelines สำเร็จ!');
    } catch (error) {
      console.error('Fetch guidelines error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถดึง Author Guidelines ได้');
    } finally {
      setFetchingGuidelines(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error('กรุณาอัปโหลดไฟล์ .docx เท่านั้น');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result.split(',')[1];
      setUploadedFile(base64);
      setUploadedFileName(file.name);
      toast.success(`อัปโหลด ${file.name} สำเร็จ`);
    };
    reader.readAsDataURL(file);
  };

  const handleFormat = async () => {
    if (!formData.originalText.trim() && !uploadedFile) {
      toast.error('กรุณาอัปโหลดไฟล์ .docx หรือใส่ข้อความ');
      return;
    }

    try {
      setFormatting(true);
      setResult(null);
      setFormattingProgress('กำลังประมวลผลด้วย Pandoc...');

      const requestData = {
        format_style: formData.formatStyle,
        journal_name: formData.journalName || null,
        target_language: 'th'
      };

      if (uploadedFile) {
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

        {/* Input Section */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          {/* File Upload Card */}
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
                    <div className="flex items-center justify-center gap-2 text-blue-700">
                      <CheckCircle className="w-6 h-6" />
                      <span className="font-semibold">{uploadedFileName}</span>
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
                  onClick={() => {setUploadedFile(null); setUploadedFileName('');}}
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

          {/* OR Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t-2 border-gray-300"></div>
            <span className="text-gray-500 font-bold">หรือ</span>
            <div className="flex-1 border-t-2 border-gray-300"></div>
          </div>

          {/* Journal & Style Selection */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Journal Name */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  ชื่อวารสาร (ถ้ามี)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.journalName}
                    onChange={(e) => setFormData({...formData, journalName: e.target.value})}
                    className="mt-2 h-12 border-2 border-gray-300 focus:border-purple-500"
                    placeholder="เช่น Journal of Marketing"
                  />
                  <Button
                    onClick={handleFetchGuidelines}
                    disabled={fetchingGuidelines || !formData.journalName.trim()}
                    className="mt-2 bg-blue-600 hover:bg-blue-700 text-white h-12 px-4"
                  >
                    {fetchingGuidelines ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  AI จะหา Author Guidelines ให้อัตโนมัติ
                </p>
              </div>

              {/* Format Style */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  รูปแบบการอ้างอิง *
                </Label>
                <select
                  value={formData.formatStyle}
                  onChange={(e) => setFormData({...formData, formatStyle: e.target.value})}
                  className="w-full mt-2 h-12 border-2 border-gray-300 rounded-md px-3 focus:border-purple-500 focus:outline-none"
                >
                  <option value="APA">APA (7th Edition)</option>
                  <option value="MLA">MLA (9th Edition)</option>
                  <option value="Chicago">Chicago Style</option>
                  <option value="Harvard">Harvard Style</option>
                  <option value="IEEE">IEEE Style</option>
                </select>
              </div>

              {/* Format Button */}
              <div className="flex items-end">
                <Button
                  onClick={handleFormat}
                  disabled={formatting || !formData.originalText.trim()}
                  className="w-full h-12 bg-gradient-to-r from-[#6B46C1] via-[#7C3AED] to-[#9333EA] hover:from-[#5B35A1] hover:to-[#7C3AED] text-white font-bold shadow-xl"
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
          </Card>

          {/* Text Input & Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Text */}
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

            {/* Formatted Text */}
            <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                ข้อความที่แก้ไขแล้ว
              </h2>
              {!result && !formatting && (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                  <FileText className="w-20 h-20 mb-4 opacity-30" />
                  <p className="text-lg font-medium">ผลลัพธ์จะแสดงที่นี่</p>
                  <p className="text-sm">ใส่ข้อความและคลิก "แก้ไข Format"</p>
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
        </div>
      </div>
    </div>
  );
};

export default AcademicFormatEditor;
