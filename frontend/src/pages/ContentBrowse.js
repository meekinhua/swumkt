import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Eye, User, ArrowLeft, Filter } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-gray-900">SWUMKT</span>
            </div>
            
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="nav-dashboard-btn">
                    Dashboard
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="nav-profile-btn">
                    <User className="w-4 h-4 mr-2" />
                    โปรไฟล์
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} data-testid="nav-login-btn">
                    เข้าสู่ระบบ
                  </Button>
                  <Button onClick={() => navigate('/register')} data-testid="nav-register-btn" className="bg-blue-600 hover:bg-blue-700">
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
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" data-testid="browse-title">
            คลังความรู้
          </h1>
          <p className="text-gray-600">เรียกดูผลวิจัย ผลสำรวจ และบทความจากชุมชน SWUMKT</p>
        </div>

        {/* Search and Filter */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                data-testid="search-input"
                placeholder="ค้นหาเนื้อหา..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={filterType} onValueChange={setFilterType} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-5 w-full md:w-auto">
                <TabsTrigger value="all" data-testid="filter-all">ทั้งหมด</TabsTrigger>
                <TabsTrigger value="research" data-testid="filter-research">วิจัย</TabsTrigger>
                <TabsTrigger value="survey" data-testid="filter-survey">สำรวจ</TabsTrigger>
                <TabsTrigger value="article" data-testid="filter-article">บทความ</TabsTrigger>
                <TabsTrigger value="news" data-testid="filter-news">ข่าว</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Card>

        {/* Content Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filteredContents.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-gray-600 text-lg">ไม่พบเนื้อหาที่ตรงกับการค้นหา</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContents.map((content, index) => (
              <Card
                key={content.id}
                className="p-6 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-gray-100 hover:border-blue-200 bg-white"
                onClick={() => navigate(`/content/${content.id}`)}
                data-testid={`content-card-${index}`}
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
                  <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {getTypeLabel(content.content_type)}
                  </span>
                  {content.category && (
                    <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                      {content.category}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                  {content.title}
                </h3>
                
                <p className="text-gray-600 mb-4 line-clamp-3 text-sm">
                  {content.content.substring(0, 150)}...
                </p>

                {content.tags && content.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {content.tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    <span>{content.views || 0} ครั้ง</span>
                  </div>
                  {content.contributors && content.contributors.length > 0 && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
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