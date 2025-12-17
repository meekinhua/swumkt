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
import { ArrowLeft, Save, Plus, X, Upload, Trash2, Image as ImageIcon, Copy, AlertTriangle, Code } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import RichTextEditor from '@/components/RichTextEditor';

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
    cover_image_id: null,
    status: 'draft',
    attachments: [],
    course_id: '',
    group_members: []
  });
  const [tagInput, setTagInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberDetails, setMemberDetails] = useState([]);
  const [aiRearranging, setAiRearranging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  // New states for AI Rearrange fallback
  const [showRearrangePrompt, setShowRearrangePrompt] = useState(false);
  const [rearrangePrompt, setRearrangePrompt] = useState('');
  const [manualHtmlInput, setManualHtmlInput] = useState('');
  const editorRef = React.useRef(null);

  useEffect(() => {
    fetchCourses();
    if (id) {
      fetchContent();
    }
  }, [id]);

  const fetchCourses = async () => {
    try {
      setLoadingCourses(true);
      const response = await axios.get(`${API}/courses`);
      setCourses(response.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoadingCourses(false);
    }
  };

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
        cover_image_id: content.cover_image_id || null,
        status: content.status,
        attachments: content.attachments || [],
        course_id: content.course_id || '',
        group_members: content.group_members || []
      });

      // Fetch member details for existing group members
      if (content.group_members && content.group_members.length > 0) {
        const memberPromises = content.group_members.map(async (memberId) => {
          try {
            const memberResponse = await axios.get(`${API}/users/${memberId}`);
            return memberResponse.data;
          } catch (err) {
            console.error(`Error fetching member ${memberId}:`, err);
            return null;
          }
        });
        const members = await Promise.all(memberPromises);
        setMemberDetails(members.filter(m => m !== null));
      }
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

  const handleAddMember = async () => {
    if (!memberEmail.trim()) {
      toast.error('กรุณากรอกอีเมลสมาชิก');
      return;
    }

    setAddingMember(true);
    try {
      // Search for user by email
      const response = await axios.get(`${API}/users/search?email=${encodeURIComponent(memberEmail)}`);
      
      if (response.data && response.data.id) {
        // Check if already added
        if (formData.group_members.includes(response.data.id)) {
          toast.error('สมาชิกคนนี้ถูกเพิ่มแล้ว');
          setAddingMember(false);
          return;
        }
        
        // Add to group_members and memberDetails
        setFormData({
          ...formData,
          group_members: [...formData.group_members, response.data.id]
        });
        setMemberDetails([...memberDetails, response.data]);
        setMemberEmail('');
        toast.success(`เพิ่ม ${response.data.full_name} แล้ว`);
      }
    } catch (error) {
      console.error('Search user error:', error);
      toast.error('ไม่พบผู้ใช้ที่มีอีเมลนี้');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = (memberId) => {
    setFormData({
      ...formData,
      group_members: formData.group_members.filter(id => id !== memberId)
    });
    setMemberDetails(memberDetails.filter(member => member.id !== memberId));
    toast.success('ลบสมาชิกแล้ว');
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate total files
    if (formData.attachments.length + files.length > 10) {
      toast.error('สามารถแนบได้สูงสุด 10 ไฟล์');
      return;
    }

    try {
      setUploadingFile(true);
      const newAttachments = [];

      for (const file of files) {
        // Validate file size (max 5MB before compression)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`ไฟล์ ${file.name} ใหญ่เกินไป (สูงสุด 5MB)`);
          continue;
        }

        // Read file as base64
        const base64String = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let finalFileData = base64String;
        let finalFileSize = file.size;

        // If it's an image, compress it on backend
        if (file.type.startsWith('image/')) {
          try {
            const response = await axios.post(
              `${API}/api/compress-image`,
              { image_base64: base64String },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            finalFileData = response.data.compressed_image;
            // Calculate compressed size
            const base64Length = finalFileData.split(',')[1].length;
            finalFileSize = (base64Length * 0.75); // Approximate size from base64
          } catch (compressionError) {
            console.warn('Image compression failed, using original:', compressionError);
            // Use original if compression fails
          }
        }

        // Create attachment object
        const attachment = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          filename: file.name,
          file_type: file.type,
          file_size_kb: Math.round((finalFileSize / 1024) * 100) / 100,
          file_data: finalFileData,
          uploaded_at: new Date().toISOString()
        };

        newAttachments.push(attachment);
      }

      if (newAttachments.length > 0) {
        setFormData({
          ...formData,
          attachments: [...formData.attachments, ...newAttachments]
        });
        toast.success(`อัปโหลด ${newAttachments.length} ไฟล์สำเร็จ`);
      }
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
    } finally {
      setUploadingFile(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (attachmentId) => {
    // If removing the cover image, clear cover_image_id
    if (formData.cover_image_id === attachmentId) {
      setFormData({
        ...formData,
        cover_image_id: null,
        attachments: formData.attachments.filter(att => att.id !== attachmentId)
      });
      toast.success('ลบไฟล์แนบและภาพปกสำเร็จ');
    } else {
      setFormData({
        ...formData,
        attachments: formData.attachments.filter(att => att.id !== attachmentId)
      });
      toast.success('ลบไฟล์แนบสำเร็จ');
    }
  };

  const handleSetCoverImage = (attachmentId) => {
    setFormData({
      ...formData,
      cover_image_id: attachmentId
    });
    toast.success('ตั้งเป็นภาพปกสำเร็จ!');
  };

  const handleRemoveCoverImage = () => {
    setFormData({
      ...formData,
      cover_image_id: null
    });
    toast.success('ยกเลิกภาพปกแล้ว');
  };

  const handleInsertImage = (attachment) => {
    if (editorRef.current && attachment.file_data) {
      editorRef.current.insertImage(
        attachment.file_data,
        attachment.filename || attachment.title || 'Image'
      );
      toast.success(`แทรกรูป "${attachment.filename || 'รูปภาพ'}" เข้าบทความแล้ว`);
    } else {
      toast.error('ไม่สามารถแทรกรูปภาพได้');
    }
  };

  // Function to build AI Rearrange prompt (matches backend)
  const buildRearrangePrompt = () => {
    const imageContext = formData.attachments
      .filter(att => att.file_type?.startsWith('image/'))
      .map((att, idx) => `${idx + 1}. ${att.filename}`)
      .join('\n');

    const prompt = `คุณเป็นนักเขียนมืออาชีพและนักออกแบบเนื้อหา กรุณาจัดเรียงและปรับปรุงบทความต่อไปนี้ให้สวยงาม เป็นระเบียบ และอ่านง่ายขึ้น

**หัวข้อบทความ:** ${formData.title || 'ไม่มีหัวข้อ'}

**เนื้อหาเดิม:**
${formData.content}
${imageContext ? `\n\n**รูปภาพที่มี:**\n${imageContext}` : ''}

**คำแนะนำสำคัญ:**
1. จัดโครงสร้างเนื้อหาใหม่ให้เป็นหมวดหมู่ชัดเจน
2. เพิ่ม headings (h2, h3) ให้เหมาะสม
3. แบ่ง paragraphs ให้อ่านง่าย
4. เน้นจุดสำคัญด้วย bold/italic (ใช้ <strong> และ <em> tags)
5. เพิ่ม bullet points หรือ numbered lists ถ้าเหมาะสม (ใช้ <ul>, <ol>, <li>)
6. **สำคัญมาก:** ใช้ placeholder [รูปภาพที่ X] (X = หมายเลขรูป) ในตำแหน่งที่เหมาะสม
7. เพิ่ม introduction และ conclusion ถ้าจำเป็น

**ข้อกำหนด:**
- ใช้ HTML tags: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>
- ห้ามใช้ markdown (\`\`\`, ##, **)
- คงเนื้อหาหลักและข้อมูลสำคัญไว้ทั้งหมด
- ให้ output เป็น HTML โดยตรง ไม่ต้องมี <html>, <body> tags

**กรุณาเริ่มจัดเรียงเนื้อหาเลย (output HTML โดยตรง):**`;

    return prompt;
  };

  // Copy prompt to clipboard
  const handleCopyRearrangePrompt = async () => {
    try {
      await navigator.clipboard.writeText(rearrangePrompt);
      toast.success('คัดลอก Prompt แล้ว!');
    } catch (error) {
      toast.error('ไม่สามารถคัดลอกได้');
    }
  };

  // Apply manual HTML input
  const handleApplyManualHtml = () => {
    if (!manualHtmlInput.trim()) {
      toast.error('กรุณาใส่ HTML ที่ได้จาก AI');
      return;
    }
    
    setFormData({
      ...formData,
      content: manualHtmlInput
    });
    setShowRearrangePrompt(false);
    setManualHtmlInput('');
    toast.success('✨ ใส่เนื้อหาที่จัดเรียงแล้วสำเร็จ!');
  };

  const handleAiRearrange = async () => {
    if (!id) {
      toast.error('กรุณาบันทึกเนื้อหาก่อนใช้ AI Rearrange');
      return;
    }

    if (!formData.content || formData.content.trim().length < 50) {
      toast.error('เนื้อหาสั้นเกินไป กรุณาเพิ่มเนื้อหาอย่างน้อย 50 ตัวอักษร');
      return;
    }

    setAiRearranging(true);
    try {
      toast.info('🤖 กำลังใช้ AI วิเคราะห์และจัดเรียงเนื้อหา รวมถึงตีความรูปภาพและจัดวางตำแหน่ง กรุณารอสักครู่...');
      
      const response = await axios.post(
        `${API}/content/${id}/ai-rearrange`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setFormData({
          ...formData,
          content: response.data.rearranged_content
        });
        
        toast.success(
          `✨ จัดเรียงเนื้อหาสำเร็จ! รวมรูปภาพ ${response.data.images_included} รูป`,
          { duration: 5000 }
        );
      }
    } catch (error) {
      console.error('AI Rearrange error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถจัดเรียงเนื้อหาได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setAiRearranging(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = { ...formData };
      if (!submitData.category) delete submitData.category;
      if (!submitData.featured_image) delete submitData.featured_image;

      console.log('[ContentEditor] Submitting data:', submitData);

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

  const handleDeleteContent = async () => {
    if (!id) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('ลบเนื้อหาสำเร็จ');
      navigate('/content');
    } catch (error) {
      console.error('Error deleting content:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบเนื้อหาได้');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const canDelete = id && user && (formData.created_by === user.id || user.role === 'admin');

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation />

      {/* Editor */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn" className="mb-3 sm:mb-4 text-gray-800 hover:text-[#00A9CE] text-sm sm:text-base">
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับ Dashboard
        </Button>
        <Card className="p-4 sm:p-6 md:p-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 mb-6 sm:mb-8" data-testid="editor-title">
            {id ? <span className="gradient-text">แก้ไขเนื้อหา</span> : <span className="gradient-text">สร้างเนื้อหาใหม่</span>}
          </h1>

          <form onSubmit={handleSubmit} data-testid="content-editor-form">
            <div className="space-y-4 sm:space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title" className="text-gray-800 font-bold mb-2 text-sm sm:text-base">หัวข้อ *</Label>
                <Input
                  id="title"
                  data-testid="title-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="ใส่หัวข้อเนื้อหา..."
                  required
                  className="mt-1 h-10 sm:h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium text-sm sm:text-base"
                />
              </div>

              {/* Content Type */}
              <div>
                <Label htmlFor="content_type" className="text-gray-800 font-bold mb-2 text-sm sm:text-base">ประเภทเนื้อหา *</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value) => setFormData({ ...formData, content_type: value })}
                >
                  <SelectTrigger className="mt-1 h-10 sm:h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium text-sm sm:text-base" data-testid="content-type-select">
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
                <Label htmlFor="category" className="text-gray-800 font-bold mb-2 text-sm sm:text-base">หมวดหมู่</Label>
                <Input
                  id="category"
                  data-testid="category-input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="เช่น การตลาดดิจิทัล, พฤติกรรมผู้บริโภค..."
                  className="mt-1 h-10 sm:h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium text-sm sm:text-base"
                />
              </div>

              {/* Content */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <Label htmlFor="content" className="text-gray-800 font-bold text-sm sm:text-base">เนื้อหา *</Label>
                  {id && (
                    <Button
                      type="button"
                      onClick={handleAiRearrange}
                      disabled={aiRearranging || !formData.content}
                      className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-xs sm:text-sm px-3 sm:px-4 py-2"
                    >
                      {aiRearranging ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          กำลังจัดเรียง...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          ✨ AI Rearrange
                        </span>
                      )}
                    </Button>
                  )}
                </div>
                <div className="mt-1 relative">
                  <RichTextEditor
                    ref={editorRef}
                    content={formData.content}
                    onChange={(html) => setFormData({ ...formData, content: html })}
                    placeholder="เขียนเนื้อหาของคุณที่นี่..."
                    className="bg-white"
                  />
                </div>
                {id && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 เคล็ดลับ: ปุ่ม &quot;AI Rearrange&quot; จะช่วยจัดเรียงเนื้อหาและรูปภาพให้สวยงามอัตโนมัติ
                  </p>
                )}
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
                <Label htmlFor="tags" className="text-gray-800 font-bold mb-2 text-sm sm:text-base">แท็ก</Label>
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
                    className="h-10 sm:h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium text-sm sm:text-base"
                  />
                  <Button
                    type="button"
                    data-testid="add-tag-btn"
                    onClick={handleAddTag}
                    variant="outline"
                    className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold h-10 sm:h-12 px-3 sm:px-4"
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

              {/* File Attachments */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">ไฟล์แนบ</Label>
                <div className="mt-2">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#00A9CE] hover:bg-[#00A9CE]/5 transition-colors">
                      {uploadingFile ? (
                        <>
                          <div className="w-5 h-5 border-2 border-[#00A9CE] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-gray-600 font-medium">กำลังอัปโหลด...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-gray-500" />
                          <span className="text-gray-600 font-medium">คลิกเพื่ออัปโหลดไฟล์ (หลายไฟล์)</span>
                          <span className="text-gray-400 text-sm">(สูงสุด 10 ไฟล์, ไฟล์ละ 5MB)</span>
                        </>
                      )}
                    </div>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    />
                  </label>

                  {formData.attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-gray-600 font-medium">
                        ไฟล์ที่แนบ: 
                        <span className="ml-2 text-xs text-blue-600">💡 คลิกที่รูปภาพเพื่อแทรกเข้าบทความ</span>
                      </p>
                      {formData.attachments.map((attachment) => {
                        const isImage = attachment.file_type && attachment.file_type.startsWith('image/');
                        const isCoverImage = formData.cover_image_id === attachment.id;
                        return (
                          <div
                            key={attachment.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              isCoverImage
                                ? 'bg-green-50 border-green-400 border-2'
                                : isImage 
                                  ? 'bg-blue-50 border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors' 
                                  : 'bg-gray-50 border-gray-200'
                            }`}
                            onClick={() => isImage && !isCoverImage && handleInsertImage(attachment)}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              {isImage ? (
                                <div className="flex items-center gap-2">
                                  <ImageIcon className={`w-5 h-5 ${isCoverImage ? 'text-green-600' : 'text-blue-500'}`} />
                                  {attachment.file_data && (
                                    <img 
                                      src={attachment.file_data} 
                                      alt={attachment.filename} 
                                      className={`w-12 h-12 object-cover rounded border ${
                                        isCoverImage ? 'border-green-500 border-2' : 'border-blue-300'
                                      }`}
                                    />
                                  )}
                                </div>
                              ) : (
                                <Upload className="w-5 h-5 text-gray-500" />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900">
                                    {attachment.filename || attachment.title || 'Unknown'}
                                  </p>
                                  {isCoverImage && (
                                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded">
                                      📌 ภาพปก
                                    </span>
                                  )}
                                  {isImage && !isCoverImage && (
                                    <span className="text-xs text-blue-600">← คลิกเพื่อแทรก</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{attachment.file_size_kb || 'N/A'} KB</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isImage && (
                                <>
                                  {isCoverImage ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveCoverImage();
                                      }}
                                      className="text-orange-600 hover:text-orange-700 border-orange-300 hover:bg-orange-50"
                                    >
                                      <X className="w-4 h-4 mr-1" />
                                      ยกเลิกภาพปก
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetCoverImage(attachment.id);
                                      }}
                                      className="text-green-600 hover:text-green-700 border-green-300 hover:bg-green-50"
                                    >
                                      <ImageIcon className="w-4 h-4 mr-1" />
                                      ตั้งเป็นภาพปก
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveAttachment(attachment.id);
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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

              {/* Course Selection - New Universal System */}
              <Card className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  ส่งงานในวิชา (ถ้ามี)
                </h3>
                
                <div>
                  <Label className="text-gray-800 font-bold mb-2">เลือกวิชา</Label>
                  <select
                    value={formData.course_id}
                    onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 font-medium"
                    disabled={loadingCourses}
                  >
                    <option value="">-- ไม่ได้ส่งเป็นงานในวิชา --</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.course_code} - {course.course_name}
                        {course.semester && ` (${course.semester})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 เลือกวิชาหากเนื้อหานี้เป็นงานที่ส่งในวิชา ครูอาจารย์จะสามารถดูงานของคุณได้
                  </p>
                </div>
              </Card>

              {/* Group Members Management - for assignments */}
              {formData.course_id && (
                <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    สมาชิกกลุ่ม (ถ้ามี)
                  </h3>

                  {/* Show Creator First */}
                  <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{user.full_name}</span>
                      <span className="text-xs text-gray-500">({user.email})</span>
                      <span className="ml-auto text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-bold">
                        ผู้สร้าง
                      </span>
                    </div>
                  </div>

                  {/* Member List */}
                  {memberDetails.filter(m => m.id !== user.id).length > 0 && (
                    <div className="mb-4 space-y-2">
                      {memberDetails
                        .filter(m => m.id !== user.id)
                        .map((member) => (
                          <div key={member.id} className="flex items-center justify-between p-3 bg-white rounded-lg border-2 border-blue-200">
                            <div className="flex items-center gap-2">
                              {member.google_picture || member.avatar_url ? (
                                <img
                                  src={member.google_picture || member.avatar_url}
                                  alt={member.full_name}
                                  className="w-8 h-8 rounded-full object-cover border-2 border-blue-400"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                  {member.full_name.charAt(0)}
                                </div>
                              )}
                              <div>
                                <span className="text-sm font-bold text-gray-900">{member.full_name}</span>
                                <span className="text-xs text-gray-500 ml-2">({member.email})</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.id)}
                              className="text-red-600 hover:text-red-800 p-2"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Add Member Input */}
                  <div>
                    <Label className="text-gray-800 font-bold mb-2">เพิ่มสมาชิกกลุ่ม</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="อีเมลสมาชิกกลุ่ม"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMember())}
                        className="flex-1 border-2 border-gray-300 focus:border-blue-500"
                      />
                      <Button
                        type="button"
                        onClick={handleAddMember}
                        disabled={addingMember || !memberEmail}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold"
                      >
                        {addingMember ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-1" />
                            เพิ่ม
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 เพิ่มสมาชิกกลุ่มโดยใส่อีเมล (สำหรับงานกลุ่ม)
                    </p>
                  </div>
                </Card>
              )}

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-content-btn"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl h-10 sm:h-12 text-sm sm:text-base"
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
                
                <div className="flex gap-3 sm:gap-4">
                  {canDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={loading || deleting}
                      className="flex-1 sm:flex-initial border-2 border-red-500 text-red-600 hover:bg-red-50 hover:border-red-600 font-bold h-10 sm:h-12 text-sm sm:text-base"
                    >
                      <Trash2 className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">ลบเนื้อหา</span>
                    </Button>
                  )}
                  
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="cancel-btn"
                    onClick={() => navigate('/dashboard')}
                    disabled={loading}
                    className="flex-1 sm:flex-initial border-2 border-gray-400 text-gray-700 hover:bg-gray-100 font-bold h-10 sm:h-12 text-sm sm:text-base"
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Card>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 bg-white">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              ⚠️ ยืนยันการลบเนื้อหา
            </h3>
            <p className="text-gray-700 mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการลบเนื้อหา <strong>&quot;{formData.title}&quot;</strong>?
              <br />
              <span className="text-red-600 font-semibold">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="flex gap-4">
              <Button
                onClick={handleDeleteContent}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังลบ...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบ
                  </span>
                )}
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                variant="outline"
                className="flex-1 border-2 border-gray-400 hover:bg-gray-100 font-bold"
              >
                ยกเลิก
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ContentEditor;