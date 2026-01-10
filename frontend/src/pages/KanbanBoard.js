import React, { useState, useEffect, useCallback } from 'react';
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
import { 
  ArrowLeft, Plus, MoreHorizontal, Trash2, Edit, Users, Calendar,
  CheckSquare, MessageSquare, Paperclip, Clock, AlertCircle, Loader2,
  Settings, Share2, GripVertical, X, Check, ChevronDown, ChevronRight
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
  const [editingColumn, setEditingColumn] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [draggedCard, setDraggedCard] = useState(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  
  const [cardForm, setCardForm] = useState({
    title: '',
    description: '',
    column_id: '',
    priority: 'medium',
    due_date: '',
    assignees: [],
    labels: []
  });

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

  // Handle card move (drag & drop)
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
    if (!draggedCard) return;

    if (draggedCard.column_id === targetColumnId) {
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
      
      // Update local state
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

  // Handle card delete
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

  // Handle column add
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

  // Handle column delete
  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm('ต้องการลบ Column นี้หรือไม่? Card ทั้งหมดจะถูกย้ายไป Column แรก')) return;

    try {
      await axios.delete(`${API}/projects/${projectId}/columns/${columnId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProject(); // Refresh to get updated columns and moved cards
      toast.success('ลบ Column สำเร็จ');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบ Column ได้');
    }
  };

  // Open card detail modal
  const openCardDetail = (card) => {
    setSelectedCard(card);
    setShowCardModal(true);
  };

  // Handle subtask toggle
  const handleToggleSubtask = async (subtaskId, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    
    try {
      await axios.put(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks/${subtaskId}`,
        { 
          title: selectedCard.subtasks.find(s => s.id === subtaskId)?.title || '',
          status: newStatus 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      const updatedSubtasks = selectedCard.subtasks.map(st =>
        st.id === subtaskId ? { ...st, status: newStatus } : st
      );
      setSelectedCard({ ...selectedCard, subtasks: updatedSubtasks });
      setCards(cards.map(c => 
        c.id === selectedCard.id 
          ? { ...c, subtasks: updatedSubtasks }
          : c
      ));
    } catch (error) {
      toast.error('ไม่สามารถอัพเดท Subtask ได้');
    }
  };

  // Add subtask
  const handleAddSubtask = async () => {
    const title = prompt('ชื่อ Subtask:');
    if (!title?.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/subtasks`,
        { title, status: 'pending' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedSubtasks = [...(selectedCard.subtasks || []), response.data];
      setSelectedCard({ ...selectedCard, subtasks: updatedSubtasks });
      setCards(cards.map(c => 
        c.id === selectedCard.id 
          ? { ...c, subtasks: updatedSubtasks }
          : c
      ));
      toast.success('เพิ่ม Subtask สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Subtask ได้');
    }
  };

  // Add comment
  const handleAddComment = async () => {
    const content = prompt('Comment:');
    if (!content?.trim()) return;

    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/cards/${selectedCard.id}/comments`,
        { content },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const updatedComments = [...(selectedCard.comments || []), response.data];
      setSelectedCard({ ...selectedCard, comments: updatedComments });
      toast.success('เพิ่ม Comment สำเร็จ!');
    } catch (error) {
      toast.error('ไม่สามารถเพิ่ม Comment ได้');
    }
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/projects')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                กลับ
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-gray-500">{project.description}</p>
                )}
              </div>
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
              <Button variant="outline" size="sm">
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
          {/* Columns */}
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
                  <button
                    onClick={() => handleCreateCard(column.id)}
                    className="p-1 hover:bg-white/20 rounded"
                    title="เพิ่ม Card"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {project.columns.length > 1 && (
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
                    className={`p-3 bg-white cursor-pointer hover:shadow-md transition-shadow ${
                      draggedCard?.id === card.id ? 'opacity-50' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => openCardDetail(card)}
                  >
                    {/* Priority Badge */}
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
                    
                    {/* Title */}
                    <h4 className="font-medium text-gray-900 mb-2 line-clamp-2">{card.title}</h4>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
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
                    
                    {/* Assignees */}
                    {card.assignee_details?.length > 0 && (
                      <div className="flex -space-x-2 mt-2">
                        {card.assignee_details.slice(0, 3).map((assignee, idx) => (
                          <div
                            key={idx}
                            className="w-6 h-6 rounded-full bg-[#00A9CE] text-white text-xs flex items-center justify-center border-2 border-white"
                            title={assignee.full_name}
                          >
                            {assignee.full_name?.charAt(0) || '?'}
                          </div>
                        ))}
                        {card.assignee_details.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-xs flex items-center justify-center border-2 border-white">
                            +{card.assignee_details.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
                
                {/* Add Card Button */}
                <button
                  onClick={() => handleCreateCard(column.id)}
                  className="w-full p-2 text-gray-500 hover:bg-gray-200 rounded flex items-center justify-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่ม Card
                </button>
              </div>
            </div>
          ))}

          {/* Add Column */}
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
        </div>
      </div>

      {/* Card Detail Modal */}
      {showCardModal && selectedCard && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl bg-white my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-4 border-b">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{selectedCard.title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  ใน {project.columns.find(c => c.id === selectedCard.column_id)?.name}
                </p>
              </div>
              <button
                onClick={() => { setShowCardModal(false); setSelectedCard(null); }}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 space-y-6">
              {/* Description */}
              <div>
                <Label className="font-bold flex items-center gap-2 mb-2">
                  <Edit className="w-4 h-4" />
                  รายละเอียด
                </Label>
                <p className="text-gray-600 bg-gray-50 p-3 rounded">
                  {selectedCard.description || 'ไม่มีรายละเอียด'}
                </p>
              </div>
              
              {/* Priority & Due Date */}
              <div className="flex gap-4">
                <div>
                  <Label className="font-bold mb-2 block">Priority</Label>
                  <span className={`px-3 py-1 rounded ${priorityColors[selectedCard.priority]}`}>
                    {priorityLabels[selectedCard.priority]}
                  </span>
                </div>
                {selectedCard.due_date && (
                  <div>
                    <Label className="font-bold mb-2 block">Due Date</Label>
                    <span className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {new Date(selectedCard.due_date).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-bold flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" />
                    Subtasks ({selectedCard.subtasks?.filter(s => s.status === 'done').length || 0}/{selectedCard.subtasks?.length || 0})
                  </Label>
                  <Button size="sm" variant="outline" onClick={handleAddSubtask}>
                    <Plus className="w-3 h-3 mr-1" />
                    เพิ่ม
                  </Button>
                </div>
                <div className="space-y-2">
                  {selectedCard.subtasks?.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-3 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                      onClick={() => handleToggleSubtask(subtask.id, subtask.status)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        subtask.status === 'done' 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-gray-300'
                      }`}>
                        {subtask.status === 'done' && <Check className="w-3 h-3" />}
                      </div>
                      <span className={subtask.status === 'done' ? 'line-through text-gray-500' : ''}>
                        {subtask.title}
                      </span>
                    </div>
                  ))}
                  {(!selectedCard.subtasks || selectedCard.subtasks.length === 0) && (
                    <p className="text-gray-500 text-sm">ยังไม่มี Subtask</p>
                  )}
                </div>
              </div>
              
              {/* Comments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-bold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Comments ({selectedCard.comments?.length || 0})
                  </Label>
                  <Button size="sm" variant="outline" onClick={handleAddComment}>
                    <Plus className="w-3 h-3 mr-1" />
                    เพิ่ม
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
                    <p className="text-gray-500 text-sm">ยังไม่มี Comment</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-between p-4 border-t bg-gray-50">
              <Button
                variant="outline"
                className="text-red-500 hover:bg-red-50"
                onClick={() => handleDeleteCard(selectedCard.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                ลบ Card
              </Button>
              <Button
                onClick={() => { setShowCardModal(false); setSelectedCard(null); }}
              >
                ปิด
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
