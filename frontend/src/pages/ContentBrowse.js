import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Eye, User, ArrowLeft } from 'lucide-react';

const ContentBrowse = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchContents();
  }, []);

  const fetchContents = async () => {
    try {
      const response = await axios.get(`${API}/content`, {
        params: { limit: 50 }
      });
      setContents(response.data);
    } catch (error) {
      console.error('Error fetching contents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContents = contents.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || content.content_type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeLabel = (type) => {
    const labels = {
      research: 'ผลวิจัย',
      survey: 'ผลสำรวจ',
      article: 'บทความ',
      news: 'ข่าวสาร'
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <nav className="bg-white/98 backdrop-blur-xl border-b border-gray-300/50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img 
                src="https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
                alt="SWUMKT Logo"
                className="h-16 w-auto"
              />
            </div>
            
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="nav-dashboard-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                    Dashboard
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="nav-profile-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                    <User className="w-4 h-4 mr-2" />
                    โปรไฟล์
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} data-testid="nav-login-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                    เข้าสู่ระบบ
                  </Button>
                  <Button onClick={() => navigate('/register')} data-testid="nav-register-btn" className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl">
                    ลงทะเบียน
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 fade-in-up">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4 text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> กลับหน้าแรก
          </Button>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" data-testid="browse-title">
            <span className="gradient-text">คลังความรู้</span>
          </h1>
          <p className="text-lg text-gray-700 font-semibold">เรียกดูผลวิจัย ผลสำรวจ และบทความจากชุมชน SWUMKT</p>
        </div>

        {/* Search and Filter */}
        <Card className="p-6 mb-8 bg-white/98 border-2 border-gray-300 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                data-testid="search-input"
                placeholder="ค้นหาเนื้อหา..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
            </div>
            <Tabs value={filterType} onValueChange={setFilterType} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-5 w-full md:w-auto bg-gray-100">
                <TabsTrigger value="all" data-testid="filter-all" className="font-bold">ทั้งหมด</TabsTrigger>
                <TabsTrigger value="research" data-testid="filter-research" className="font-bold">วิจัย</TabsTrigger>
                <TabsTrigger value="survey" data-testid="filter-survey" className="font-bold">สำรวจ</TabsTrigger>
                <TabsTrigger value="article" data-testid="filter-article" className="font-bold">บทความ</TabsTrigger>
                <TabsTrigger value="news" data-testid="filter-news" className="font-bold">ข่าว</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Card>

        {/* Content Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE] mx-auto"></div>
          </div>
        ) : filteredContents.length === 0 ? (
          <Card className="p-12 text-center bg-white/98 border-2 border-gray-300 shadow-lg">
            <p className="text-gray-700 text-lg font-semibold">ไม่พบเนื้อหาที่ตรงกับการค้นหา</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContents.map((content, index) => (
              <Card
                key={content.id}
                className="p-6 bg-white/98 hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 border-gray-300 hover:border-[#00A9CE] card-hover scale-in"
                onClick={() => navigate(`/content/${content.id}`)}
                data-testid={`content-card-${index}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {content.featured_image && (
                  <div className="mb-4 rounded-lg overflow-hidden">
                    <img
                      src={content.featured_image}
                      alt={content.title}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge-success text-xs px-3 py-1.5 rounded-full">
                    {getTypeLabel(content.content_type)}
                  </span>
                  {content.category && (
                    <span className="badge-warning text-xs px-3 py-1.5 rounded-full">
                      {content.category}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-black text-gray-900 mb-2 line-clamp-2">
                  {content.title}
                </h3>
                
                <p className="text-gray-700 mb-4 line-clamp-3 text-sm font-medium">
                  {content.content.substring(0, 150)}...
                </p>

                {content.tags && content.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {content.tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-[#00A9CE]/10 text-[#005A73] rounded font-semibold border border-[#00A9CE]/20">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-600 font-semibold">
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4 text-[#00A9CE]" />
                    <span>{content.views || 0} ครั้ง</span>
                  </div>
                  {content.contributors && content.contributors.length > 0 && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4 text-[#00A9CE]" />
                      <span>{content.contributors.length} คน</span>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentBrowse;