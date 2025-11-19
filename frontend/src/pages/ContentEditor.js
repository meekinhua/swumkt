import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Plus, X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const ContentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    content_type: 'article',
    category: '',
    tags: [],
    featured_image: '',
    status: 'draft',
    attachments: []
  });
  const [tagInput, setTagInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (id) {
      fetchContent();
    }
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      const content = response.data;
      
      if (content.created_by !== user.id && user.role !== 'admin') {
        toast.error('คุณไม่มีสิทธิ์แก้ไขเนื้อหานี้');
        navigate('/dashboard');
        return;
      }

      setFormData({
        title: content.title,
        content: content.content,
        content_type: content.content_type,
        category: content.category || '',
        tags: content.tags || [],
        featured_image: content.featured_image || '',
        status: content.status,
        attachments: content.attachments || []
      });
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error('ไม่สามารถโหลดเนื้อหาได้');
      navigate('/dashboard');
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = { ...formData };
      if (!submitData.category) delete submitData.category;
      if (!submitData.featured_image) delete submitData.featured_image;

      if (id) {
        await axios.put(`${API}/content/${id}`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('บันทึกเนื้อหาสำเร็จ');
      } else {
        const response = await axios.post(`${API}/content`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('สร้างเนื้อหาสำเร็จ');
        navigate(`/content/${response.data.id}`);
        return;
      }
      
      navigate(`/content/${id}`);
    } catch (error) {
      console.error('Error saving content:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถบันทึกเนื้อหาได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation showMarketResearchButton={true} showContentButton={true} showProfileButton={true} />

      {/* Editor */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn" className="mb-4 text-gray-800 hover:text-[#00A9CE]">
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับ Dashboard
        </Button>
        <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up">
          <h1 className="text-4xl font-black text-gray-900 mb-8" data-testid="editor-title">
            {id ? <span className="gradient-text">แก้ไขเนื้อหา</span> : <span className="gradient-text">สร้างเนื้อหาใหม่</span>}
          </h1>

          <form onSubmit={handleSubmit} data-testid="content-editor-form">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title" className="text-gray-800 font-bold mb-2">หัวข้อ *</Label>
                <Input
                  id="title"
                  data-testid="title-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="ใส่หัวข้อเนื้อหา..."
                  required
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Content Type */}
              <div>
                <Label htmlFor="content_type" className="text-gray-800 font-bold mb-2">ประเภทเนื้อหา *</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value) => setFormData({ ...formData, content_type: value })}
                >
                  <SelectTrigger className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium" data-testid="content-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="research" data-testid="type-research">ผลวิจัย</SelectItem>
                    <SelectItem value="survey" data-testid="type-survey">ผลสำรวจ</SelectItem>
                    <SelectItem value="article" data-testid="type-article">บทความ</SelectItem>
                    <SelectItem value="news" data-testid="type-news">ข่าวสาร</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="category" className="text-gray-800 font-bold mb-2">หมวดหมู่</Label>
                <Input
                  id="category"
                  data-testid="category-input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="เช่น การตลาดดิจิทัล, พฤติกรรมผู้บริโภค..."
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Content */}
              <div>
                <Label htmlFor="content" className="text-gray-800 font-bold mb-2">เนื้อหา *</Label>
                <Textarea
                  id="content"
                  data-testid="content-textarea"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="เขียนเนื้อหาของคุณที่นี่..."
                  required
                  rows={12}
                  className="mt-1 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Featured Image URL */}
              <div>
                <Label htmlFor="featured_image" className="text-gray-800 font-bold mb-2">ลิงก์รูปภาพ</Label>
                <Input
                  id="featured_image"
                  data-testid="featured-image-input"
                  value={formData.featured_image}
                  onChange={(e) => setFormData({ ...formData, featured_image: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
                {formData.featured_image && (
                  <div className="mt-2">
                    <img
                      src={formData.featured_image}
                      alt="Preview"
                      className="w-full max-h-64 object-cover rounded-lg border-2 border-gray-300"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="tags" className="text-gray-800 font-bold mb-2">แท็ก</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="tags"
                    data-testid="tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="เพิ่มแท็ก..."
                    className="h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                  />
                  <Button
                    type="button"
                    data-testid="add-tag-btn"
                    onClick={handleAddTag}
                    variant="outline"
                    className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        data-testid={`tag-${idx}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#00A9CE]/10 text-[#005A73] rounded-full text-sm font-bold border border-[#00A9CE]/20"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          data-testid={`remove-tag-${idx}`}
                          className="hover:text-[#E63946]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status" className="text-gray-800 font-bold mb-2">สถานะ *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium" data-testid="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft" data-testid="status-draft">แบบร่าง</SelectItem>
                    <SelectItem value="published" data-testid="status-published">เผยแพร่</SelectItem>
                    <SelectItem value="archived" data-testid="status-archived">เก็บถาวร</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-content-btn"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl h-12"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      กำลังบันทึก...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      {id ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างเนื้อหา'}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="cancel-btn"
                  onClick={() => navigate('/dashboard')}
                  disabled={loading}
                  className="border-2 border-gray-400 text-gray-700 hover:bg-gray-100 font-bold"
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ContentEditor;