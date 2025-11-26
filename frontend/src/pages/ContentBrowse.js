import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Eye, User, ArrowLeft } from 'lucide-react';
import Navigation from '@/components/Navigation';

const ContentBrowse = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchContents();
  }, [currentPage]);

  const fetchContents = async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * itemsPerPage;
      const response = await axios.get(`${API}/content`, {
        params: { 
          skip: skip,
          limit: itemsPerPage 
        }
      });
      
      // Handle new response format with pagination metadata
      if (response.data.items) {
        setContents(response.data.items);
        setTotalItems(response.data.total);
        setHasMore(response.data.has_more);
      } else {
        // Backward compatibility with old format
        setContents(response.data);
        setTotalItems(response.data.length);
      }
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
      <Navigation />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 fade-in-up">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4 text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('auth.backToHome')}
          </Button>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" data-testid="browse-title">
            <span className="gradient-text">{t('content.browse')}</span>
          </h1>
          <p className="text-lg text-gray-700 font-semibold">{t('landing.description')}</p>
        </div>

        {/* Search and Filter */}
        <Card className="p-6 mb-8 bg-white/98 border-2 border-gray-300 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                data-testid="search-input"
                placeholder={t('content.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
            </div>
            <Tabs value={filterType} onValueChange={setFilterType} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-5 w-full md:w-auto bg-gray-100">
                <TabsTrigger value="all" data-testid="filter-all" className="font-bold">{t('content.allContent')}</TabsTrigger>
                <TabsTrigger value="research" data-testid="filter-research" className="font-bold">{t('features.marketResearch.title')}</TabsTrigger>
                <TabsTrigger value="survey" data-testid="filter-survey" className="font-bold">Survey</TabsTrigger>
                <TabsTrigger value="article" data-testid="filter-article" className="font-bold">Article</TabsTrigger>
                <TabsTrigger value="news" data-testid="filter-news" className="font-bold">News</TabsTrigger>
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
            <p className="text-gray-700 text-lg font-semibold">{t('content.noResults')}</p>
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
                {/* Show cover image, featured_image, or first image attachment */}
                {(() => {
                  // Check if there's a cover_image_id (selected from attachments)
                  if (content.cover_image_id && content.attachments) {
                    const coverImage = content.attachments.find(att => att.id === content.cover_image_id);
                    if (coverImage && coverImage.file_data) {
                      return (
                        <div className="mb-4 rounded-lg overflow-hidden">
                          <img
                            src={coverImage.file_data}
                            alt={content.title}
                            className="w-full h-48 object-cover"
                          />
                        </div>
                      );
                    }
                  }
                  
                  // Check if there's a featured_image (legacy support)
                  if (content.featured_image) {
                    return (
                      <div className="mb-4 rounded-lg overflow-hidden">
                        <img
                          src={content.featured_image}
                          alt={content.title}
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    );
                  }
                  
                  // Otherwise, check for first image attachment
                  const imageAttachments = content.attachments?.filter(
                    att => att.file_type && att.file_type.startsWith('image/')
                  ) || [];
                  
                  if (imageAttachments.length > 0 && imageAttachments[0].file_data) {
                    return (
                      <div className="mb-4 rounded-lg overflow-hidden">
                        <img
                          src={imageAttachments[0].file_data}
                          alt={content.title}
                          className="w-full h-48 object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    );
                  }
                  
                  return null;
                })()}
                
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
                  {content.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
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
                    <span>{content.views || 0} {t('stats.access')}</span>
                  </div>
                  {content.contributors && content.contributors.length > 0 && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4 text-[#00A9CE]" />
                      <span>{content.contributors.length}</span>
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