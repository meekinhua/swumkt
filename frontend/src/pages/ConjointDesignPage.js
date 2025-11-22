import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Edit2,
  Save,
  Sparkles,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

const ConjointDesignPage = () => {
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { user, token } = useAuth();
  
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  const [attributes, setAttributes] = useState([]);
  const [editingAttr, setEditingAttr] = useState(null);
  const [alternativesPerSet, setAlternativesPerSet] = useState(3);
  const [numberOfSets, setNumberOfSets] = useState(null);
  const [designGenerated, setDesignGenerated] = useState(false);

  useEffect(() => {
    if (user && token && studyId) {
      loadStudy();
    }
  }, [user, token, studyId]);

  const loadStudy = async () => {
    try {
      const response = await axios.get(`${API}/conjoint/studies/${studyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudy(response.data);
      
      // Load attributes from suggested_attributes or existing attributes
      if (response.data.attributes && response.data.attributes.length > 0) {
        setAttributes(response.data.attributes);
      } else if (response.data.suggested_attributes) {
        setAttributes(response.data.suggested_attributes);
      }
      
      // Check if design already generated
      if (response.data.choice_sets && response.data.choice_sets.length > 0) {
        setDesignGenerated(true);
        setAlternativesPerSet(response.data.alternatives_per_set || 3);
        setNumberOfSets(response.data.choice_sets.length);
      }
    } catch (error) {
      console.error('Error loading study:', error);
      toast.error('ไม่สามารถโหลดข้อมูลการศึกษาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAttributes = async () => {
    if (attributes.length === 0) {
      toast.error('กรุณาเพิ่ม attribute อย่างน้อย 1 รายการ');
      return;
    }

    // Validate attributes
    for (const attr of attributes) {
      if (!attr.name || attr.name.trim() === '') {
        toast.error('กรุณากรอกชื่อ attribute ให้ครบ');
        return;
      }
      if (!attr.levels || attr.levels.length < 2) {
        toast.error(`Attribute "${attr.name}" ต้องมี level อย่างน้อย 2 รายการ`);
        return;
      }
    }

    try {
      await axios.put(
        `${API}/conjoint/studies/${studyId}/attributes`,
        {
          study_id: studyId,
          attributes: attributes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('บันทึก attributes สำเร็จ');
      await loadStudy();
    } catch (error) {
      console.error('Error saving attributes:', error);
      toast.error('ไม่สามารถบันทึก attributes ได้');
    }
  };

  const handleGenerateDesign = async () => {
    if (attributes.length === 0) {
      toast.error('กรุณาบันทึก attributes ก่อน');
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-design`,
        {
          study_id: studyId,
          alternatives_per_set: alternativesPerSet,
          number_of_sets: numberOfSets,
          design_method: 'd-optimal'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`สร้าง ${response.data.num_choice_sets} choice sets สำเร็จ!`);
      setDesignGenerated(true);
      await loadStudy();
    } catch (error) {
      console.error('Error generating design:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้าง design ได้');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddAttribute = () => {
    const newAttr = {
      id: `temp-${Date.now()}`,
      name: '',
      description: '',
      levels: [
        { id: `level-1-${Date.now()}`, value: '', description: '' },
        { id: `level-2-${Date.now()}`, value: '', description: '' }
      ],
      order: attributes.length
    };
    setAttributes([...attributes, newAttr]);
    setEditingAttr(newAttr.id);
  };

  const handleRemoveAttribute = (attrId) => {
    setAttributes(attributes.filter(a => a.id !== attrId));
  };

  const handleUpdateAttribute = (attrId, field, value) => {
    setAttributes(attributes.map(attr => 
      attr.id === attrId ? { ...attr, [field]: value } : attr
    ));
  };

  const handleAddLevel = (attrId) => {
    setAttributes(attributes.map(attr => {
      if (attr.id === attrId) {
        return {
          ...attr,
          levels: [
            ...attr.levels,
            { id: `level-${attr.levels.length + 1}-${Date.now()}`, value: '', description: '' }
          ]
        };
      }
      return attr;
    }));
  };

  const handleRemoveLevel = (attrId, levelId) => {
    setAttributes(attributes.map(attr => {
      if (attr.id === attrId) {
        return {
          ...attr,
          levels: attr.levels.filter(l => l.id !== levelId)
        };
      }
      return attr;
    }));
  };

  const handleUpdateLevel = (attrId, levelId, field, value) => {
    setAttributes(attributes.map(attr => {
      if (attr.id === attrId) {
        return {
          ...attr,
          levels: attr.levels.map(level =>
            level.id === levelId ? { ...level, [field]: value } : level
          )
        };
      }
      return attr;
    }));
  };

  const calculateRecommendedSets = () => {
    if (attributes.length === 0) return 12;
    
    const totalLevels = attributes.reduce((sum, attr) => sum + attr.levels.length, 0);
    const totalParams = totalLevels - attributes.length;
    const minSets = Math.max(8, Math.ceil((3 * totalParams) / alternativesPerSet));
    return Math.min(Math.ceil(minSets / 4) * 4, 20);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  const recommendedSets = calculateRecommendedSets();

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(`/research/conjoint/${studyId}/qualitative`)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ Phase 1
          </Button>

          <h1 className="text-4xl font-black text-gray-900 mb-2">
            Phase 2: Study Design
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            {study?.title}
          </p>
          <p className="text-gray-600">
            แก้ไข Attributes & Levels และสร้าง Choice Sets ด้วย D-Optimal Design
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                ✓
              </div>
              <span className="font-bold text-green-600">Qualitative</span>
            </div>
            <div className="h-1 w-16 bg-[#00A9CE]"></div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#00A9CE] text-white flex items-center justify-center font-bold">
                2
              </div>
              <span className="font-bold text-[#00A9CE]">Design</span>
            </div>
            <div className="h-1 w-16 bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold">
                3
              </div>
              <span className="text-gray-600">Analysis</span>
            </div>
          </div>
        </div>

        {/* Attributes Section */}
        <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900">
              Attributes & Levels
            </h2>
            <div className="flex gap-2">
              <Button
                onClick={handleAddAttribute}
                variant="outline"
                className="border-2 border-[#00A9CE] text-[#005A73]"
              >
                <Plus className="w-4 h-4 mr-2" />
                เพิ่ม Attribute
              </Button>
              <Button
                onClick={handleSaveAttributes}
                className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                บันทึก
              </Button>
            </div>
          </div>

          {attributes.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500 font-semibold mb-4">ยังไม่มี Attribute</p>
              <Button onClick={handleAddAttribute} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                เพิ่ม Attribute แรก
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {attributes.map((attr, attrIndex) => (
                <div key={attr.id} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={attr.name}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'name', e.target.value)}
                        placeholder="ชื่อ Attribute (เช่น: ราคา, แบรนด์)"
                        className="w-full p-2 mb-2 border-2 border-gray-300 rounded-lg font-bold text-lg focus:border-[#00A9CE] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={attr.description || ''}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'description', e.target.value)}
                        placeholder="คำอธิบาย (optional)"
                        className="w-full p-2 border-2 border-gray-300 rounded-lg text-sm focus:border-[#00A9CE] focus:outline-none"
                      />
                    </div>
                    <Button
                      onClick={() => handleRemoveAttribute(attr.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2 mb-3">
                    {attr.levels.map((level, levelIndex) => (
                      <div key={level.id} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#00A9CE] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {levelIndex + 1}
                        </div>
                        <input
                          type="text"
                          value={level.value}
                          onChange={(e) => handleUpdateLevel(attr.id, level.id, 'value', e.target.value)}
                          placeholder="Level value"
                          className="flex-1 p-2 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                        />
                        {attr.levels.length > 2 && (
                          <Button
                            onClick={() => handleRemoveLevel(attr.id, level.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleAddLevel(attr.id)}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    เพิ่ม Level
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Design Configuration */}
        {attributes.length > 0 && (
          <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              D-Optimal Design Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Alternatives ต่อ Choice Set
                </label>
                <select
                  value={alternativesPerSet}
                  onChange={(e) => setAlternativesPerSet(Number(e.target.value))}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                >
                  <option value={2}>2 (เปรียบเทียบคู่)</option>
                  <option value={3}>3 (แนะนำ)</option>
                  <option value={4}>4 (เลือกมาก)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  จำนวน Choice Sets
                </label>
                <input
                  type="number"
                  value={numberOfSets || recommendedSets}
                  onChange={(e) => setNumberOfSets(Number(e.target.value) || null)}
                  placeholder={`แนะนำ: ${recommendedSets}`}
                  min={8}
                  max={20}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
                <p className="text-xs text-gray-600 mt-1">
                  แนะนำ: {recommendedSets} sets (auto-calculated)
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200 mb-6">
              <h3 className="font-bold text-blue-900 mb-2">Design Summary:</h3>
              <div className="space-y-1 text-sm text-blue-700">
                <p>• Attributes: {attributes.length}</p>
                <p>• Total Levels: {attributes.reduce((sum, attr) => sum + attr.levels.length, 0)}</p>
                <p>• Alternatives per Set: {alternativesPerSet}</p>
                <p>• Choice Sets: {numberOfSets || recommendedSets}</p>
                <p>• Total Profiles: {(numberOfSets || recommendedSets) * alternativesPerSet}</p>
                <p className="font-bold mt-2">• Recommended Sample: {Math.max(200, (numberOfSets || recommendedSets) * 15)} respondents</p>
              </div>
            </div>

            <Button
              onClick={handleGenerateDesign}
              disabled={generating || designGenerated}
              className="w-full bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white font-bold"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  กำลังสร้าง D-Optimal Design...
                </>
              ) : designGenerated ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Design ถูกสร้างแล้ว
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  สร้าง D-Optimal Design
                </>
              )}
            </Button>

            {designGenerated && (
              <div className="mt-4 text-center">
                <Button
                  onClick={() => {
                    setDesignGenerated(false);
                    handleGenerateDesign();
                  }}
                  variant="outline"
                  className="text-sm"
                >
                  <RefreshCw className="w-3 h-3 mr-2" />
                  สร้างใหม่
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Next Step */}
        {designGenerated && (
          <div className="flex justify-end">
            <Button
              onClick={() => navigate(`/research/conjoint/${studyId}/results`)}
              className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white font-bold"
            >
              ดำเนินการต่อไป Phase 3
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConjointDesignPage;
