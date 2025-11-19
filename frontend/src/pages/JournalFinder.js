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
import { ArrowLeft, Sparkles, Loader2, Search, BookOpen, TrendingUp, Award, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'https://acadtools.preview.emergentagent.com';

const JournalFinder = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [formData, setFormData] = useState({
    topic: '',
    abstract: '',
    keywords: ''
  });

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);

  const handleSearch = async () => {
    if (!formData.topic.trim() || !formData.abstract.trim()) {
      toast.error('กรุณากรอกหัวข้อวิจัยและ Abstract');
      return;
    }

    try {
      setSearching(true);
      setResults(null);

      const response = await axios.post(
        `${API}/api/journal-finder`,
        {
          ...formData,
          target_language: 'th'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setResults(response.data);
      toast.success('ค้นหาวารสารสำเร็จ!');
    } catch (error) {
      console.error('Journal search error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถค้นหาวารสารได้');
    } finally {
      setSearching(false);
    }
  };

  const getQuartileColor = (quartile) => {
    const colors = {
      'Q1': 'bg-green-100 text-green-800 border-green-300',
      'Q2': 'bg-blue-100 text-blue-800 border-blue-300',
      'Q3': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'Q4': 'bg-orange-100 text-orange-800 border-orange-300'
    };
    return colors[quartile] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getIndexBadgeColor = (index) => {
    const colors = {
      'Scopus': 'bg-blue-500 text-white',
      'ISI': 'bg-green-500 text-white',
      'ABDC': 'bg-purple-500 text-white',
      'AJG': 'bg-indigo-500 text-white'
    };
    return colors[index] || 'bg-gray-500 text-white';
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
            Journal Finder
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            ค้นหาวารสารวิชาการที่เหมาะสมสำหรับการตีพิมพ์งานวิจัยของคุณด้วย AI
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel: Input Form */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-600" />
              ข้อมูลงานวิจัย
            </h2>

            <div className="space-y-6">
              {/* Research Title */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  หัวข้อวิจัย *
                </Label>
                <Input
                  value={formData.researchTitle}
                  onChange={(e) => setFormData({...formData, researchTitle: e.target.value})}
                  className="mt-2 h-12 border-2 border-gray-300 focus:border-purple-500"
                  placeholder="ใส่หัวข้องานวิจัยของคุณ"
                />
              </div>

              {/* Abstract */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  Abstract *
                </Label>
                <Textarea
                  value={formData.abstract}
                  onChange={(e) => setFormData({...formData, abstract: e.target.value})}
                  className="mt-2 min-h-[200px] border-2 border-gray-300 focus:border-purple-500"
                  placeholder="วางบทคัดย่อ (Abstract) ของงานวิจัย"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ยิ่ง Abstract ละเอียดมากเท่าไหร่ ผลลัพธ์จะแม่นยำมากขึ้น
                </p>
              </div>

              {/* Keywords */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  Keywords (คำสำคัญ)
                </Label>
                <Input
                  value={formData.keywords}
                  onChange={(e) => setFormData({...formData, keywords: e.target.value})}
                  className="mt-2 h-12 border-2 border-gray-300 focus:border-purple-500"
                  placeholder="เช่น Marketing, Consumer Behavior, Digital Marketing"
                />
                <p className="text-xs text-gray-500 mt-1">
                  คั่นด้วยเครื่องหมายจุลภาค (,)
                </p>
              </div>

              {/* Search Button */}
              <Button
                onClick={handleSearch}
                disabled={searching || !formData.researchTitle.trim() || !formData.abstract.trim()}
                className="w-full h-14 bg-gradient-to-r from-[#6B46C1] via-[#7C3AED] to-[#9333EA] hover:from-[#5B35A1] hover:to-[#7C3AED] text-white font-bold shadow-xl text-lg"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    กำลังค้นหาวารสาร...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    ค้นหาวารสารด้วย AI
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Right Panel: Results */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-600" />
              ผลการค้นหา
            </h2>

            {!results && !searching && (
              <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                <BookOpen className="w-20 h-20 mb-4 opacity-30" />
                <p className="text-lg font-medium">ผลการค้นหาจะแสดงที่นี่</p>
                <p className="text-sm">กรอกข้อมูลและคลิกค้นหา</p>
              </div>
            )}

            {searching && (
              <div className="flex flex-col items-center justify-center h-[500px]">
                <Loader2 className="w-16 h-16 text-purple-600 animate-spin mb-4" />
                <p className="text-lg font-medium text-gray-700">กำลังค้นหาวารสารที่เหมาะสม...</p>
                <p className="text-sm text-gray-500 mt-2">AI กำลังวิเคราะห์งานวิจัยของคุณ</p>
              </div>
            )}

            {results && (
              <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
                {/* Analysis Summary */}
                {results.analysis_summary && (
                  <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
                    <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      การวิเคราะห์
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {results.analysis_summary}
                    </p>
                  </div>
                )}

                {/* Journal List */}
                {results.journals && results.journals.length > 0 ? (
                  results.journals.map((journal, idx) => (
                    <Card key={idx} className="p-5 bg-gradient-to-br from-white to-purple-50/30 border-2 border-purple-200 hover:border-purple-400 transition-all hover:shadow-lg">
                      {/* Journal Name */}
                      <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        {journal.name}
                      </h3>

                      {/* Metrics Row */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Impact Factor */}
                        {journal.impact_factor && (
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <div>
                              <p className="text-xs text-gray-600">Impact Factor</p>
                              <p className="text-sm font-bold text-gray-900">{journal.impact_factor}</p>
                            </div>
                          </div>
                        )}

                        {/* Quartile */}
                        {journal.quartile && (
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-green-600" />
                            <div>
                              <p className="text-xs text-gray-600">Quartile</p>
                              <span className={`text-xs font-bold px-2 py-1 rounded border ${getQuartileColor(journal.quartile)}`}>
                                {journal.quartile}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Indexing Badges */}
                      {journal.indexing && journal.indexing.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {journal.indexing.map((index, i) => (
                            <span key={i} className={`text-xs font-bold px-2 py-1 rounded ${getIndexBadgeColor(index)}`}>
                              {index}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Match Reason */}
                      {journal.match_reason && (
                        <div className="mt-3 p-3 bg-white/80 rounded border border-purple-200">
                          <p className="text-xs text-gray-600 mb-1 font-semibold">เหตุผลที่แนะนำ:</p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {journal.match_reason}
                          </p>
                        </div>
                      )}

                      {/* Publisher */}
                      {journal.publisher && (
                        <p className="text-xs text-gray-500 mt-3">
                          <strong>Publisher:</strong> {journal.publisher}
                        </p>
                      )}
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>ไม่พบวารสารที่เหมาะสม</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Info Box */}
        <Card className="mt-8 p-6 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600 rounded-lg flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                เกี่ยวกับ Journal Finder
              </h3>
              <p className="text-sm text-gray-700 mb-3 leading-relaxed">
                Journal Finder ใช้ AI (Claude Sonnet 4) วิเคราะห์งานวิจัยของคุณและแนะนำวารสารที่เหมาะสมที่สุด 
                โดยพิจารณาจาก Impact Factor, Quartile Ranking, และการ Index ในฐานข้อมูลต่างๆ
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>Scopus indexed</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>ISI indexed</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>ABDC ranking</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>AJG ranking</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default JournalFinder;
