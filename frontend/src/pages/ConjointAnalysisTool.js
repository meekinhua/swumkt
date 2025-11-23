import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus,
  TrendingUp,
  FileText,
  Settings,
  Users,
  BarChart3,
  ArrowRight,
  Calendar,
  Tag
} from 'lucide-react';

const ConjointAnalysisTool = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudy, setNewStudy] = useState({
    title: '',
    description: '',
    product_category: ''
  });

  useEffect(() => {
    if (user && token) {
      loadStudies();
    }
  }, [user, token]);

  const loadStudies = async () => {
    try {
      const response = await axios.get(`${API}/conjoint/studies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudies(response.data.studies);
    } catch (error) {
      console.error('Error loading studies:', error);
      toast.error('ไม่สามารถโหลดรายการศึกษาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudy = async () => {
    if (!newStudy.title.trim()) {
      toast.error('กรุณากรอกชื่อการศึกษา');
      return;
    }

    try {
      const response = await axios.post(
        `${API}/conjoint/studies`,
        newStudy,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('สร้างการศึกษาใหม่สำเร็จ!');
      setShowCreateModal(false);
      setNewStudy({ title: '', description: '', product_category: '' });
      
      // Navigate to qualitative phase
      navigate(`/research/conjoint/${response.data.study_id}/qualitative`);
    } catch (error) {
      console.error('Error creating study:', error);
      toast.error('ไม่สามารถสร้างการศึกษาได้');
    }
  };

  const getStatusBadge = (study) => {
    // Determine status based on actual state, not just status field
    let label, color;

    if (study.survey_started) {
      // Survey is published and collecting responses
      if (study.respondent_count > 0) {
        label = '🟢 เก็บข้อมูลแล้ว';
        color = 'bg-green-100 text-green-700 border border-green-300';
      } else {
        label = '🟢 สำรวจเปิด';
        color = 'bg-green-100 text-green-700 border border-green-300';
      }
    } else if (study.choice_sets && study.choice_sets.length > 0) {
      // Design generated but not published yet
      label = '🟣 Phase 2: ออกแบบ';
      color = 'bg-purple-100 text-purple-700 border border-purple-300';
    } else if (study.attributes && study.attributes.length > 0) {
      // Has attributes but no design yet
      label = '🔵 Phase 1: วิเคราะห์';
      color = 'bg-blue-100 text-blue-700 border border-blue-300';
    } else {
      // Just created, no data yet
      label = '⚪ ฉบับร่าง';
      color = 'bg-gray-100 text-gray-700 border border-gray-300';
    }

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${color}`}>
        {label}
      </span>
    );
  };

  const handleStudyAction = (study, action) => {
    if (action === 'edit') {
      // Always go to design page for editing
      navigate(`/research/conjoint/${study.id}/design`);
    } else if (action === 'view') {
      // View results
      navigate(`/research/conjoint/${study.id}/results`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-2">
                📊 Choice-Based Conjoint Analysis
              </h1>
              <p className="text-lg text-gray-600">
                วิเคราะห์ความสำคัญของคุณสมบัติผลิตภัณฑ์ และจำลองส่วนแบ่งตลาด
              </p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#005A73] hover:to-[#008FB5] text-white font-bold shadow-lg"
            >
              <Plus className="w-5 h-5 mr-2" />
              สร้างการศึกษาใหม่
            </Button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-blue-900 mb-1">Phase 1: Qualitative</h3>
                <p className="text-sm text-blue-700">ใช้ LLM วิเคราะห์หา Attributes และ Levels</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500 rounded-lg">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-purple-900 mb-1">Phase 2: Design</h3>
                <p className="text-sm text-purple-700">D-Optimal Design + AI Image Generation</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500 rounded-lg">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-green-900 mb-1">Phase 3: Analysis</h3>
                <p className="text-sm text-green-700">Part-Worth Utilities + Market Simulation</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Studies List */}
        <Card className="p-6 bg-white/95 border-2 border-gray-300 shadow-xl">
          <h2 className="text-2xl font-black text-gray-900 mb-6">การศึกษาของคุณ</h2>

          {studies.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold mb-4">ยังไม่มีการศึกษา</p>
              <Button
                onClick={() => setShowCreateModal(true)}
                variant="outline"
                className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10"
              >
                <Plus className="w-4 h-4 mr-2" />
                สร้างการศึกษาแรก
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {studies.map((study) => (
                <div
                  key={study.id}
                  className="p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{study.title}</h3>
                        {getStatusBadge(study)}
                      </div>
                      
                      {study.description && (
                        <p className="text-gray-600 mb-3">{study.description}</p>
                      )}

                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        {study.product_category && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-4 h-4" />
                            <span>{study.product_category}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(study.created_at).toLocaleDateString('th-TH')}</span>
                        </div>

                        {study.respondent_count > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>{study.respondent_count} ผู้ตอบ</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 min-w-[120px]">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStudyAction(study, 'edit');
                        }}
                        variant="outline"
                        size="sm"
                        className="border-2 border-blue-500 text-blue-700 hover:bg-blue-50"
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        แก้ไข
                      </Button>
                      
                      {study.respondent_count > 0 && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStudyAction(study, 'view');
                          }}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <BarChart3 className="w-4 h-4 mr-1" />
                          ดูรายงาน
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Create Study Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full p-6 bg-white">
            <h2 className="text-2xl font-black text-gray-900 mb-6">สร้างการศึกษา Conjoint Analysis ใหม่</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  ชื่อการศึกษา *
                </label>
                <input
                  type="text"
                  value={newStudy.title}
                  onChange={(e) => setNewStudy({ ...newStudy, title: e.target.value })}
                  placeholder="เช่น: การศึกษาคุณสมบัติสมาร์ทโฟน"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  คำอธิบาย
                </label>
                <textarea
                  value={newStudy.description}
                  onChange={(e) => setNewStudy({ ...newStudy, description: e.target.value })}
                  placeholder="อธิบายวัตถุประสงค์ของการศึกษา..."
                  rows={3}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  หมวดหมู่ผลิตภัณฑ์/บริการ
                </label>
                <input
                  type="text"
                  value={newStudy.product_category}
                  onChange={(e) => setNewStudy({ ...newStudy, product_category: e.target.value })}
                  placeholder="เช่น: Electronics, F&B, Service"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowCreateModal(false)}
                variant="outline"
                className="flex-1"
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleCreateStudy}
                className="flex-1 bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#005A73] hover:to-[#008FB5] text-white font-bold"
              >
                สร้างและเริ่มต้น
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConjointAnalysisTool;
