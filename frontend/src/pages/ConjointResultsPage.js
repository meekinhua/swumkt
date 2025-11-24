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
  BarChart3,
  GraduationCap
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
  const [showAllFeatures, setShowAllFeatures] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'academic'
  const [statisticalData, setStatisticalData] = useState(null);
  const [loadingStatistical, setLoadingStatistical] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('mnl'); // counting, mnl, mixed_logit, hierarchical_bayes, linear_regression
  const [currentResults, setCurrentResults] = useState(null); // Results to display (either from counting or statistical)
  const [aiAnalysisMode, setAiAnalysisMode] = useState('single'); // 'single' or 'compare_all'
  
  // Product Image Generator states
  const [productImagePrompt, setProductImagePrompt] = useState('');
  const [productImage, setProductImage] = useState(null);
  const [loadingProductImage, setLoadingProductImage] = useState(false);
  const [selectedReferenceIndices, setSelectedReferenceIndices] = useState([]);
  
  // Shelf Simulation states
  const [environmentType, setEnvironmentType] = useState('auto');
  const [shelfStyle, setShelfStyle] = useState('eye_level');
  const [shelfPrompt, setShelfPrompt] = useState('');
  const [shelfImage, setShelfImage] = useState(null);
  const [loadingShelfImage, setLoadingShelfImage] = useState(false)

  useEffect(() => {
    if (user && token && studyId) {
      loadResults();
    }
  }, [user, token, studyId]);

  // Load default method (MNL) when component mounts
  useEffect(() => {
    if (results && token && studyId && selectedMethod === 'mnl' && !statisticalData) {
      loadStatisticalAnalysis('mnl');
    }
  }, [results, token, studyId]);

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
      setCurrentResults(resultsRes.data); // Set initial results as counting method
    } catch (error) {
      console.error('Error loading results:', error);
      toast.error('ไม่สามารถโหลดผลการวิเคราะห์ได้');
    } finally {
      setLoading(false);
    }
  };

  const loadStatisticalAnalysis = async (method) => {
    setLoadingStatistical(true);
    try {
      if (method === 'counting') {
        // Use original results for counting method
        setCurrentResults(results);
        setStatisticalData(null);
        toast.success('แสดงผลแบบ Counting Method');
      } else {
        // Load statistical analysis
        const response = await axios.get(
          `${API}/conjoint/studies/${studyId}/statistical-analysis?method=${method}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStatisticalData(response.data);
        setCurrentResults(response.data.results);
        toast.success(`วิเคราะห์ด้วย ${getMethodName(method)} สำเร็จ!`);
      }
    } catch (error) {
      console.error('Error loading statistical analysis:', error);
      toast.error('ไม่สามารถวิเคราะห์ได้');
    } finally {
      setLoadingStatistical(false);
    }
  };

  const getMethodName = (method) => {
    const names = {
      'counting': 'Counting Method (นับความถี่)',
      'mnl': 'Multinomial Logit (MNL)',
      'mixed_logit': 'Mixed Logit',
      'hierarchical_bayes': 'Hierarchical Bayes',
      'linear_regression': 'Linear Regression (OLS)'
    };
    return names[method] || method;
  };

  const loadAIInterpretation = async () => {
    setLoadingAI(true);
    try {
      const requestBody = {
        method: selectedMethod,
        compare_all: aiAnalysisMode === 'compare_all'
      };
      
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/ai-interpretation`,
        requestBody,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAiInterpretation(response.data);
      
      if (aiAnalysisMode === 'compare_all') {
        toast.success('วิเคราะห์และเปรียบเทียบทุกวิธีด้วย AI สำเร็จ!');
      } else {
        toast.success(`วิเคราะห์ด้วย AI (${getMethodName(selectedMethod)}) สำเร็จ!`);
      }
    } catch (error) {
      console.error('Error generating AI interpretation:', error);
      toast.error('ไม่สามารถสร้างคำแนะนำด้วย AI ได้');
    } finally {
      setLoadingAI(false);
    }
  };


  const handleGenerateProductImage = async () => {
    setLoadingProductImage(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-product-from-results`,
        {
          additional_prompt: productImagePrompt || undefined,
          reference_image_indices: selectedReferenceIndices.length > 0 ? selectedReferenceIndices : undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setProductImage(response.data);
      toast.success('สร้างภาพผลิตภัณฑ์สำเร็จ!');
    } catch (error) {
      console.error('Error generating product image:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างภาพผลิตภัณฑ์ได้');
    } finally {
      setLoadingProductImage(false);
    }
  };

  const handleGenerateShelfSimulation = async () => {
    if (!productImage || !productImage.image_url) {
      toast.error('กรุณาสร้างภาพผลิตภัณฑ์ก่อน');
      return;
    }
    
    setLoadingShelfImage(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-shelf-simulation`,
        {
          product_image_url: productImage.image_url,
          environment_type: environmentType,
          shelf_style: shelfStyle,
          additional_prompt: shelfPrompt || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setShelfImage(response.data);
      toast.success('สร้างภาพจำลองชั้นวางสำเร็จ!');
    } catch (error) {
      console.error('Error generating shelf simulation:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างภาพจำลองได้');
    } finally {
      setLoadingShelfImage(false);
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

  if (!currentResults || currentResults.status === 'insufficient_data') {
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
              ปัจจุบัน: {currentResults?.respondent_count || 0} คำตอบ
            </p>
            <p className="text-sm text-gray-500 mt-4">
              ยังขาดอีก {Math.max(0, 30 - (currentResults?.respondent_count || 0))} คำตอบ
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // Sort importance scores (use currentResults instead of results)
  const sortedImportance = Object.entries(currentResults?.importance_scores || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.importance - a.importance);

  const topFeatures = sortedImportance; // Show all features

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

        {/* Statistical Method Selector */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 shadow-sm border-2 border-blue-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <label className="text-sm font-bold text-gray-700">เลือกวิธีการวิเคราะห์:</label>
            </div>
            <select
              value={selectedMethod}
              onChange={(e) => {
                setSelectedMethod(e.target.value);
                loadStatisticalAnalysis(e.target.value);
              }}
              className="px-4 py-2 border-2 border-blue-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]"
            >
              <option value="counting">📊 Counting Method (นับความถี่)</option>
              <option value="mnl">⭐ Multinomial Logit (MNL)</option>
              <option value="linear_regression">📈 Linear Regression (OLS)</option>
              <option value="mixed_logit">🔀 Mixed Logit</option>
              <option value="hierarchical_bayes">🎯 Hierarchical Bayes</option>
            </select>
            {loadingStatistical && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm">กำลังคำนวณ...</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-white rounded-lg p-2 shadow-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-6 py-3 rounded-md font-bold transition-all ${
              activeTab === 'overview'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <PieChartIcon className="w-5 h-5" />
              <span>ภาพรวมและคำแนะนำ</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('academic')}
            className={`flex-1 px-6 py-3 rounded-md font-bold transition-all ${
              activeTab === 'academic'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <GraduationCap className="w-5 h-5" />
              <span>เชิงวิชาการและสถิติ</span>
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">จำนวนผู้ตอบ</p>
                <p className="text-3xl font-black text-blue-600">{currentResults?.respondent_count || results?.respondent_count || 0}</p>
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                AI ตีความผลและข้อเสนอแนะ
              </h2>
            </div>
            
            {/* AI Analysis Mode Selector */}
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border-2 border-indigo-200">
              <label className="text-sm font-semibold text-gray-700">โหมดวิเคราะห์:</label>
              <select
                value={aiAnalysisMode}
                onChange={(e) => {
                  setAiAnalysisMode(e.target.value);
                  setAiInterpretation(null); // Reset AI interpretation when mode changes
                }}
                className="text-sm border-2 border-indigo-300 rounded px-3 py-1 font-medium text-gray-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="single">วิธีเดียว ({getMethodName(selectedMethod)})</option>
                <option value="compare_all">เปรียบเทียบทุกวิธี</option>
              </select>
            </div>
          </div>

          {/* Description based on mode */}
          <div className="mb-4">
            {aiAnalysisMode === 'single' ? (
              <p className="text-sm text-indigo-700 bg-indigo-100 px-4 py-2 rounded-lg border border-indigo-200">
                📊 <strong>วิธีเดียว:</strong> AI จะวิเคราะห์ผลจาก <strong>{getMethodName(selectedMethod)}</strong> ที่กำลังแสดงอยู่บน UI
              </p>
            ) : (
              <p className="text-sm text-purple-700 bg-purple-100 px-4 py-2 rounded-lg border border-purple-200">
                🔬 <strong>เปรียบเทียบทุกวิธี:</strong> AI จะวิเคราะห์และเปรียบเทียบผลจาก 5 วิธี (Counting, Linear Regression, MNL, Mixed Logit, Hierarchical Bayes) เพื่อให้ข้อมูลที่ครอบคลุมและแม่นยำยิ่งขึ้น
              </p>
            )}
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
                    {aiAnalysisMode === 'compare_all' ? 'วิเคราะห์และเปรียบเทียบทุกวิธี' : 'วิเคราะห์ด้วย AI'}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-6 border-2 border-indigo-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                  <Sparkles className="w-4 h-4" />
                  {aiInterpretation.summary_data?.mode === 'compare_all' 
                    ? `ผลการวิเคราะห์จากทุกวิธี (${Object.keys(aiInterpretation.summary_data?.methods || {}).length} วิธี)`
                    : `ผลการวิเคราะห์จาก ${getMethodName(aiInterpretation.summary_data?.method || selectedMethod)}`
                  }
                </div>
                <Button
                  onClick={loadAIInterpretation}
                  disabled={loadingAI}
                  variant="outline"
                  size="sm"
                  className="border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                >
                  {loadingAI ? (
                    <>
                      <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                      กำลังวิเคราะห์...
                    </>
                  ) : (
                    <>
                      🔄 วิเคราะห์ใหม่
                    </>
                  )}
                </Button>
              </div>
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {aiInterpretation.interpretation}
                </div>
              </div>
            </div>
          )}
        </Card>


        {/* Product Image Generator - Only show if AI interpretation is available */}
        {aiInterpretation && (
          <Card className="p-6 mb-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                🎨 เครื่องมือสร้างภาพผลิตภัณฑ์ตามผลการวิจัย
              </h2>
            </div>
            
            <p className="text-sm text-green-700 mb-4">
              สร้างภาพผลิตภัณฑ์ที่เหมาะสมที่สุดตามผลการวิจัย Conjoint Analysis (คุณสมบัติที่ผู้บริโภคต้องการมากที่สุด)
            </p>

            {!productImage ? (
              <div className="space-y-4">
                {/* Reference Images Management */}
                <div className="p-4 bg-white rounded-lg border-2 border-green-200">
                  <h3 className="font-bold text-gray-900 mb-3">📷 รูปอ้างอิง (Reference Images)</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    อัพโหลดรูปภาพเพื่อเป็นแนวทางในการสร้างภาพผลิตภัณฑ์ (สูงสุด 5 รูป)
                  </p>
                  
                  {study?.reference_images && study.reference_images.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-5 gap-2">
                        {study.reference_images.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <div
                              onClick={() => {
                                setSelectedReferenceIndices(prev =>
                                  prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                );
                              }}
                              className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                                selectedReferenceIndices.includes(idx)
                                  ? 'border-green-500 ring-2 ring-green-300'
                                  : 'border-gray-300 hover:border-green-400'
                              }`}
                            >
                              <img
                                src={img}
                                alt={`Reference ${idx + 1}`}
                                className="w-full h-20 object-cover"
                              />
                              {selectedReferenceIndices.includes(idx) && (
                                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                                  ✓
                                </div>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await axios.delete(
                                    `${API}/conjoint/studies/${studyId}/reference-images/${idx}`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                  );
                                  loadResults();
                                  toast.success('ลบรูปอ้างอิงสำเร็จ');
                                } catch (error) {
                                  toast.error('ไม่สามารถลบรูปได้');
                                }
                              }}
                              className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-green-700">
                        คลิกเพื่อเลือกรูปที่ต้องการใช้อ้างอิง (เลือกได้หลายรูป)
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">ยังไม่มีรูปอ้างอิง</p>
                  )}
                  
                  {(!study?.reference_images || study.reference_images.length < 5) && (
                    <div className="mt-3">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length === 0) return;
                          
                          const currentCount = study?.reference_images?.length || 0;
                          if (currentCount + files.length > 5) {
                            toast.error(`สามารถอัพโหลดได้สูงสุด 5 รูป (ปัจจุบันมี ${currentCount} รูป)`);
                            return;
                          }
                          
                          try {
                            const imageUrls = await Promise.all(
                              files.map(file => {
                                return new Promise((resolve) => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => resolve(reader.result);
                                  reader.readAsDataURL(file);
                                });
                              })
                            );
                            
                            const existingImages = study?.reference_images || [];
                            await axios.post(
                              `${API}/conjoint/studies/${studyId}/reference-images`,
                              { image_urls: [...existingImages, ...imageUrls] },
                              { headers: { Authorization: `Bearer ${token}` } }
                            );
                            
                            loadResults();
                            toast.success(`อัพโหลด ${files.length} รูปสำเร็จ`);
                            e.target.value = '';
                          } catch (error) {
                            toast.error('ไม่สามารถอัพโหลดรูปได้');
                          }
                        }}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                      />
                    </div>
                  )}
                </div>

                {/* Additional Prompt */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Prompt เพิ่มเติม (ไม่บังคับ)
                  </label>
                  <textarea
                    value={productImagePrompt}
                    onChange={(e) => setProductImagePrompt(e.target.value)}
                    placeholder="เช่น: สไตล์โมเดิร์น, โทนสีอบอุ่น, แพคเกจสีฟ้า..."
                    rows={2}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>

                <Button
                  onClick={handleGenerateProductImage}
                  disabled={loadingProductImage}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold"
                >
                  {loadingProductImage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      กำลังสร้างภาพ...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      สร้างภาพผลิตภัณฑ์
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                  <img
                    src={productImage.image_url}
                    alt="Generated Product"
                    className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                  />
                  
                  {productImage.optimal_features && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                      <h4 className="font-semibold text-green-900 mb-2">คุณสมบัติที่แนะนำ:</h4>
                      <ul className="text-sm text-green-800 space-y-1">
                        {productImage.optimal_features.map((feature, idx) => (
                          <li key={idx}>• {feature}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {productImage.prompt_used && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      <strong>Prompt ที่ใช้:</strong> {productImage.prompt_used}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setProductImage(null)}
                    variant="outline"
                    className="flex-1"
                  >
                    🔄 สร้างใหม่
                  </Button>
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = productImage.image_url;
                      link.download = `product-${studyId}.png`;
                      link.click();
                      toast.success('ดาวน์โหลดรูปภาพสำเร็จ');
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    📥 ดาวน์โหลด
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Shelf Simulation - Only show if product image is generated */}
        {productImage && (
          <Card className="p-6 mb-8 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                🏪 จำลองภาพสินค้าบนชั้นวาง (On-Shelf Simulation)
              </h2>
            </div>
            
            <p className="text-sm text-amber-700 mb-4">
              สร้างภาพจำลองสินค้าของคุณในสภาพแวดล้อมจริง เพื่อดูว่าจะดึงดูดความสนใจในตลาดได้มากแค่ไหน
            </p>

            {!shelfImage ? (
              <div className="space-y-4">
                {/* Environment Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ประเภทสภาพแวดล้อม
                  </label>
                  <select
                    value={environmentType}
                    onChange={(e) => setEnvironmentType(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  >
                    <option value="auto">🤖 ให้ AI เลือกอัตโนมัติ (จากประเภทสินค้า)</option>
                    <option value="cosmetics_store">💄 ร้านเครื่องสำอาง (Boots, Watson)</option>
                    <option value="convenience_store">🏪 ร้านสะดวกซื้อ (7-11, ตู้แช่)</option>
                    <option value="supermarket">🛒 ซูเปอร์มาร์เก็ต (Lotus's, Big C)</option>
                    <option value="mall">🏬 ห้างสรรพสินค้า (Mall)</option>
                  </select>
                </div>

                {/* Shelf Style */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    สไตล์การจัดวาง
                  </label>
                  <select
                    value={shelfStyle}
                    onChange={(e) => setShelfStyle(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  >
                    <option value="eye_level">👁️ ระดับสายตา (Eye Level) - เด่นชัด</option>
                    <option value="shelf_view">📦 มุมชั้นวาง (Shelf View) - กับสินค้าอื่น</option>
                    <option value="aisle_view">🛤️ มุมทางเดิน (Aisle View) - บริบทร้านค้า</option>
                  </select>
                </div>

                {/* Additional Prompt */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ปรับแต่งเพิ่มเติม (ไม่บังคับ)
                  </label>
                  <textarea
                    value={shelfPrompt}
                    onChange={(e) => setShelfPrompt(e.target.value)}
                    placeholder="เช่น: แสงสว่างมาก, มีป้ายโปรโมชั่น, สินค้าคู่แข่งเยอะ..."
                    rows={2}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <Button
                  onClick={handleGenerateShelfSimulation}
                  disabled={loadingShelfImage}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold"
                >
                  {loadingShelfImage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      กำลังสร้างภาพจำลอง...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      สร้างภาพจำลองชั้นวาง
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border-2 border-amber-200">
                  <img
                    src={shelfImage.image_url}
                    alt="Shelf Simulation"
                    className="w-full rounded-lg shadow-lg"
                  />
                  
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-amber-50 rounded">
                      <strong className="text-amber-900">สภาพแวดล้อม:</strong>
                      <p className="text-amber-700">{shelfImage.environment_type?.replace('_', ' ')}</p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded">
                      <strong className="text-amber-900">สไตล์:</strong>
                      <p className="text-amber-700">{shelfImage.shelf_style?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  
                  {shelfImage.prompt_used && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      <strong>Prompt ที่ใช้:</strong> {shelfImage.prompt_used}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setShelfImage(null)}
                    variant="outline"
                    className="flex-1"
                  >
                    🔄 สร้างใหม่
                  </Button>
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = shelfImage.image_url;
                      link.download = `shelf-simulation-${studyId}.png`;
                      link.click();
                      toast.success('ดาวน์โหลดรูปภาพสำเร็จ');
                    }}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    📥 ดาวน์โหลด
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}


        {/* Pie Chart */}
        <Card className="p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <PieChartIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                สัดส่วนความสำคัญของแต่ละคุณลักษณะ
              </h2>
              <p className="text-sm text-gray-600">
                แผนภูมิวงกลมแสดงสัดส่วนความสำคัญ (% จาก 100%) <br/>
                <span className="text-xs text-blue-600 font-medium">
                  📊 วิธีการคำนวณปัจจุบัน: {getMethodName(selectedMethod)}
                </span>
                <br/>
                {currentResults?.utility_interpretation && (
                  <span className="text-xs text-gray-500 italic">
                    {currentResults.utility_interpretation}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `${value}%`}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '8px'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span className="text-sm font-medium">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
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

                {/* Bar Chart for Levels */}
                {currentResults?.part_worths?.[feature.id] && (
                  <div className="mt-4 pl-11">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-gray-600" />
                      <p className="text-xs text-gray-600 font-semibold">เปรียบเทียบ Utility ของแต่ละระดับ:</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={Object.values(currentResults?.part_worths?.[feature.id]?.levels || {})
                            .sort((a, b) => b.utility - a.utility)
                            .map(level => ({
                              name: level.value,
                              utility: parseFloat(level.utility.toFixed(2)),
                              count: level.selection_count
                            }))}
                          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 12 }}
                            angle={-15}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }}
                            label={{ value: 'Utility', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                          />
                          <Tooltip 
                            formatter={(value, name, props) => {
                              if (name === 'utility') return [`${value}`, 'Utility'];
                              return [value, name];
                            }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white p-3 border-2 border-gray-200 rounded-lg shadow-lg">
                                    <p className="font-bold text-gray-900">{payload[0].payload.name}</p>
                                    <p className="text-blue-600">Utility: {payload[0].value}</p>
                                    <p className="text-green-600 text-sm">เลือก {payload[0].payload.count} ครั้ง</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey="utility" 
                            fill={COLORS[index % COLORS.length]}
                            radius={[8, 8, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-500 text-center mt-2">
                        💡 แท่งสูง = ผู้บริโภคให้คะแนนมากกว่า (ชอบมากกว่า)
                      </p>
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
          </>
        )}

        {/* Academic Tab */}
        {activeTab === 'academic' && (
          <>
            {/* Relative Importance Table */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Relative Importance Scores</h2>
                  <p className="text-sm text-gray-600">
                    ความสำคัญสัมพัทธ์ของแต่ละคุณลักษณะ (คำนวณจาก Range ของ Utility)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-100 to-yellow-100">
                      <th className="border-2 border-orange-300 px-4 py-3 text-center font-bold text-gray-900">
                        อันดับ
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-left font-bold text-gray-900">
                        คุณลักษณะ
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-right font-bold text-gray-900">
                        Range (Max - Min)
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-right font-bold text-gray-900">
                        Relative Importance (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedImportance.map((feature, index) => {
                      const levels = Object.values(currentResults?.part_worths?.[feature.id]?.levels || {});
                      const utilities = levels.map(l => l.utility);
                      const range = utilities.length > 0 ? Math.max(...utilities) - Math.min(...utilities) : 0;
                      
                      return (
                        <tr key={feature.id} className="hover:bg-orange-50">
                          <td className="border-2 border-orange-200 px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' :
                              index === 1 ? 'bg-gray-400' :
                              index === 2 ? 'bg-orange-400' : 'bg-gray-300'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 font-bold text-gray-900">
                            {feature.name}
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 text-right font-mono text-gray-700">
                            {range.toFixed(3)}
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 text-right">
                            <span className="text-2xl font-black text-orange-600">
                              {feature.importance.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-orange-100 font-bold">
                      <td colSpan="3" className="border-2 border-orange-300 px-4 py-3 text-right">
                        รวม:
                      </td>
                      <td className="border-2 border-orange-300 px-4 py-3 text-right text-orange-600">
                        100.00%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>📐 สูตรการคำนวณ ({getMethodName(selectedMethod)}):</strong>
                </p>
                <div className="font-mono text-xs bg-white p-3 rounded border border-orange-300">
                  {selectedMethod === 'counting' && (
                    <>
                      <p>Selection%<sub>i</sub> = (Count<sub>i</sub> / Total Count) × 100%</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: นับจำนวนครั้งที่แต่ละ level ถูกเลือก</p>
                    </>
                  )}
                  {selectedMethod === 'mnl' && (
                    <>
                      <p>β<sub>i</sub> = Logit coefficient จาก MNL model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: reference level มี β = 0</p>
                    </>
                  )}
                  {selectedMethod === 'linear_regression' && (
                    <>
                      <p>β<sub>i</sub> = OLS regression coefficient</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: reference level มี β = 0</p>
                    </>
                  )}
                  {selectedMethod === 'mixed_logit' && (
                    <>
                      <p>β<sub>i</sub> = Mean coefficient จาก Mixed Logit model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: แสดง heterogeneity ของ preferences</p>
                    </>
                  )}
                  {selectedMethod === 'hierarchical_bayes' && (
                    <>
                      <p>β<sub>i</sub> = Population mean จาก HB model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: Individual-level estimates aggregated</p>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Statistical Summary */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">สถิติการวิจัย</h2>
            {/* Part-Worth Utilities Table */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Part-Worth Utilities</h2>
                  <p className="text-sm text-gray-600">
                    ค่า Utility ของแต่ละระดับ (คะแนนความพึงพอใจที่ผู้บริโภคให้)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-100 to-pink-100">
                      <th className="border-2 border-purple-300 px-4 py-3 text-left font-bold text-gray-900">
                        คุณลักษณะ
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-left font-bold text-gray-900">
                        ระดับ
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-right font-bold text-gray-900">
                        Utility
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-right font-bold text-gray-900">
                        จำนวนครั้งที่เลือก
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedImportance.map((feature, attrIdx) => {
                      const levels = currentResults?.part_worths?.[feature.id]?.levels || {};
                      const sortedLevels = Object.values(levels).sort((a, b) => b.utility - a.utility);
                      
                      return sortedLevels.map((level, levelIdx) => (
                        <tr key={`${feature.id}-${levelIdx}`} className="hover:bg-purple-50">
                          {levelIdx === 0 && (
                            <td
                              className="border-2 border-purple-200 px-4 py-3 font-bold text-gray-900 bg-purple-50"
                              rowSpan={sortedLevels.length}
                            >
                              {feature.name}
                            </td>
                          )}
                          <td className="border-2 border-purple-200 px-4 py-3 text-gray-700">
                            {levelIdx === 0 && '⭐ '}{level.value}
                          </td>
                          <td className={`border-2 border-purple-200 px-4 py-3 text-right font-mono font-bold ${
                            level.utility > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {level.utility > 0 ? '+' : ''}{level.utility.toFixed(3)}
                          </td>
                          <td className="border-2 border-purple-200 px-4 py-3 text-right text-gray-600">
                            {level.selection_count}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                <p className="text-sm text-gray-700">
                  <strong>💡 คำอธิบาย:</strong> Utility คือคะแนนความพึงพอใจ ค่า<strong className="text-green-600"> บวก (+)</strong> = ผู้บริโภคชอบมากกว่าค่าเฉลี่ย, 
                  ค่า<strong className="text-red-600"> ลบ (-)</strong> = ชอบน้อยกว่าค่าเฉลี่ย
                </p>
              </div>
            </Card>

            {/* Statistical Analysis with Method Selection */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">การวิเคราะห์ทางสถิติ (Statistical Analysis)</h2>
                  <p className="text-sm text-gray-600">
                    เลือกวิธีการวิเคราะห์ตามมาตรฐานทางวิชาการ
                  </p>
                </div>
              </div>

              {/* Method Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-2 block">
                    เลือกวิธีการวิเคราะห์:
                  </label>
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="w-full p-3 border-2 border-indigo-300 rounded-lg font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="mnl">⭐ Multinomial Logit (MNL) - แนะนำ</option>
                    <option value="mixed_logit">Mixed Logit (Random Parameters)</option>
                    <option value="hierarchical_bayes">Hierarchical Bayes (HB)</option>
                    <option value="linear_regression">Linear Regression (OLS)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={() => loadStatisticalAnalysis(selectedMethod)}
                    disabled={loadingStatistical}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold h-12"
                  >
                    {loadingStatistical ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        กำลังคำนวณ...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-4 h-4 mr-2" />
                        คำนวณด้วย {getMethodName(selectedMethod)}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Method Descriptions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-xs font-bold text-indigo-900 mb-1">⭐ Multinomial Logit (MNL)</p>
                  <p className="text-xs text-gray-600">มาตรฐานวิชาการ, มี p-values, Log-likelihood, Pseudo R²</p>
                  <p className="text-xs text-indigo-700 mt-1">📊 Utility: Logit coefficients (อิทธิพลต่อการตัดสินใจ)</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-bold text-purple-900 mb-1">Mixed Logit</p>
                  <p className="text-xs text-gray-600">แสดงความแตกต่างของความชอบระหว่างผู้ตอบแต่ละคน</p>
                  <p className="text-xs text-purple-700 mt-1">📊 Utility: Mean & Std of preferences</p>
                </div>
                <div className="p-3 bg-pink-50 rounded-lg border border-pink-200">
                  <p className="text-xs font-bold text-pink-900 mb-1">Hierarchical Bayes</p>
                  <p className="text-xs text-gray-600">วิเคราะห์ทั้งระดับบุคคลและประชากร (Empirical Bayes)</p>
                  <p className="text-xs text-pink-700 mt-1">📊 Utility: Individual-level estimates</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-bold text-blue-900 mb-1">Linear Regression</p>
                  <p className="text-xs text-gray-600">วิธีพื้นฐาน OLS Regression พร้อม R² และ coefficients</p>
                  <p className="text-xs text-blue-700 mt-1">📊 Utility: OLS coefficients (linear relationship)</p>
                </div>
              </div>

              {!statisticalData ? (
                <div className="text-center py-8 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                  <p className="text-gray-600 mb-4">
                    คลิกปุ่มด้านบนเพื่อคำนวณผลการวิเคราะห์ความถดถอยเชิงเส้น
                  </p>
                  <p className="text-xs text-gray-500">
                    ใช้ Ordinary Least Squares (OLS) Regression
                  </p>
                </div>
              ) : (
                <>
                  {/* Model Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg border-2 border-indigo-200">
                      <p className="text-sm text-gray-600 mb-1">R² (Coefficient of Determination)</p>
                      <p className="text-3xl font-black text-indigo-600">
                        {(statisticalData.results?.r_squared * 100 || statisticalData.results?.pseudo_r_squared * 100 || 0).toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Model fit quality</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                      <p className="text-sm text-gray-600 mb-1">Observations</p>
                      <p className="text-3xl font-black text-green-600">
                        {statisticalData.results?.n_observations}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Total data points</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                      <p className="text-sm text-gray-600 mb-1">Intercept (β₀)</p>
                      <p className="text-3xl font-black text-purple-600">
                        {(statisticalData.results?.intercept || 0).toFixed(4)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Baseline probability</p>
                    </div>
                  </div>

                  {/* Utility Scale Info */}
                  {statisticalData.results?.utility_interpretation && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-blue-900 mb-1">
                            📊 วิธีการคำนวณ Utility:
                          </p>
                          <p className="text-xs text-gray-700">
                            {statisticalData.results.utility_interpretation}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Regression Coefficients Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                          <th className="border-2 border-indigo-300 px-4 py-3 text-left font-bold text-gray-900">
                            คุณลักษณะ
                          </th>
                          <th className="border-2 border-indigo-300 px-4 py-3 text-left font-bold text-gray-900">
                            ระดับ
                          </th>
                          <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                            Coefficient (β)
                          </th>
                          <th className="border-2 border-indigo-300 px-4 py-3 text-center font-bold text-gray-900">
                            สถานะ
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {statisticalData.results?.part_worths ? (
                          // Use part_worths structure for MNL analysis
                          Object.entries(statisticalData.results.part_worths).map(([attrId, attrData]) => {
                            const levels = Object.values(attrData.levels || {});
                            return levels.map((level, levelIdx) => (
                              <tr key={`${attrId}-${levelIdx}`} className="hover:bg-indigo-50">
                                {levelIdx === 0 && (
                                  <td
                                    className="border-2 border-indigo-200 px-4 py-3 font-bold text-gray-900 bg-indigo-50"
                                    rowSpan={levels.length}
                                  >
                                    {attrData.name}
                                  </td>
                                )}
                                <td className="border-2 border-indigo-200 px-4 py-3 text-gray-700">
                                  {level.value}
                                </td>
                                <td className={`border-2 border-indigo-200 px-4 py-3 text-right font-mono font-bold ${
                                  level.utility === 0 ? 'text-gray-400' :
                                  level.utility > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {level.utility === 0 ? '0.0000 (ref)' : 
                                    (level.utility > 0 ? '+' : '') + level.utility.toFixed(4)}
                                </td>
                                <td className="border-2 border-indigo-200 px-4 py-3 text-center">
                                  {level.utility === 0 ? (
                                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-bold">
                                      Reference
                                    </span>
                                  ) : Math.abs(level.utility) > 0.01 ? (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                                      Significant
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">
                                      Low
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })
                        ) : (
                          // Fallback for other analysis methods that might use coefficients structure
                          Object.entries(statisticalData.results?.coefficients || {}).map(([attrId, attrData]) => {
                            const levels = Object.values(attrData?.levels || {});
                            return levels.map((level, levelIdx) => (
                              <tr key={`${attrId}-${levelIdx}`} className="hover:bg-indigo-50">
                                {levelIdx === 0 && (
                                  <td
                                    className="border-2 border-indigo-200 px-4 py-3 font-bold text-gray-900 bg-indigo-50"
                                    rowSpan={levels.length}
                                  >
                                    {attrData?.name || attrId}
                                  </td>
                                )}
                                <td className="border-2 border-indigo-200 px-4 py-3 text-gray-700">
                                  {level?.value || 'N/A'}
                                </td>
                                <td className={`border-2 border-indigo-200 px-4 py-3 text-right font-mono font-bold ${
                                  level?.is_reference ? 'text-gray-400' :
                                  (level?.coefficient || 0) > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {level?.is_reference ? '0.0000 (ref)' : 
                                    ((level?.coefficient || 0) > 0 ? '+' : '') + (level?.coefficient || 0).toFixed(4)}
                                </td>
                                <td className="border-2 border-indigo-200 px-4 py-3 text-center">
                                  {level?.is_reference ? (
                                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-bold">
                                      Reference
                                    </span>
                                  ) : Math.abs(level?.coefficient || 0) > 0.01 ? (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                                      Significant
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">
                                      Low
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Interpretation */}
                  <div className="mt-4 p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>💡 คำอธิบาย:</strong>
                    </p>
                    <ul className="text-sm text-gray-700 space-y-1 ml-4">
                      <li>• <strong>Coefficient (β):</strong> ค่าสัมประสิทธิ์ บวก = เพิ่มโอกาสถูกเลือก, ลบ = ลดโอกาส</li>
                      <li>• <strong>Reference Level:</strong> ระดับอ้างอิง (β=0) ใช้เปรียบเทียบกับระดับอื่น</li>
                      <li>• <strong>R²:</strong> อธิบายความแปรปรวนได้ {((statisticalData.results?.r_squared || statisticalData.results?.pseudo_r_squared || 0) * 100).toFixed(1)}% 
                        ({(statisticalData.results?.r_squared || statisticalData.results?.pseudo_r_squared || 0) > 0.3 ? 'ดี' : 'ปานกลาง'})</li>
                    </ul>
                  </div>

                  <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                    <p className="text-sm font-bold text-gray-900 mb-2">📐 สมการ Regression Model:</p>
                    <div className="font-mono text-xs bg-white p-3 rounded border border-purple-300 overflow-x-auto">
                      <p>P(Choice) = {(statisticalData.results?.intercept || 0).toFixed(4)}</p>
                      {statisticalData.results?.part_worths ? (
                        // Use part_worths structure for MNL analysis
                        Object.entries(statisticalData.results.part_worths).map(([attrId, attrData]) => {
                          return Object.values(attrData.levels || {})
                            .filter(level => level.utility !== 0)
                            .map((level, idx) => (
                              <p key={idx}>
                                &nbsp;&nbsp;&nbsp;&nbsp;{level.utility > 0 ? '+' : ''} 
                                {level.utility.toFixed(4)} × [{attrData.name}_{level.value}]
                              </p>
                            ));
                        })
                      ) : (
                        // Fallback for other analysis methods
                        Object.entries(statisticalData.results?.coefficients || {}).map(([attrId, attrData]) => {
                          return Object.values(attrData?.levels || {})
                            .filter(level => !level?.is_reference)
                            .map((level, idx) => (
                              <p key={idx}>
                                &nbsp;&nbsp;&nbsp;&nbsp;{(level?.coefficient || 0) > 0 ? '+' : ''} 
                                {(level?.coefficient || 0).toFixed(4)} × [{attrData?.name || attrId}_{level?.value}]
                              </p>
                            ));
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </Card>

                  <p className="text-sm text-gray-600">
                    ข้อมูลสถิติพื้นฐานของการศึกษา
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนผู้ตอบแบบสอบถาม</p>
                  <p className="text-3xl font-black text-blue-600">{currentResults?.respondent_count || results?.respondent_count || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">respondents</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนคุณลักษณะ</p>
                  <p className="text-3xl font-black text-green-600">{sortedImportance.length}</p>
                  <p className="text-xs text-gray-500 mt-1">attributes</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนระดับทั้งหมด</p>
                  <p className="text-3xl font-black text-purple-600">
                    {sortedImportance.reduce((sum, f) => {
                      return sum + Object.keys(currentResults?.part_worths?.[f.id]?.levels || {}).length;
                    }, 0)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">levels</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg border-2 border-orange-200">
                  <p className="text-sm text-gray-600 mb-1">วิธีการวิเคราะห์</p>
                  <p className="text-lg font-bold text-orange-600">Choice-Based</p>
                  <p className="text-xs text-gray-500 mt-1">Conjoint Analysis</p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                <h3 className="font-bold text-gray-900 mb-3">📚 วิธีการทางสถิติ</h3>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>Counting-based approach:</strong> นับจำนวนครั้งที่แต่ละระดับถูกเลือก</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>Part-worth calculation:</strong> คำนวณ utility จากความถี่การเลือก</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>Relative importance:</strong> คำนวณจาก range (max-min) ของ utilities</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>Normalization:</strong> ปรับค่าให้รวมเป็น 100%</span>
                  </li>
                </ul>
              </div>
            </Card>

            {/* Raw Data Export Info */}
            <Card className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
              <div className="flex items-start gap-3">
                <Download className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">📥 ดาวน์โหลดข้อมูลดิบ</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    สำหรับการวิเคราะห์เชิงลึกหรือนำไปใช้กับซอฟต์แวร์สถิติอื่นๆ
                  </p>
                  <Button
                    onClick={handleExportCSV}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ดาวน์โหลด CSV
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    ไฟล์ CSV จะประกอบด้วย: Respondent ID, Email, Timestamp, Choices
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default ConjointResultsPage;