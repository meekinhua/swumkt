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

const API = process.env.REACT_APP_BACKEND_URL || 'https://preference-insight.preview.emergentagent.com';

const JournalFinder = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState('ai'); // 'ai' or 'browse'
  
  const [formData, setFormData] = useState({
    topic: '',
    abstract: '',
    keywords: ''
  });

  const [browseData, setBrowseData] = useState({
    searchQuery: '',
    abdcRating: '',
    ajgRating: ''
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

  const handleBrowse = async () => {
    try {
      setSearching(true);
      setResults(null);

      const response = await axios.post(
        `${API}/api/journal-finder/browse`,
        {
          search_query: browseData.searchQuery || null,
          abdc_rating: browseData.abdcRating || null,
          ajg_rating: browseData.ajgRating || null,
          limit: 100,
          target_language: 'th'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setResults(response.data);
      toast.success(`พบ ${response.data.journals.length} วารสาร`);
    } catch (error) {
      console.error('Journal browse error:', error);
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
      <Navigation />

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

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b-2 border-gray-200">
          <button
            onClick={() => {setActiveTab('ai'); setResults(null);}}
            className={`px-6 py-3 font-bold transition-all ${
              activeTab === 'ai'
                ? 'border-b-4 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-purple-500'
            }`}
          >
            <Sparkles className="w-4 h-4 inline mr-2" />
            AI Search
          </button>
          <button
            onClick={() => {setActiveTab('browse'); setResults(null);}}
            className={`px-6 py-3 font-bold transition-all ${
              activeTab === 'browse'
                ? 'border-b-4 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-purple-500'
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-2" />
            Browse Database
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel: Input Form */}
          <Card className="p-6 bg-white/98 border-2 border-gray-300 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-600" />
              อัปโหลดเอกสาร หรือ ใส่ข้อความ
            </h2>

            {activeTab === 'ai' ? (
              <div className="space-y-6">
              {/* Research Title */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">
                  หัวข้อวิจัย *
                </Label>
                <Input
                  value={formData.topic}
                  onChange={(e) => setFormData({...formData, topic: e.target.value})}
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
                disabled={searching || !formData.topic.trim() || !formData.abstract.trim()}
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
            ) : (
              <div className="space-y-6">
                {/* Search Query */}
                <div>
                  <Label className="text-gray-800 font-bold mb-2">
                    ค้นหาจากชื่อวารสารหรือสำนักพิมพ์
                  </Label>
                  <Input
                    value={browseData.searchQuery}
                    onChange={(e) => setBrowseData({...browseData, searchQuery: e.target.value})}
                    className="mt-2 h-12 border-2 border-gray-300 focus:border-purple-500"
                    placeholder="ใส่ชื่อวารสารหรือสำนักพิมพ์"
                  />
                </div>

                {/* ABDC Rating Filter */}
                <div>
                  <Label className="text-gray-800 font-bold mb-2">
                    ABDC Rating
                  </Label>
                  <select
                    value={browseData.abdcRating}
                    onChange={(e) => setBrowseData({...browseData, abdcRating: e.target.value})}
                    className="w-full mt-2 h-12 border-2 border-gray-300 rounded-md px-3 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    <option value="A*">A* (Top tier)</option>
                    <option value="A">A (Excellent)</option>
                    <option value="B">B (Good)</option>
                    <option value="C">C (Acceptable)</option>
                  </select>
                </div>

                {/* AJG Rating Filter */}
                <div>
                  <Label className="text-gray-800 font-bold mb-2">
                    AJG 2024 Rating
                  </Label>
                  <select
                    value={browseData.ajgRating}
                    onChange={(e) => setBrowseData({...browseData, ajgRating: e.target.value})}
                    className="w-full mt-2 h-12 border-2 border-gray-300 rounded-md px-3 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    <option value="4*">4* (World elite)</option>
                    <option value="4">4 (Top)</option>
                    <option value="3">3 (Highly regarded)</option>
                    <option value="2">2 (Well regarded)</option>
                    <option value="1">1 (Recognized)</option>
                  </select>
                </div>

                {/* Browse Button */}
                <Button
                  onClick={handleBrowse}
                  disabled={searching}
                  className="w-full h-14 bg-gradient-to-r from-[#6B46C1] via-[#7C3AED] to-[#9333EA] hover:from-[#5B35A1] hover:to-[#7C3AED] text-white font-bold shadow-xl text-lg"
                >
                  {searching ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      กำลังค้นหา...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5 mr-2" />
                      ค้นหาจากฐานข้อมูล
                    </>
                  )}
                </Button>
              </div>
            )}
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
                {/* Explanation */}
                {results.explanation && (
                  <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
                    <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      คำอธิบาย
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {results.explanation}
                    </p>
                  </div>
                )}

                {/* Disclaimer */}
                {results.disclaimer && (
                  <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                    <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                      {results.disclaimer}
                    </div>
                  </div>
                )}

                {/* Journal List */}
                {results.journals && results.journals.length > 0 ? (
                  results.journals.map((journal, idx) => (
                    <Card key={idx} className="p-5 bg-gradient-to-br from-white to-purple-50/30 border-2 border-purple-200 hover:border-purple-400 transition-all hover:shadow-lg">
                      {/* Journal Name */}
                      <div className="flex items-start gap-3 mb-3">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900">
                            {journal.journal_name}
                          </h3>
                          {journal.publisher && journal.publisher !== 'Unknown' && (
                            <p className="text-xs text-gray-500 mt-1">
                              <strong>Publisher:</strong> {journal.publisher}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Official Ratings - ABDC and AJG */}
                      <div className="mb-3 flex flex-wrap gap-2">
                        {journal.abdc_rating && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-2 border-green-200 rounded">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <div>
                              <p className="text-xs text-gray-600 font-semibold">ABDC ✅</p>
                              <p className="text-sm font-bold text-green-800">{journal.abdc_rating}</p>
                            </div>
                          </div>
                        )}
                        {journal.ajg_rating && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-2 border-green-200 rounded">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <div>
                              <p className="text-xs text-gray-600 font-semibold">AJG 2024 ✅</p>
                              <p className="text-sm font-bold text-green-800">{journal.ajg_rating}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI-Estimated Data */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {journal.impact_factor && journal.impact_factor !== 'Unknown' && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded">
                            <TrendingUp className="w-4 h-4 text-orange-600" />
                            <div>
                              <p className="text-xs text-gray-600">Impact Factor ⚠️</p>
                              <p className="text-sm font-bold text-gray-900">{journal.impact_factor}</p>
                            </div>
                          </div>
                        )}

                        {journal.quartile && journal.quartile !== 'Unknown' && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded">
                            <Award className="w-4 h-4 text-orange-600" />
                            <div>
                              <p className="text-xs text-gray-600">Quartile ⚠️</p>
                              <span className={`text-xs font-bold px-2 py-1 rounded border ${getQuartileColor(journal.quartile)}`}>
                                {journal.quartile}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Scopus Indexing */}
                      {journal.scopus_indexed && journal.scopus_indexed !== 'Unknown' && (
                        <div className="mb-3">
                          <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-800 border border-blue-300 rounded">
                            Scopus: {journal.scopus_indexed} ⚠️
                          </span>
                        </div>
                      )}

                      {/* SCImago Link */}
                      {journal.scimago_url && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <a 
                            href={journal.scimago_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                          >
                            🔗 ตรวจสอบข้อมูลล่าสุดที่ SCImago →
                          </a>
                        </div>
                      )}

                      {/* Website Link */}
                      {journal.website && (
                        <div className="mt-2">
                          <a 
                            href={journal.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:text-purple-800 font-semibold hover:underline"
                          >
                            🌐 เว็บไซต์วารสาร →
                          </a>
                        </div>
                      )}

                      {/* ISSN */}
                      {journal.issn && (
                        <p className="text-xs text-gray-500 mt-2">
                          <strong>ISSN:</strong> {journal.issn}
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
