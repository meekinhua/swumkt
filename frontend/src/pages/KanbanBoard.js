import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, Plus, Trash2, Edit, Users, Calendar,
  CheckSquare, MessageSquare, Paperclip, Clock, Loader2,
  Share2, X, Check, Save, Upload, LayoutGrid, GripVertical,
  Image, UserCircle
} from 'lucide-react';
import { toast } from 'sonner';

const KanbanBoard = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  const [project, setProject] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCardModal, setShowCardModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [draggedCard, setDraggedCard] = useState(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  
  // Edit states
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [editCardForm, setEditCardForm] = useState({});
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  
  // Sub-Kanban states
  const [draggedSubtask, setDraggedSubtask] = useState(null);
  const [showSubKanban, setShowSubKanban] = useState(true);
  const [initializingSubKanban, setInitializingSubKanban] = useState(false);
  
  // Cover Image states
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverImageInputRef = useRef(null);
  
  // Member Management states
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [members, setMembers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  
  // Edit Project states
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState({});

  const fetchProject = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data.project);
      setCards(response.data.cards || []);
    } catch (error) {
      console.error('Fetch project error:', error);
      toast.error('ไม่สามารถโหลด Project ได้');
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  }, [projectId, token, navigate]);

  useEffect(() => {
    if (token && projectId) {
      fetchProject();
    }
  }, [token, projectId, fetchProject]);

  // Get cards for a specific column
  const getColumnCards = (columnId) => {
    return cards
      .filter(card => card.column_id === columnId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Handle card creation
  const handleCreateCard = async (columnId) => {
    const title = prompt('ชื่อ Card:');
    if (!title?.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards`,
        { title, column_id: columnId, priority: 'medium' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCards([...cards, response.data]);
      toast.success('สร้าง Card สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถสร้าง Card ได้');
    }
  };

  // Drag & Drop
  const handleDragStart = (e, card) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetColumnId) => {
    e.preventDefault();
    if (!draggedCard || draggedCard.column_id === targetColumnId) {
      setDraggedCard(null);
      return;
    }

    try {
      await axios.put(
        `${API}/projects/${projectId}/cards/${draggedCard.id}/move`,
        null,
        { 
          headers: { Authorization: `Bearer ${token}` },
          params: { column_id: targetColumnId, order: 0 }
        }
      );
      
      setCards(cards.map(card => 
        card.id === draggedCard.id 
          ? { ...card, column_id: targetColumnId }
          : card
      ));
      toast.success('ย้าย Card สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถย้าย Card ได้');
    }
    setDraggedCard(null);
  };

  // Delete card
  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('ต้องการลบ Card นี้หรือไม่?')) return;

    try {
      await axios.delete(`${API}/projects/${projectId}/cards/${cardId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCards(cards.filter(c => c.id !== cardId));
      setShowCardModal(false);
      setSelectedCard(null);
      toast.success('ลบ Card สำเร็จ');
    } catch (error) {
      toast.error('ไม่สามารถลบ Card ได้');
    }
  };

  // Add column
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/columns`,
        { name: newColumnName, color: '#6B7280' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setProject({
        ...project,
        columns: [...project.columns, response.data]
      });
      setNewColumnName('');
      setShowAddColumn(false);
      toast.success('เพิ่ม Column สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Column ได้');
    }
  };

  // Delete column
  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm('ต้องการลบ Column นี้หรือไม่?')) return;

    try {
      await axios.delete(`${API}/projects/${projectId}/columns/${columnId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProject();
      toast.success('ลบ Column สำเร็จ');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบ Column ได้');
    }
  };

  // Open card detail
  const openCardDetail = (card) => {
    setSelectedCard(card);
    setEditCardForm({
      title: card.title || '',
      description: card.description || '',
      priority: card.priority || 'medium',
      due_date: card.due_date || ''
    });
    setIsEditingCard(false);
    setShowCardModal(true);
  };

  // Save card edits
  const handleSaveCard = async () => {
    if (!editCardForm.title?.trim()) {
      toast.error('กรุณาใส่ชื่อ Card');
      return;
    }

    try {
      setSavingCard(true);
      const response = await axios.put(
        `${API}/projects/${projectId}/cards/${selectedCard.id}`,
        editCardForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      const updatedCard = { ...selectedCard, ...editCardForm };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      setIsEditingCard(false);
      toast.success('บันทึกสำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถบันทึกได้');
    } finally {
      setSavingCard(false);
    }
  };

  // ============ SUBTASKS ============
  
  // Add subtask
  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks`,
        { title: newSubtaskTitle, status: 'pending' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = [...(selectedCard.subtasks || []), response.data];
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      setNewSubtaskTitle('');
      toast.success('เพิ่ม Subtask สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Subtask ได้');
    }
  };

  // Toggle subtask status
  const handleToggleSubtask = async (subtaskId, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    const subtask = selectedCard.subtasks.find(s => s.id === subtaskId);
    
    try {
      await axios.put(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks/${subtaskId}`,
        { title: subtask?.title || '', status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = selectedCard.subtasks.map(st =>
        st.id === subtaskId ? { ...st, status: newStatus } : st
      );
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
    } catch (error) {
      toast.error('ไม่สามารถอัพเดท Subtask ได้');
    }
  };

  // Start editing subtask
  const startEditSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditSubtaskTitle(subtask.title);
  };

  // Save subtask edit
  const handleSaveSubtask = async (subtaskId) => {
    if (!editSubtaskTitle.trim()) {
      toast.error('กรุณาใส่ชื่อ Subtask');
      return;
    }

    const subtask = selectedCard.subtasks.find(s => s.id === subtaskId);
    
    try {
      await axios.put(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks/${subtaskId}`,
        { title: editSubtaskTitle, status: subtask?.status || 'pending' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = selectedCard.subtasks.map(st =>
        st.id === subtaskId ? { ...st, title: editSubtaskTitle } : st
      );
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      setEditingSubtaskId(null);
      toast.success('บันทึก Subtask สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถบันทึก Subtask ได้');
    }
  };

  // Delete subtask
  const handleDeleteSubtask = async (subtaskId) => {
    try {
      await axios.delete(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks/${subtaskId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = selectedCard.subtasks.filter(st => st.id !== subtaskId);
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      toast.success('ลบ Subtask สำเร็จ');
    } catch (error) {
      toast.error('ไม่สามารถลบ Subtask ได้');
    }
  };

  // ============ SUB-KANBAN (MINI KANBAN) ============
  
  // Initialize sub-columns for card
  const initializeSubKanban = async () => {
    if (!selectedCard || (selectedCard.sub_columns && selectedCard.sub_columns.length > 0)) return;
    
    try {
      setInitializingSubKanban(true);
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/init-sub-columns`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedCard = response.data;
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      toast.success('เปิดใช้งาน Sub-Kanban สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเปิดใช้งาน Sub-Kanban ได้');
    } finally {
      setInitializingSubKanban(false);
    }
  };

  // Get subtasks for a sub-column
  const getSubColumnSubtasks = (subColumnId) => {
    if (!selectedCard?.subtasks) return [];
    return selectedCard.subtasks
      .filter(st => st.sub_column_id === subColumnId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Handle subtask drag start
  const handleSubtaskDragStart = (e, subtask) => {
    setDraggedSubtask(subtask);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle subtask drag over
  const handleSubtaskDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle subtask drop to new sub-column
  const handleSubtaskDrop = async (e, targetSubColumnId) => {
    e.preventDefault();
    if (!draggedSubtask || draggedSubtask.sub_column_id === targetSubColumnId) {
      setDraggedSubtask(null);
      return;
    }

    try {
      await axios.put(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks/${draggedSubtask.id}/move`,
        null,
        { 
          headers: { Authorization: `Bearer ${token}` },
          params: { sub_column_id: targetSubColumnId, order: 0 }
        }
      );
      
      // Update local state
      const updatedSubtasks = selectedCard.subtasks.map(st => 
        st.id === draggedSubtask.id 
          ? { ...st, sub_column_id: targetSubColumnId }
          : st
      );
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      toast.success('ย้าย Subtask สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถย้าย Subtask ได้');
    }
    setDraggedSubtask(null);
  };

  // Add subtask to specific sub-column
  const handleAddSubtaskToColumn = async (subColumnId) => {
    const title = prompt('ชื่อ Subtask:');
    if (!title?.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks`,
        { title, status: 'pending', sub_column_id: subColumnId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = [...(selectedCard.subtasks || []), response.data];
      const updatedCard = { ...selectedCard, subtasks: updatedSubtasks };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      toast.success('เพิ่ม Subtask สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Subtask ได้');
    }
  };

  // ============ COMMENTS ============
  
  const handleAddComment = async () => {
    if (!newCommentText.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/comments`,
        { content: newCommentText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedComments = [...(selectedCard.comments || []), response.data];
      const updatedCard = { ...selectedCard, comments: updatedComments };
      setSelectedCard(updatedCard);
      setNewCommentText('');
      toast.success('เพิ่ม Comment สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Comment ได้');
    }
  };

  // ============ COVER IMAGE ============
  
  const handleCoverImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ');
      return;
    }

    // Max size 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    try {
      setUploadingCover(true);
      
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Image = event.target.result;
        
        try {
          const response = await axios.post(
            `${API}/projects/${projectId}/cards/${selectedCard.id}/cover-image`,
            { cover_image: base64Image },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          const updatedCard = response.data;
          setSelectedCard(updatedCard);
          setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
          toast.success('อัพโหลดรูปภาพสำเร็จ!');
        } catch (error) {
          toast.error('ไม่สามารถอัพโหลดรูปภาพได้');
        } finally {
          setUploadingCover(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploadingCover(false);
      toast.error('เกิดข้อผิดพลาดในการอ่านไฟล์');
    }
  };

  const handleRemoveCoverImage = async () => {
    if (!selectedCard?.cover_image) return;
    
    if (!window.confirm('ต้องการลบรูปภาพหน้าปกนี้หรือไม่?')) return;

    try {
      await axios.delete(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/cover-image`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedCard = { ...selectedCard, cover_image: null };
      setSelectedCard(updatedCard);
      setCards(cards.map(c => c.id === selectedCard.id ? updatedCard : c));
      toast.success('ลบรูปภาพสำเร็จ');
    } catch (error) {
      toast.error('ไม่สามารถลบรูปภาพได้');
    }
  };

  // ============ MEMBER MANAGEMENT ============
  
  const roleLabels = {
    owner: 'เจ้าของ',
    manager: 'ผู้จัดการ/อาจารย์',
    editor: 'แก้ไขทั้งหมด',
    card_owner: 'จัดการ Card ตัวเอง',
    viewer: 'ดูเท่านั้น'
  };
  
  const roleColors = {
    owner: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    editor: 'bg-green-100 text-green-800',
    card_owner: 'bg-yellow-100 text-yellow-800',
    viewer: 'bg-gray-100 text-gray-600'
  };

  const fetchMembers = async () => {
    try {
      setLoadingMembers(true);
      const response = await axios.get(
        `${API}/projects/${projectId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMembers(response.data.members || []);
    } catch (error) {
      toast.error('ไม่สามารถโหลดรายชื่อสมาชิกได้');
    } finally {
      setLoadingMembers(false);
    }
  };

  const searchAvailableUsers = async (search) => {
    try {
      const response = await axios.get(
        `${API}/projects/${projectId}/available-users`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          params: { search }
        }
      );
      setAvailableUsers(response.data.users || []);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const handleAddMember = async (userId, role = 'card_owner') => {
    try {
      await axios.post(
        `${API}/projects/${projectId}/members`,
        { user_id: userId, role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('เพิ่มสมาชิกสำเร็จ!');
      fetchMembers();
      setMemberSearch('');
      setAvailableUsers([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถเพิ่มสมาชิกได้');
    }
  };

  const handleUpdateMemberRole = async (userId, newRole) => {
    try {
      await axios.put(
        `${API}/projects/${projectId}/members/${userId}`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('อัพเดท Role สำเร็จ!');
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถอัพเดท Role ได้');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('ต้องการลบสมาชิกนี้ออกจาก Project หรือไม่?')) return;
    
    try {
      await axios.delete(
        `${API}/projects/${projectId}/members/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('ลบสมาชิกสำเร็จ');
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบสมาชิกได้');
    }
  };

  const openMemberModal = () => {
    setShowMemberModal(true);
    fetchMembers();
  };

  // ============ EDIT PROJECT ============
  
  const handleEditProject = async () => {
    try {
      await axios.put(
        `${API}/projects/${projectId}`,
        editProjectForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('อัพเดท Project สำเร็จ!');
      setShowEditProject(false);
      fetchProject();
    } catch (error) {
      toast.error('ไม่สามารถอัพเดท Project ได้');
    }
  };

  const openEditProject = () => {
    setEditProjectForm({
      name: project.name,
      description: project.description || '',
      visibility: project.visibility
    });
    setShowEditProject(true);
  };

  // ============ FILE ATTACHMENTS ============
  
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TODO: Implement Google Drive upload
    toast.info('การอัพโหลดไฟล์ไปยัง Google Drive ยังไม่พร้อมใช้งาน - กรุณาตั้งค่า API credentials');
    
    // Placeholder for future implementation
    /*
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('card_id', selectedCard.id);
      
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/attachments`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      const updatedAttachments = [...(selectedCard.attachments || []), response.data];
      setSelectedCard({ ...selectedCard, attachments: updatedAttachments });
      toast.success('อัพโหลดไฟล์สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถอัพโหลดไฟล์ได้');
    }
    */
  };

  const priorityColors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600'
  };

  const priorityLabels = {
    low: 'ต่ำ',
    medium: 'ปานกลาง',
    high: 'สูง',
    urgent: 'ด่วน'
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#00A9CE]" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Project ไม่พบ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-full mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                กลับ
              </Button>
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                  {project.description && (
                    <p className="text-sm text-gray-500">{project.description}</p>
                  )}
                </div>
                {project.can_manage && (
                  <button
                    onClick={openEditProject}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                    title="แก้ไข Project"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* User role badge */}
              {project.user_role && (
                <span className={`text-xs px-2 py-1 rounded-full ${roleColors[project.user_role] || 'bg-gray-100'}`}>
                  {roleLabels[project.user_role] || project.user_role}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {project.share_token && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/projects/public/${project.share_token}`;
                    navigator.clipboard.writeText(url);
                    toast.success('คัดลอก Public Link แล้ว!');
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={openMemberModal}
              >
                <Users className="w-4 h-4 mr-2" />
                {project.members?.length || 1} สมาชิก
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto p-4">
        <div className="flex gap-4 min-w-max">
          {project.columns?.sort((a, b) => a.order - b.order).map((column) => (
            <div
              key={column.id}
              className="w-80 flex-shrink-0"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div 
                className="flex items-center justify-between p-3 rounded-t-lg text-white font-bold"
                style={{ backgroundColor: column.color }}
              >
                <div className="flex items-center gap-2">
                  <span>{column.name}</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                    {getColumnCards(column.id).length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {project?.can_create_cards && (
                    <button
                      onClick={() => handleCreateCard(column.id)}
                      className="p-1 hover:bg-white/20 rounded"
                      title="เพิ่ม Card"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                  {project?.can_manage && project.columns.length > 1 && (
                    <button
                      onClick={() => handleDeleteColumn(column.id)}
                      className="p-1 hover:bg-white/20 rounded"
                      title="ลบ Column"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Cards Container */}
              <div className="bg-gray-100 rounded-b-lg p-2 min-h-[200px] space-y-2">
                {getColumnCards(column.id).map((card) => (
                  <Card
                    key={card.id}
                    className={`bg-white cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${
                      draggedCard?.id === card.id ? 'opacity-50' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => openCardDetail(card)}
                  >
                    {/* Cover Image Preview */}
                    {card.cover_image && (
                      <div className="w-full h-24 bg-gray-100 overflow-hidden">
                        <img 
                          src={card.cover_image} 
                          alt={card.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    {/* Show Assignee profile image if no cover image */}
                    {!card.cover_image && card.assignee_details?.length > 0 && card.assignee_details[0]?.profile_image && (
                      <div className="w-full h-24 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden flex items-center justify-center">
                        <img 
                          src={card.assignee_details[0].profile_image} 
                          alt={card.assignee_details[0].full_name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                        />
                      </div>
                    )}
                    
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${priorityColors[card.priority]}`}>
                          {priorityLabels[card.priority]}
                        </span>
                        {card.due_date && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(card.due_date).toLocaleDateString('th-TH')}
                          </span>
                        )}
                      </div>
                      
                      <h4 className="font-medium text-gray-900 mb-2 line-clamp-2">{card.title}</h4>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {card.cover_image && (
                            <span className="flex items-center gap-1 text-[#00A9CE]">
                              <Image className="w-3 h-3" />
                            </span>
                          )}
                          {card.subtasks?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <CheckSquare className="w-3 h-3" />
                              {card.subtasks.filter(s => s.status === 'done').length}/{card.subtasks.length}
                            </span>
                          )}
                          {card.comments?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {card.comments.length}
                            </span>
                          )}
                          {card.attachments?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {card.attachments.length}
                            </span>
                          )}
                        </div>
                        
                        {/* Assignee avatars */}
                        {card.assignee_details?.length > 0 && (
                          <div className="flex -space-x-1">
                            {card.assignee_details.slice(0, 3).map((assignee, idx) => (
                              <div 
                                key={idx}
                                className="w-6 h-6 rounded-full bg-[#00A9CE] text-white text-xs flex items-center justify-center border border-white overflow-hidden"
                                title={assignee.full_name}
                              >
                                {assignee.profile_image ? (
                                  <img src={assignee.profile_image} alt={assignee.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  assignee.full_name?.charAt(0)?.toUpperCase() || '?'
                                )}
                              </div>
                            ))}
                            {card.assignee_details.length > 3 && (
                              <div className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center border border-white">
                                +{card.assignee_details.length - 3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                
                {/* Only show Add Card if user can edit */}
                {project?.can_edit_cards && (
                  <button
                    onClick={() => handleCreateCard(column.id)}
                    className="w-full p-2 text-gray-500 hover:bg-gray-200 rounded flex items-center justify-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม Card
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add Column - only if user can manage */}
          {project?.can_manage && (
            <div className="w-80 flex-shrink-0">
              {showAddColumn ? (
                <div className="bg-gray-100 rounded-lg p-3">
                  <Input
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="ชื่อ Column"
                    className="mb-2"
                    autoFocus
                    onKeyPress={(e) => e.key === 'Enter' && handleAddColumn()}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddColumn} className="bg-[#00A9CE]">
                      เพิ่ม
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddColumn(false)}>
                      ยกเลิก
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddColumn(true)}
                  className="w-full p-4 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center gap-2 text-gray-600"
                >
                  <Plus className="w-5 h-5" />
                  เพิ่ม Column
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card Detail Modal */}
      {showCardModal && selectedCard && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl bg-white my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-4 border-b">
              <div className="flex-1">
                {isEditingCard ? (
                  <Input
                    value={editCardForm.title}
                    onChange={(e) => setEditCardForm({...editCardForm, title: e.target.value})}
                    className="text-xl font-bold"
                    placeholder="ชื่อ Card"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-gray-900">{selectedCard.title}</h2>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  ใน {project.columns.find(c => c.id === selectedCard.column_id)?.name}
                </p>
                {/* Show permission badge */}
                {!selectedCard.can_edit && (
                  <p className="text-xs text-orange-500 mt-1">🔒 คุณสามารถดูได้เท่านั้น (ไม่มีสิทธิ์แก้ไข Card นี้)</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Only show Edit button if user can edit this card */}
                {selectedCard.can_edit && (
                  <>
                    {isEditingCard ? (
                      <>
                        <Button size="sm" onClick={handleSaveCard} disabled={savingCard} className="bg-green-500 hover:bg-green-600">
                          {savingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setIsEditingCard(false)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setIsEditingCard(true)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setShowCardModal(false); setSelectedCard(null); }}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Cover Image Section */}
            <div className="relative">
              {selectedCard.cover_image ? (
                <div className="relative group">
                  <img 
                    src={selectedCard.cover_image} 
                    alt={selectedCard.title}
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        ref={coverImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCoverImageUpload}
                      />
                      <Button size="sm" variant="secondary" asChild disabled={uploadingCover}>
                        <span>
                          {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Image className="w-4 h-4 mr-1" />}
                          เปลี่ยนรูป
                        </span>
                      </Button>
                    </label>
                    <Button size="sm" variant="destructive" onClick={handleRemoveCoverImage}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      ลบรูป
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-b">
                  <label className="cursor-pointer block">
                    <input
                      ref={coverImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverImageUpload}
                    />
                    <div className="flex items-center justify-center gap-2 py-3 text-gray-500 hover:text-[#00A9CE] hover:bg-gray-50 transition-colors">
                      {uploadingCover ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <UserCircle className="w-5 h-5" />
                          <span className="text-sm">เพิ่มรูปภาพหน้าปก (เช่น รูปนิสิต)</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>
            
            {/* Modal Content */}
            <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Description */}
              <div>
                <Label className="font-bold flex items-center gap-2 mb-2">
                  <Edit className="w-4 h-4" />
                  รายละเอียด
                </Label>
                {isEditingCard ? (
                  <Textarea
                    value={editCardForm.description}
                    onChange={(e) => setEditCardForm({...editCardForm, description: e.target.value})}
                    placeholder="รายละเอียด Card..."
                    rows={4}
                  />
                ) : (
                  <p className="text-gray-600 bg-gray-50 p-3 rounded min-h-[60px]">
                    {selectedCard.description || 'ไม่มีรายละเอียด (คลิก Edit เพื่อเพิ่ม)'}
                  </p>
                )}
              </div>
              
              {/* Priority & Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-bold mb-2 block">Priority</Label>
                  {isEditingCard ? (
                    <Select
                      value={editCardForm.priority}
                      onValueChange={(value) => setEditCardForm({...editCardForm, priority: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">ต่ำ</SelectItem>
                        <SelectItem value="medium">ปานกลาง</SelectItem>
                        <SelectItem value="high">สูง</SelectItem>
                        <SelectItem value="urgent">ด่วน</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`px-3 py-1 rounded ${priorityColors[selectedCard.priority]}`}>
                      {priorityLabels[selectedCard.priority]}
                    </span>
                  )}
                </div>
                <div>
                  <Label className="font-bold mb-2 block">Due Date</Label>
                  {isEditingCard ? (
                    <Input
                      type="date"
                      value={editCardForm.due_date}
                      onChange={(e) => setEditCardForm({...editCardForm, due_date: e.target.value})}
                    />
                  ) : (
                    <span className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {selectedCard.due_date 
                        ? new Date(selectedCard.due_date).toLocaleDateString('th-TH')
                        : 'ไม่ระบุ'}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Subtasks / Sub-Kanban */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-bold flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" />
                    Subtasks ({selectedCard.subtasks?.filter(s => s.status === 'done').length || 0}/{selectedCard.subtasks?.length || 0})
                  </Label>
                  <div className="flex items-center gap-2">
                    {/* Toggle between List and Kanban view */}
                    <Button
                      size="sm"
                      variant={showSubKanban ? "default" : "outline"}
                      onClick={() => setShowSubKanban(!showSubKanban)}
                      className={showSubKanban ? "bg-[#00A9CE] hover:bg-[#008FB5]" : ""}
                    >
                      <LayoutGrid className="w-3 h-3 mr-1" />
                      Kanban
                    </Button>
                    {/* Initialize Sub-Kanban if not present */}
                    {(!selectedCard.sub_columns || selectedCard.sub_columns.length === 0) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={initializeSubKanban}
                        disabled={initializingSubKanban}
                      >
                        {initializingSubKanban ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="w-3 h-3 mr-1" />
                        )}
                        เปิดใช้ Sub-Board
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sub-Kanban View (Mini Kanban Board) */}
                {showSubKanban && selectedCard.sub_columns && selectedCard.sub_columns.length > 0 ? (
                  <div className="bg-gray-100 rounded-lg p-3">
                    <div className="flex gap-2 overflow-x-auto">
                      {selectedCard.sub_columns?.sort((a, b) => a.order - b.order).map((subCol) => (
                        <div
                          key={subCol.id}
                          className="flex-1 min-w-[150px] max-w-[200px]"
                          onDragOver={handleSubtaskDragOver}
                          onDrop={(e) => handleSubtaskDrop(e, subCol.id)}
                        >
                          {/* Sub-Column Header */}
                          <div 
                            className="flex items-center justify-between px-2 py-1.5 rounded-t text-white text-xs font-bold"
                            style={{ backgroundColor: subCol.color }}
                          >
                            <span>{subCol.name}</span>
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                              {getSubColumnSubtasks(subCol.id).length}
                            </span>
                          </div>
                          
                          {/* Sub-Column Content */}
                          <div className="bg-white rounded-b min-h-[100px] p-1.5 space-y-1.5">
                            {getSubColumnSubtasks(subCol.id).map((subtask) => (
                              <div
                                key={subtask.id}
                                draggable
                                onDragStart={(e) => handleSubtaskDragStart(e, subtask)}
                                className={`p-2 bg-gray-50 rounded border border-gray-200 cursor-move hover:shadow-sm transition-all group text-xs ${
                                  draggedSubtask?.id === subtask.id ? 'opacity-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <GripVertical className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    {editingSubtaskId === subtask.id ? (
                                      <div className="flex gap-1">
                                        <Input
                                          value={editSubtaskTitle}
                                          onChange={(e) => setEditSubtaskTitle(e.target.value)}
                                          className="h-6 text-xs flex-1"
                                          autoFocus
                                          onKeyPress={(e) => e.key === 'Enter' && handleSaveSubtask(subtask.id)}
                                        />
                                        <button onClick={() => handleSaveSubtask(subtask.id)} className="p-1 hover:bg-green-100 rounded">
                                          <Check className="w-3 h-3 text-green-600" />
                                        </button>
                                        <button onClick={() => setEditingSubtaskId(null)} className="p-1 hover:bg-gray-200 rounded">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className={`block truncate ${subtask.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                                          {subtask.title}
                                        </span>
                                        <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100">
                                          <button
                                            onClick={() => startEditSubtask(subtask)}
                                            className="p-0.5 hover:bg-gray-200 rounded"
                                          >
                                            <Edit className="w-2.5 h-2.5 text-gray-500" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteSubtask(subtask.id)}
                                            className="p-0.5 hover:bg-red-100 rounded"
                                          >
                                            <Trash2 className="w-2.5 h-2.5 text-red-500" />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Add subtask button */}
                            <button
                              onClick={() => handleAddSubtaskToColumn(subCol.id)}
                              className="w-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded flex items-center justify-center gap-1 text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* List View (Original) */
                  <>
                    {/* Add new subtask */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        placeholder="เพิ่ม Subtask ใหม่..."
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                      />
                      <Button size="sm" onClick={handleAddSubtask} disabled={!newSubtaskTitle.trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      {selectedCard.subtasks?.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-3 p-2 bg-gray-50 rounded group"
                        >
                          <button
                            onClick={() => handleToggleSubtask(subtask.id, subtask.status)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              subtask.status === 'done' 
                                ? 'bg-green-500 border-green-500 text-white' 
                                : 'border-gray-300 hover:border-green-500'
                            }`}
                          >
                            {subtask.status === 'done' && <Check className="w-3 h-3" />}
                          </button>
                          
                          {editingSubtaskId === subtask.id ? (
                            <div className="flex-1 flex gap-2">
                              <Input
                                value={editSubtaskTitle}
                                onChange={(e) => setEditSubtaskTitle(e.target.value)}
                                className="flex-1"
                                autoFocus
                                onKeyPress={(e) => e.key === 'Enter' && handleSaveSubtask(subtask.id)}
                              />
                              <Button size="sm" onClick={() => handleSaveSubtask(subtask.id)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingSubtaskId(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className={`flex-1 ${subtask.status === 'done' ? 'line-through text-gray-500' : ''}`}>
                                {subtask.title}
                              </span>
                              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                <button
                                  onClick={() => startEditSubtask(subtask)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  <Edit className="w-3 h-3 text-gray-500" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubtask(subtask.id)}
                                  className="p-1 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {(!selectedCard.subtasks || selectedCard.subtasks.length === 0) && (
                        <p className="text-gray-500 text-sm text-center py-2">ยังไม่มี Subtask</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              
              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-bold flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments ({selectedCard.attachments?.length || 0})
                  </Label>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button size="sm" variant="outline" asChild>
                      <span>
                        <Upload className="w-3 h-3 mr-1" />
                        อัพโหลด
                      </span>
                    </Button>
                  </label>
                </div>
                <div className="space-y-2">
                  {selectedCard.attachments?.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <Paperclip className="w-4 h-4 text-gray-500" />
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {att.filename}
                      </a>
                    </div>
                  ))}
                  {(!selectedCard.attachments || selectedCard.attachments.length === 0) && (
                    <p className="text-gray-500 text-sm text-center py-2">ยังไม่มีไฟล์แนบ</p>
                  )}
                </div>
              </div>
              
              {/* Comments */}
              <div>
                <Label className="font-bold flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4" />
                  Comments ({selectedCard.comments?.length || 0})
                </Label>
                
                {/* Add new comment */}
                <div className="flex gap-2 mb-3">
                  <Textarea
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="เพิ่ม Comment..."
                    rows={2}
                    className="flex-1"
                  />
                  <Button onClick={handleAddComment} disabled={!newCommentText.trim()} className="self-end">
                    ส่ง
                  </Button>
                </div>
                
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {selectedCard.comments?.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 p-3 rounded">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{comment.created_by_name}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleString('th-TH')}
                        </span>
                      </div>
                      <p className="text-gray-700">{comment.content}</p>
                    </div>
                  ))}
                  {(!selectedCard.comments || selectedCard.comments.length === 0) && (
                    <p className="text-gray-500 text-sm text-center py-2">ยังไม่มี Comment</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-between p-4 border-t bg-gray-50">
              {/* Only show Delete button if user can edit this card */}
              {selectedCard.can_edit ? (
                <Button
                  variant="outline"
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => handleDeleteCard(selectedCard.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  ลบ Card
                </Button>
              ) : (
                <div></div>
              )}
              <Button onClick={() => { setShowCardModal(false); setSelectedCard(null); }}>
                ปิด
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Member Management Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-[#00A9CE] text-white">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                จัดการสมาชิก
              </h2>
              <button onClick={() => setShowMemberModal(false)} className="p-1 hover:bg-white/20 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Add Member Section - only for managers */}
            {project?.can_manage && (
              <div className="p-4 border-b bg-gray-50">
                <Label className="text-sm font-medium mb-2 block">เพิ่มสมาชิกใหม่</Label>
                <div className="relative">
                  <Input
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      if (e.target.value.length >= 2) {
                        searchAvailableUsers(e.target.value);
                      } else {
                        setAvailableUsers([]);
                      }
                    }}
                    placeholder="ค้นหาด้วยชื่อ, อีเมล, หรือรหัสนิสิต..."
                  />
                  {availableUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
                      {availableUsers.map((u) => (
                        <div
                          key={u.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                          onClick={() => handleAddMember(u.id, 'card_owner')}
                        >
                          <div className="flex items-center gap-2">
                            {u.profile_image ? (
                              <img src={u.profile_image} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#00A9CE] text-white flex items-center justify-center text-sm">
                                {u.full_name?.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-sm">{u.full_name}</p>
                              <p className="text-xs text-gray-500">{u.email} {u.student_id && `(${u.student_id})`}</p>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-[#00A9CE]" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Members List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00A9CE]" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-center text-gray-500 py-8">ยังไม่มีสมาชิก</p>
              ) : (
                members.map((member) => (
                  <div key={member.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {member.user_info?.profile_image ? (
                        <img src={member.user_info.profile_image} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#00A9CE] text-white flex items-center justify-center font-medium">
                          {member.user_info?.full_name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{member.user_info?.full_name}</p>
                        <p className="text-sm text-gray-500">{member.user_info?.email}</p>
                        {member.user_info?.student_id && (
                          <p className="text-xs text-gray-400">รหัสนิสิต: {member.user_info.student_id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {project?.can_manage && member.role !== 'owner' ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleUpdateMemberRole(member.user_id, value)}
                          >
                            <SelectTrigger className="w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">ผู้จัดการ/อาจารย์</SelectItem>
                              <SelectItem value="editor">แก้ไขทั้งหมด</SelectItem>
                              <SelectItem value="card_owner">จัดการ Card ตัวเอง</SelectItem>
                              <SelectItem value="viewer">ดูเท่านั้น</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            onClick={() => handleRemoveMember(member.user_id)}
                            className="p-1.5 hover:bg-red-100 rounded text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full ${roleColors[member.role]}`}>
                          {roleLabels[member.role]}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50">
              <Button className="w-full" onClick={() => setShowMemberModal(false)}>
                ปิด
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b bg-[#00A9CE] text-white">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Edit className="w-5 h-5" />
                แก้ไข Project
              </h2>
              <button onClick={() => setShowEditProject(false)} className="p-1 hover:bg-white/20 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <Label>ชื่อ Project</Label>
                <Input
                  value={editProjectForm.name}
                  onChange={(e) => setEditProjectForm({...editProjectForm, name: e.target.value})}
                  placeholder="ชื่อ Project"
                />
              </div>
              <div>
                <Label>คำอธิบาย</Label>
                <Textarea
                  value={editProjectForm.description}
                  onChange={(e) => setEditProjectForm({...editProjectForm, description: e.target.value})}
                  placeholder="คำอธิบาย Project"
                  rows={3}
                />
              </div>
              <div>
                <Label>การมองเห็น</Label>
                <Select
                  value={editProjectForm.visibility}
                  onValueChange={(value) => setEditProjectForm({...editProjectForm, visibility: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">ส่วนตัว (เฉพาะสมาชิก)</SelectItem>
                    <SelectItem value="public">สาธารณะ (ทุกคนดูได้)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex gap-2 p-4 border-t bg-gray-50">
              <Button variant="outline" onClick={() => setShowEditProject(false)} className="flex-1">
                ยกเลิก
              </Button>
              <Button onClick={handleEditProject} className="flex-1 bg-[#00A9CE] hover:bg-[#008FB5]">
                บันทึก
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
