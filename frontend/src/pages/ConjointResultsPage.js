import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Users,
  TrendingUp,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const ConjointResultsPage = () => {
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { user, token } = useAuth();
  
  const [study, setStudy] = useState(null);
  const [results, setResults] = useState(null);
  const [aiInterpretation, setAiInterpretation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  useEffect(() => {
    if (user && token && studyId) {
      loadResults();
    }
  }, [user, token, studyId]);

  const loadResults = async () => {
    try {
      const [studyRes, resultsRes] = await Promise.all([
        axios.get(`${API}/conjoint/studies/${studyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/conjoint/studies/${studyId}/results`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setStudy(studyRes.data);
      setResults(resultsRes.data);
    } catch (error) {
      console.error('Error loading results:', error);
      toast.error('ไม่สามารถโหลดผลการวิเคราะห์ได้');
    } finally {
      setLoading(false);
    }
  };

  const loadAIInterpretation = async () => {
    setLoadingAI(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/ai-interpretation`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAiInterpretation(response.data);
      toast.success('วิเคราะห์ด้วย AI สำเร็จ!');
    } catch (error) {
      console.error('Error generating AI interpretation:', error);
      toast.error('ไม่สามารถสร้างคำแนะนำด้วย AI ได้');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleExportCSV = () => {
    if (!results || !results.responses) return;
    
    const headers = ['Respondent ID', 'Email', 'Submitted At', 'Choices'];
    const rows = results.responses.map(resp => [
      resp.respondent_id,
      resp.respondent_email || 'N/A',
      new Date(resp.submitted_at).toLocaleString('th-TH'),
      JSON.stringify(resp.responses)
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conjoint_results_${studyId}.csv`;
    link.click();
    
    toast.success('ดาวน์โหลด CSV สำเร็จ');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดผลการวิเคราะห์...</p>
        </div>
      </div>
    );
  }

  if (!results || results.status === 'insufficient_data') {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <Card className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              ข้อมูลยังไม่เพียงพอสำหรับการวิเคราะห์
            </h2>
            <p className="text-gray-600 mb-4">
              ต้องการอย่างน้อย 30 คำตอบสำหรับการวิเคราะห์ที่เชื่อถือได้
            </p>
            <p className="text-lg font-bold text-blue-600">
              ปัจจุบัน: {results?.respondent_count || 0} คำตอบ
            </p>
            <p className="text-sm text-gray-500 mt-4">
              ยังขาดอีก {Math.max(0, 30 - (results?.respondent_count || 0))} คำตอบ
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // Sort importance scores
  const sortedImportance = Object.entries(results.importance_scores || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.importance - a.importance);

  const topFeatures = showAllFeatures ? sortedImportance : sortedImportance.slice(0, 3);

  // Prepare data for Pie Chart
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  const pieData = sortedImportance.map((feature, index) => ({
    name: feature.name,
    value: parseFloat(feature.importance.toFixed(1)),
    color: COLORS[index % COLORS.length]
  }));

  // Custom label for pie chart
  const renderCustomLabel = (entry) => {
    return `${entry.value}%`;
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-black text-gray-900 mb-2">
                📊 ผลการวิเคราะห์
              </h1>
              <p className="text-lg text-gray-600">{study?.title}</p>
            </div>
            <Button
              onClick={handleExportCSV}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              ดาวน์โหลดข้อมูล
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">จำนวนผู้ตอบ</p>
                <p className="text-3xl font-black text-blue-600">{results.respondent_count}</p>
                <p className="text-xs text-gray-500">คน</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-50 to-white border-2 border-green-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">สถานะ</p>
                <p className="text-xl font-bold text-green-600">พร้อมวิเคราะห์</p>
                <p className="text-xs text-gray-500">ข้อมูลเพียงพอแล้ว</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">คุณลักษณะ</p>
                <p className="text-3xl font-black text-purple-600">{sortedImportance.length}</p>
                <p className="text-xs text-gray-500">รายการ</p>
              </div>
            </div>
          </Card>
        </div>

        {/* AI Interpretation Section */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              AI ตีความผลและข้อเสนอแนะ
            </h2>
          </div>

          {!aiInterpretation ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                ใช้ AI วิเคราะห์และแปลผลข้อมูลให้เข้าใจง่าย พร้อมข้อเสนอแนะเชิงธุรกิจ
              </p>
              <Button
                onClick={loadAIInterpretation}
                disabled={loadingAI}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold"
              >
                {loadingAI ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    กำลังวิเคราะห์...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    วิเคราะห์ด้วย AI
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-6 border-2 border-indigo-200">
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {aiInterpretation.interpretation}
                </div>
              </div>
              <Button
                onClick={loadAIInterpretation}
                disabled={loadingAI}
                variant="outline"
                className="mt-4"
                size="sm"
              >
                🔄 วิเคราะห์ใหม่
              </Button>
            </div>
          )}
        </Card>

        {/* Feature Importance */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  คุณลักษณะที่ผู้บริโภคให้ความสำคัญ
                </h2>
                <p className="text-sm text-gray-600">
                  ตัวเลขแสดงระดับความสำคัญ (% จาก 100%)
                </p>
              </div>
            </div>
            {sortedImportance.length > 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllFeatures(!showAllFeatures)}
              >
                {showAllFeatures ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    แสดงน้อยลง
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    แสดงทั้งหมด
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {topFeatures.map((feature, index) => (
              <div key={feature.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-orange-400' : 'bg-gray-300'
                    }`}>
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{feature.name}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-blue-600">
                      {feature.importance.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">ความสำคัญ</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                      index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                      index === 2 ? 'bg-gradient-to-r from-orange-400 to-red-500' :
                      'bg-gradient-to-r from-blue-400 to-blue-500'
                    }`}
                    style={{ width: `${feature.importance}%` }}
                  ></div>
                </div>

                {/* Levels */}
                {results.part_worths[feature.id] && (
                  <div className="mt-3 pl-11">
                    <p className="text-xs text-gray-600 mb-2 font-semibold">ระดับที่ผู้บริโภคชอบ:</p>
                    <div className="space-y-1">
                      {Object.values(results.part_worths[feature.id].levels)
                        .sort((a, b) => b.utility - a.utility)
                        .map((level, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">
                              {idx === 0 && '⭐'} {level.value}
                            </span>
                            <span className="text-gray-500">
                              {level.utility.toFixed(1)} (เลือก {level.selection_count} ครั้ง)
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Tips */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-gray-900 mb-2">💡 วิธีอ่านผลการวิเคราะห์</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• <strong>ความสำคัญ (%):</strong> ยิ่งสูง = ผู้บริโภคให้ความสำคัญมากกว่า เช่น 40% หมายถึงคุณลักษณะนี้มีอิทธิพล 40% ต่อการตัดสินใจซื้อ</li>
                <li>• <strong>ระดับที่ชอบ:</strong> ระดับที่มี ⭐ คือสิ่งที่ผู้บริโภคต้องการมากที่สุด</li>
                <li>• <strong>ตัวเลข Utility:</strong> ยิ่งสูง = ยิ่งถูกเลือกบ่อย (ตัวเลขสัมพันธ์กัน ไม่ใช่ร้อยละ)</li>
                <li>• <strong>คำแนะนำ:</strong> ใช้ปุ่ม "วิเคราะห์ด้วย AI" เพื่อรับคำแนะนำเชิงธุรกิจที่เข้าใจง่าย</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ConjointResultsPage;