import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye, Edit, Users, MessageCircle, Send, Languages } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import MermaidViewer from '@/components/MermaidViewer';

const ContentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [content, setContent] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [translatedContent, setTranslatedContent] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('');

  useEffect(() => {
    fetchContent();
    fetchComments();
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      setContent(response.data);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error('ไม่พบเนื้อหา');
      navigate('/content');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`${API}/comments/${id}`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น');
      return;
    }

    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await axios.post(
        `${API}/comments`,
        { content_id: id, comment_text: newComment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewComment('');
      fetchComments();
      toast.success('แสดงความคิดเห็นสำเร็จ');
    } catch (error) {
      console.error('Error submitting comment:', error);
      toast.error('ไม่สามารถแสดงความคิดเห็นได้');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleTranslate = async () => {
    if (!targetLanguage) {
      toast.error(t('common.error'));
      return;
    }

    setTranslating(true);
    try {
      const response = await axios.post(`${API}/translate`, {
        text: content.content,
        target_language: targetLanguage
      });
      setTranslatedContent(response.data.translated_text);
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Translation error:', error);
      toast.error(t('common.error'));
    } finally {
      setTranslating(false);
    }
  };

  const canEdit = user && content && (content.created_by === user.id || user.role === 'admin');

  const getTypeLabel = (type) => {
    const labels = {
      research: 'ผลวิจัย',
      survey: 'ผลสำรวจ',
      article: 'บทความ',
      news: 'ข่าวสาร'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  if (!content) return null;

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
              <Button variant="ghost" onClick={() => navigate('/content')} data-testid="back-to-browse-btn" className="text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('content.back')}
              </Button>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-8 mb-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up" data-testid="content-detail-card">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="badge-success text-sm px-3 py-1.5 rounded-full" data-testid="content-type-badge">
                  {getTypeLabel(content.content_type)}
                </span>
                {content.category && (
                  <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
                    {content.category}
                  </span>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/content/edit/${id}`)}
                  data-testid="edit-content-btn"
                  className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  แก้ไข
                </Button>
              )}
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" data-testid="content-title">
              {content.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-gray-700 font-semibold">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4 text-[#00A9CE]" />
                <span data-testid="content-views">{content.views || 0} ครั้งที่เข้าชม</span>
              </div>
              {content.contributors && content.contributors.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4 text-[#00A9CE]" />
                  <span>{content.contributors.length} ผู้มีส่วนร่วม</span>
                </div>
              )}
            </div>
          </div>

          {/* Featured Image */}
          {content.featured_image && (
            <div className="mb-6 rounded-lg overflow-hidden border-2 border-gray-200">
              <img
                src={content.featured_image}
                alt={content.title}
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Journey Map Viewer - Show if this is a journey map content */}
          {content.journey_map_metadata && content.journey_map_metadata.mermaid_code && (
            <MermaidViewer code={content.journey_map_metadata.mermaid_code} />
          )}

          {/* Content Body */}
          <div className="prose max-w-none mb-6" data-testid="content-body">
            <div className="flex items-center justify-between mb-4 p-4 bg-[#00A9CE]/5 rounded-lg border border-[#00A9CE]/20">
              <h3 className="text-lg font-black text-gray-900">{t('content.originalText')}</h3>
              <div className="flex items-center gap-3">
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger className="w-40 border-2 border-[#00A9CE]">
                    <SelectValue placeholder={t('content.translate')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="th">ไทย</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="my">မြန်မာ</SelectItem>
                    <SelectItem value="lo">ລາວ</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleTranslate}
                  disabled={!targetLanguage || translating}
                  className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold"
                >
                  {translating ? (
                    <>{t('content.translating')}</>
                  ) : (
                    <>
                      <Languages className="w-4 h-4 mr-2" />
                      {t('content.translate')}
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-lg font-medium">
              {content.content}
            </p>
          </div>

          {/* Translated Content */}
          {translatedContent && (
            <div className="prose max-w-none mb-6 p-6 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-lg border-2 border-[#00A9CE]/30">
              <h3 className="text-lg font-black text-[#005A73] mb-4">{t('content.translatedText')}</h3>
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                {translatedContent}
              </p>
            </div>
          )}

          {/* Tags */}
          {content.tags && content.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {content.tags.map((tag, idx) => (
                <span key={idx} className="text-sm px-3 py-1.5 bg-[#00A9CE]/10 text-[#005A73] rounded-full font-bold border border-[#00A9CE]/20">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Contributors */}
          {content.contributors && content.contributors.length > 0 && (
            <div className="border-t-2 border-gray-300 pt-6">
              <h3 className="text-lg font-black text-gray-900 mb-4">ผู้มีส่วนร่วม</h3>
              <div className="flex flex-wrap gap-4">
                {content.contributors.map((contributor, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 bg-[#00A9CE]/5 rounded-lg border border-[#00A9CE]/20">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold">
                      {contributor.user_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{contributor.user_name}</p>
                      <p className="text-xs text-gray-600 font-semibold">{contributor.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Comments Section */}
        <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
          <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-[#00A9CE]" />
            ความคิดเห็น ({comments.length})
          </h2>

          {/* Comment Form */}
          {user ? (
            <form onSubmit={handleCommentSubmit} className="mb-8" data-testid="comment-form">
              <Textarea
                data-testid="comment-input"
                placeholder="แสดงความคิดเห็นของคุณ..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                className="mb-2 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
              <Button
                type="submit"
                data-testid="submit-comment-btn"
                disabled={submittingComment || !newComment.trim()}
                className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl"
              >
                {submittingComment ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังส่ง...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    ส่งความคิดเห็น
                  </span>
                )}
              </Button>
            </form>
          ) : (
            <div className="mb-8 p-6 bg-[#00A9CE]/5 rounded-lg text-center border-2 border-[#00A9CE]/20">
              <p className="text-gray-700 mb-3 font-semibold">กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น</p>
              <Button onClick={() => navigate('/login')} className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold">
                เข้าสู่ระบบ
              </Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-center text-gray-600 py-8 font-semibold">ยังไม่มีความคิดเห็น</p>
            ) : (
              comments.map((comment, idx) => (
                <div key={comment.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200" data-testid={`comment-${idx}`}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold flex-shrink-0">
                    {comment.user_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">{comment.user_name}</span>
                      <span className="text-xs text-gray-600 font-semibold">
                        {new Date(comment.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <p className="text-gray-800 font-medium">{comment.comment_text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ContentDetail;