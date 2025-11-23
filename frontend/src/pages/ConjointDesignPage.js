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
  RefreshCw,
  Copy,
  Link,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  X
} from 'lucide-react';

// Component for managing profile image (composite image)
const ProfileImageCard = ({ studyId, choiceSetId, profile, profileIndex, attributes, token, onImageUpdated }) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState(profile.profile_image_url || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  const handleUploadUrl = async () => {
    if (!tempUrl.trim()) {
      toast.error('กรุณากรอก URL รูปภาพ');
      return;
    }

    setUploading(true);
    try {
      await axios.post(
        `${API}/conjoint/studies/${studyId}/upload-profile-image`,
        {
          choice_set_id: choiceSetId,
          profile_id: profile.id,
          image_url: tempUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setImageUrl(tempUrl);
      setShowUrlInput(false);
      setTempUrl('');
      toast.success('อัพโหลดรูป Profile สำเร็จ');
      onImageUpdated();
    } catch (error) {
      console.error('Error uploading profile image:', error);
      toast.error('ไม่สามารถอัพโหลดรูปได้');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-profile-image`,
        {
          choice_set_id: choiceSetId,
          profile_id: profile.id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.image_url) {
        setImageUrl(response.data.image_url);
        toast.success('สร้างรูป Profile สำเร็จด้วย AI!');
        onImageUpdated();
      } else {
        toast.warning('ไม่สามารถสร้างรูปได้');
      }
    } catch (error) {
      console.error('Error generating profile image:', error);
      const errorMsg = error.response?.data?.detail || 'ไม่สามารถสร้างรูปได้';
      toast.error(errorMsg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveImage = async () => {
    setUploading(true);
    try {
      await axios.post(
        `${API}/conjoint/studies/${studyId}/upload-profile-image`,
        {
          choice_set_id: choiceSetId,
          profile_id: profile.id,
          image_url: ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setImageUrl('');
      toast.success('ลบรูป Profile สำเร็จ');
      onImageUpdated();
    } catch (error) {
      console.error('Error removing profile image:', error);
      toast.error('ไม่สามารถลบรูปได้');
    } finally {
      setUploading(false);
    }
  };

  // Get level values for this profile
  const getLevelInfo = (attrId) => {
    const levelId = profile.attribute_levels[attrId];
    const attr = attributes.find(a => a.id === attrId);
    const level = attr?.levels.find(l => l.id === levelId);
    return level ? `${attr.name}: ${level.value}` : '';
  };

  return (
    <div className="p-3 bg-white rounded-lg border-2 border-blue-200">
      <div className="font-bold text-gray-900 mb-2 text-sm">
        Profile {String.fromCharCode(65 + profileIndex)}
      </div>
      
      {/* Profile composition */}
      <div className="text-xs text-gray-600 mb-3 space-y-1">
        {Object.keys(profile.attribute_levels).map(attrId => (
          <div key={attrId}>• {getLevelInfo(attrId)}</div>
        ))}
      </div>

      {/* Image Preview */}
      {imageUrl ? (
        <div className="relative mb-3">
          <img 
            src={imageUrl} 
            alt={`Profile ${String.fromCharCode(65 + profileIndex)}`}
            className="w-full h-40 object-cover rounded border-2 border-blue-300"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23ddd"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">No Image</text></svg>';
            }}
          />
          <button
            onClick={handleRemoveImage}
            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="w-full h-40 bg-blue-50 rounded border-2 border-dashed border-blue-300 flex items-center justify-center mb-3">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 text-blue-400 mx-auto mb-1" />
            <span className="text-xs text-blue-600">Composite Image</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showUrlInput ? (
        <div className="flex gap-2">
          <Button
            onClick={() => setShowUrlInput(true)}
            size="sm"
            variant="outline"
            className="flex-1 text-xs border-2 border-blue-400 text-blue-700"
          >
            <Upload className="w-3 h-3 mr-1" />
            Upload
          </Button>
          <Button
            onClick={handleGenerate}
            size="sm"
            disabled={generating}
            className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            {generating ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                AI
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="วาง URL รูปภาพ Profile"
            className="w-full p-2 border-2 border-blue-300 rounded text-xs"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setShowUrlInput(false);
                setTempUrl('');
              }}
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleUploadUrl}
              size="sm"
              disabled={uploading}
              className="flex-1 text-xs bg-blue-600 text-white"
            >
              {uploading ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Component for managing image for each level
const ImageLevelCard = ({ studyId, attributeId, attributeName, level, token, onImageUpdated }) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState(level.image_url || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  const handleUploadUrl = async () => {
    if (!tempUrl.trim()) {
      toast.error('กรุณากรอก URL รูปภาพ');
      return;
    }

    setUploading(true);
    try {
      await axios.post(
        `${API}/conjoint/studies/${studyId}/upload-image`,
        {
          attribute_id: attributeId,
          level_id: level.id,
          image_url: tempUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setImageUrl(tempUrl);
      setShowUrlInput(false);
      setTempUrl('');
      toast.success('อัพโหลดรูปภาพสำเร็จ');
      onImageUpdated();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('ไม่สามารถอัพโหลดรูปภาพได้');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-single-image`,
        {
          attribute_id: attributeId,
          level_id: level.id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.image_url) {
        setImageUrl(response.data.image_url);
        toast.success('สร้างรูปภาพสำเร็จด้วย AI!');
        onImageUpdated();
      } else {
        toast.warning('ไม่สามารถสร้างรูปได้ - กรุณาอัพโหลดรูปเอง');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      const errorMsg = error.response?.data?.detail || 'ไม่สามารถสร้างรูปได้';
      toast.error(errorMsg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveImage = async () => {
    setUploading(true);
    try {
      await axios.post(
        `${API}/conjoint/studies/${studyId}/upload-image`,
        {
          attribute_id: attributeId,
          level_id: level.id,
          image_url: ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setImageUrl('');
      toast.success('ลบรูปภาพสำเร็จ');
      onImageUpdated();
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('ไม่สามารถลบรูปภาพได้');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-3 bg-white rounded-lg border-2 border-gray-200">
      <div className="font-semibold text-gray-900 mb-2 text-sm">
        {level.value}
      </div>
      
      {level.description && (
        <p className="text-xs text-gray-600 mb-3">
          {level.description}
        </p>
      )}

      {/* Image Preview */}
      {imageUrl ? (
        <div className="relative mb-3">
          <img 
            src={imageUrl} 
            alt={level.value}
            className="w-full h-32 object-cover rounded border-2 border-gray-200"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23ddd"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">No Image</text></svg>';
            }}
          />
          <button
            onClick={handleRemoveImage}
            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="w-full h-32 bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center mb-3">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Action Buttons */}
      {!showUrlInput ? (
        <div className="flex gap-2">
          <Button
            onClick={() => setShowUrlInput(true)}
            size="sm"
            variant="outline"
            className="flex-1 text-xs border-2"
          >
            <Upload className="w-3 h-3 mr-1" />
            Upload
          </Button>
          <Button
            onClick={handleGenerate}
            size="sm"
            disabled={generating}
            className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            {generating ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                AI
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="วาง URL รูปภาพ"
            className="w-full p-2 border-2 border-gray-300 rounded text-xs"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setShowUrlInput(false);
                setTempUrl('');
              }}
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleUploadUrl}
              size="sm"
              disabled={uploading}
              className="flex-1 text-xs bg-blue-600 text-white"
            >
              {uploading ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

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

  const handleCopySurveyLink = () => {
    const surveyLink = `${window.location.origin}/survey/conjoint/${studyId}`;
    navigator.clipboard.writeText(surveyLink);
    toast.success('คัดลอกลิงก์แล้ว!');
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

        {/* Image Management - Individual Level Control */}
        {designGenerated && attributes.length > 0 && (
          <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              Phase 3: จัดการรูปภาพแต่ละ Profile
            </h2>

            <p className="text-gray-700 mb-6">
              เพิ่มรูปภาพให้กับแต่ละ attribute level เพื่อให้ respondents เห็นภาพชัดเจนขึ้น
              <br />
              <span className="text-sm text-gray-600">
                (Optional - สามารถข้ามและดำเนินการต่อได้)
              </span>
            </p>

            {/* Image Management for each attribute */}
            <div className="space-y-6 mb-6">
              {attributes.map((attr) => (
                <div key={attr.id} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    {attr.name}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {attr.levels.map((level) => (
                      <ImageLevelCard
                        key={level.id}
                        studyId={studyId}
                        attributeId={attr.id}
                        attributeName={attr.name}
                        level={level}
                        token={token}
                        onImageUpdated={loadStudy}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Survey Link Section */}
            <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-300 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-900 mb-2">
                    ลิงก์แบบสอบถาม (พร้อมใช้งาน)
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={`${window.location.origin}/survey/conjoint/${studyId}`}
                      readOnly
                      className="flex-1 p-2 border-2 border-blue-300 rounded-lg bg-white font-mono text-xs"
                    />
                    <Button
                      onClick={handleCopySurveyLink}
                      size="sm"
                      className="bg-blue-600 text-white"
                    >
                      คัดลอก
                    </Button>
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    💡 แชร์ลิงก์นี้ให้ผู้ตอบแบบสอบถามได้เลย - survey จะแสดงรูปภาพที่มี หรือข้อความอธิบายถ้าไม่มีรูป
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Profile Images Management */}
        {designGenerated && study?.choice_sets && study.choice_sets.length > 0 && (
          <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
            <h2 className="text-2xl font-black text-gray-900 mb-4">
              จัดการรูปภาพ Profile (Optional)
            </h2>
            
            <p className="text-gray-700 mb-6">
              Profile = การรวมกันของหลาย levels จากต่าง attributes<br />
              <span className="text-sm text-gray-600">
                เช่น: Profile A = ราคา 15,000 บาท + แบรนด์ Samsung + หน้าจอ 6.5 นิ้ว<br />
                คุณสามารถ set รูปประกอบ (composite image) ให้แต่ละ profile ได้
              </span>
            </p>

            <div className="space-y-4">
              {study.choice_sets.map((choiceSet, idx) => (
                <div key={choiceSet.id} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                  <h3 className="text-base font-bold text-gray-900 mb-3">
                    Choice Set {idx + 1}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {choiceSet.profiles.map((profile, profileIdx) => (
                      <ProfileImageCard
                        key={profile.id}
                        studyId={studyId}
                        choiceSetId={choiceSet.id}
                        profile={profile}
                        profileIndex={profileIdx}
                        attributes={attributes}
                        token={token}
                        onImageUpdated={loadStudy}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Next Step - View Results */}
        {designGenerated && (
          <div className="flex justify-end">
            <Button
              onClick={() => navigate(`/research/conjoint/${studyId}/results`)}
              className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white font-bold"
            >
              ดูผลการวิเคราะห์
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConjointDesignPage;
