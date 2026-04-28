import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { BeTopbar, Icon } from '@/pages/brand-equity/be-components';
import { copyToClipboard } from '@/lib/clipboard';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ReferenceImagesSection from '@/components/ReferenceImagesSection';
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
const ProfileImageCard = ({ studyId, choiceSetId, profile, profileIndex, attributes, token, onImageUpdated, referenceImages = [] }) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState(profile.profile_image_url || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState([]); // Track selected reference images
  const [additionalPrompt, setAdditionalPrompt] = useState(''); // Additional prompt text
  
  // Generate prompt for this profile
  const generatePrompt = () => {
    const features = Object.keys(profile.attribute_levels).map(attrId => {
      const attr = attributes.find(a => a.id === attrId);
      const levelId = profile.attribute_levels[attrId];
      const level = attr?.levels.find(l => l.id === levelId);
      return `${attr?.name}: ${level?.value}`;
    }).join(', ');
    
    return `Create a high-quality product image with the following specifications: ${features}. The image should be professional, realistic, and clearly show all mentioned features. Use a clean background and good lighting. This is for market research purposes.`;
  };
  
  // Toggle reference image selection
  const toggleRefSelection = (index) => {
    setSelectedRefs(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

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
      const payload = {
        choice_set_id: choiceSetId,
        profile_id: profile.id
      };
      
      // Add reference images if selected
      if (selectedRefs.length > 0) {
        payload.reference_image_indices = selectedRefs;
      }
      
      // Add additional prompt if provided
      if (additionalPrompt.trim()) {
        payload.additional_prompt = additionalPrompt.trim();
      }
      
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-profile-image`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.image_url) {
        setImageUrl(response.data.image_url);
        const msg = selectedRefs.length > 0 
          ? `สร้างรูป Profile สำเร็จด้วย AI! (ใช้ ${selectedRefs.length} รูปอ้างอิง)`
          : 'สร้างรูป Profile สำเร็จด้วย AI!';
        toast.success(msg);
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
    <div className="p-2 sm:p-3 bg-white rounded-lg border-2 border-blue-200">
      <div className="font-bold text-gray-900 mb-2 text-xs sm:text-sm">
        Profile {String.fromCharCode(65 + profileIndex)}
      </div>
      
      {/* Profile composition */}
      <div className="text-xs text-gray-600 mb-2 sm:mb-3 space-y-1">
        {Object.keys(profile.attribute_levels).map(attrId => (
          <div key={attrId} className="truncate" title={getLevelInfo(attrId)}>• {getLevelInfo(attrId)}</div>
        ))}
      </div>

      {/* Image Preview */}
      {imageUrl ? (
        <div className="relative mb-3 w-full aspect-square">
          <img 
            src={imageUrl} 
            alt={`Profile ${String.fromCharCode(65 + profileIndex)}`}
            className="w-full h-full object-cover rounded border-2 border-blue-300"
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
        <div className="w-full aspect-square bg-blue-50 rounded border-2 border-dashed border-blue-300 flex items-center justify-center mb-3">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 text-blue-400 mx-auto mb-1" />
            <span className="text-xs text-blue-600">Composite Image</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showUrlInput ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
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
          
          {/* Reference Images Selection */}
          {referenceImages.length > 0 && (
            <div className="border-t border-blue-200 pt-2 mb-2">
              <p className="text-xs font-semibold text-blue-700 mb-2">
                🎨 เลือกรูปอ้างอิง (Optional):
              </p>
              <div className="grid grid-cols-5 gap-2">
                {referenceImages.map((refImg, index) => (
                  <div key={index} className="relative">
                    <label className="cursor-pointer block">
                      <input
                        type="checkbox"
                        checked={selectedRefs.includes(index)}
                        onChange={() => toggleRefSelection(index)}
                        className="absolute top-1 left-1 w-4 h-4 z-10"
                      />
                      <img
                        src={refImg}
                        alt={`Ref ${index + 1}`}
                        className={`w-full aspect-square object-cover rounded border-2 ${
                          selectedRefs.includes(index) 
                            ? 'border-blue-500 ring-2 ring-blue-300' 
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
                        #{index + 1}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-1">
                {selectedRefs.length > 0 
                  ? `เลือกแล้ว ${selectedRefs.length} รูป` 
                  : 'ไม่ได้เลือกรูปอ้างอิง'}
              </p>
              
              {/* Additional Prompt Input */}
              {selectedRefs.length > 0 && (
                <div className="mt-2">
                  <label className="text-xs font-semibold text-blue-700 block mb-1">
                    ✨ Prompt เสริม:
                  </label>
                  <input
                    type="text"
                    value={additionalPrompt}
                    onChange={(e) => setAdditionalPrompt(e.target.value)}
                    placeholder='เช่น "บรรยากาศสบายๆ"'
                    className="w-full px-2 py-1 text-xs border border-blue-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Show Prompt Section */}
          <div className="border-t border-blue-200 pt-2">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-blue-600 hover:text-blue-900 flex items-center gap-1 w-full font-medium cursor-pointer"
            >
              <span>
                {showPrompt ? '▼' : '▶'} AI Prompt
              </span>
            </button>
            
            {showPrompt && (
              <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-900 mb-2 leading-relaxed">
                  {generatePrompt()}
                </p>
                <button
                  onClick={() => copyToClipboard(generatePrompt(), { successMessage: 'คัดลอก prompt แล้ว' })}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  คัดลอก prompt
                </button>
                <p className="text-xs text-blue-600 mt-2 italic">
                  💡 ใช้ prompt นี้กับ AI ภายนอก (ChatGPT, Midjourney) แล้วนำรูปมา Upload
                </p>
              </div>
            )}
          </div>
        </>
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
const ImageLevelCard = ({ studyId, attributeId, attributeName, level, token, onImageUpdated, referenceImages = [] }) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState(level.image_url || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState([]); // Track selected reference images
  const [additionalPrompt, setAdditionalPrompt] = useState(''); // Additional prompt text
  const [promptSettings, setPromptSettings] = useState(null);
  
  // Load prompt settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get(`${API}/api/admin/conjoint-image-settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPromptSettings(response.data);
      } catch (error) {
        console.error('Error loading prompt settings:', error);
      }
    };
    loadSettings();
  }, [token]);
  
  // Generate prompt for this level - changes based on reference selection
  const generatePrompt = () => {
    if (!promptSettings) {
      return `Create a high-quality product image for: ${attributeName} - ${level.value}${level.description ? ` (${level.description})` : ''}`;
    }
    
    // Select appropriate prompt template
    const template = selectedRefs.length > 0 
      ? promptSettings.level_image_prompt_with_ref
      : promptSettings.level_image_prompt_template;
    
    // Replace variables
    return template
      .replace('{attribute_name}', attributeName)
      .replace('{level_value}', level.value)
      .replace('{level_description}', level.description || '');
  };
  
  // Toggle reference image selection
  const toggleRefSelection = (index) => {
    setSelectedRefs(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

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
      const payload = {
        attribute_id: attributeId,
        level_id: level.id
      };
      
      // Add reference images if selected
      if (selectedRefs.length > 0) {
        payload.reference_image_indices = selectedRefs;
      }
      
      // Add additional prompt if provided
      if (additionalPrompt.trim()) {
        payload.additional_prompt = additionalPrompt.trim();
      }
      
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-single-image`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.image_url) {
        setImageUrl(response.data.image_url);
        const msg = selectedRefs.length > 0 
          ? `สร้างรูปภาพสำเร็จด้วย AI! (ใช้ ${selectedRefs.length} รูปอ้างอิง)`
          : 'สร้างรูปภาพสำเร็จด้วย AI!';
        toast.success(msg);
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
        <div className="relative mb-3 w-full aspect-square">
          <img 
            src={imageUrl} 
            alt={level.value}
            className="w-full h-full object-cover rounded border-2 border-gray-200"
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
        <div className="w-full aspect-square bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center mb-3">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Action Buttons */}
      {!showUrlInput ? (
        <>
          <div className="flex gap-2 mb-2">
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
          
          {/* Reference Images Selection */}
          {referenceImages.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                🎨 เลือกรูปอ้างอิง (Optional):
              </p>
              <div className="grid grid-cols-5 gap-2">
                {referenceImages.map((refImg, index) => (
                  <div key={index} className="relative">
                    <label className="cursor-pointer block">
                      <input
                        type="checkbox"
                        checked={selectedRefs.includes(index)}
                        onChange={() => toggleRefSelection(index)}
                        className="absolute top-1 left-1 w-4 h-4 z-10"
                      />
                      <img
                        src={refImg}
                        alt={`Ref ${index + 1}`}
                        className={`w-full aspect-square object-cover rounded border-2 ${
                          selectedRefs.includes(index) 
                            ? 'border-purple-500 ring-2 ring-purple-300' 
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
                        #{index + 1}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {selectedRefs.length > 0 
                  ? `เลือกแล้ว ${selectedRefs.length} รูป` 
                  : 'ไม่ได้เลือกรูปอ้างอิง'}
              </p>
              
              {/* Additional Prompt Input */}
              {selectedRefs.length > 0 && (
                <div className="mt-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    ✨ Prompt เสริม:
                  </label>
                  <input
                    type="text"
                    value={additionalPrompt}
                    onChange={(e) => setAdditionalPrompt(e.target.value)}
                    placeholder='เช่น "นางแบบกำลังกิน"'
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Show Prompt Section */}
          <div className="border-t border-gray-200 pt-2">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1 w-full"
            >
              <span className="font-medium">
                {showPrompt ? '▼' : '▶'} AI Prompt
              </span>
            </button>
            
            {showPrompt && (
              <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-700 mb-2 leading-relaxed">
                  {generatePrompt()}
                </p>
                <button
                  onClick={() => copyToClipboard(generatePrompt(), { successMessage: 'คัดลอก prompt แล้ว' })}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  คัดลอก prompt
                </button>
                <p className="text-xs text-gray-500 mt-2 italic">
                  💡 ใช้ prompt นี้กับ AI ภายนอก (ChatGPT, Midjourney) แล้วนำรูปมา Upload
                </p>
              </div>
            )}
          </div>
        </>
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
  const [isDirty, setIsDirty] = useState(false); // Track unsaved changes
  const [surveyStarted, setSurveyStarted] = useState(false); // Track if survey is active
  const [startingSurvey, setStartingSurvey] = useState(false);
  const [referenceImages, setReferenceImages] = useState([]); // Reference images for AI

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
      
      // Check if survey has started
      setSurveyStarted(response.data.survey_started || false);
      
      // Load reference images
      setReferenceImages(response.data.reference_images || []);
      
      // Reset dirty flag after loading
      setIsDirty(false);
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
      setIsDirty(false); // Clear dirty flag after successful save
      await loadStudy();
    } catch (error) {
      console.error('Error saving attributes:', error);
      toast.error('ไม่สามารถบันทึก attributes ได้');
    }
  };

  const handleStartSurvey = async () => {
    if (!designGenerated) {
      toast.error('กรุณาสร้าง D-Optimal Design ก่อนเริ่มสำรวจ');
      return;
    }

    setStartingSurvey(true);
    try {
      await axios.post(
        `${API}/conjoint/studies/${studyId}/start-survey`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('เริ่มสำรวจสำเร็จ - ตอนนี้แก้ไขได้เฉพาะชื่อ คำอธิบาย และรูปภาพ');
      setSurveyStarted(true);
      await loadStudy();
    } catch (error) {
      console.error('Error starting survey:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถเริ่มสำรวจได้');
    } finally {
      setStartingSurvey(false);
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
    setIsDirty(true); // Mark as changed
  };

  const handleRemoveAttribute = (attrId) => {
    setAttributes(attributes.filter(a => a.id !== attrId));
    setIsDirty(true); // Mark as changed
  };

  const handleUpdateAttribute = (attrId, field, value) => {
    setAttributes(attributes.map(attr => 
      attr.id === attrId ? { ...attr, [field]: value } : attr
    ));
    if (!surveyStarted) {
      setIsDirty(true); // Mark as changed only if survey not started
    }
  };

  // Auto-save when survey is started (edit mode)
  const handleAutoSaveAttribute = async (attrId, field, value) => {
    if (!surveyStarted) return; // Only auto-save when survey started

    try {
      const updatedAttributes = attributes.map(attr =>
        attr.id === attrId ? { ...attr, [field]: value } : attr
      );

      await axios.put(
        `${API}/conjoint/studies/${studyId}/attributes`,
        {
          study_id: studyId,
          attributes: updatedAttributes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('บันทึกอัตโนมัติสำเร็จ', { duration: 2000 });
    } catch (error) {
      console.error('Auto-save error:', error);
      toast.error('ไม่สามารถบันทึกอัตโนมัติได้');
    }
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
    setIsDirty(true); // Mark as changed
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
    setIsDirty(true); // Mark as changed
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
    if (!surveyStarted) {
      setIsDirty(true); // Mark as changed only if survey not started
    }
  };

  // Auto-save level changes when survey is started
  const handleAutoSaveLevel = async (attrId, levelId, field, value) => {
    if (!surveyStarted) return; // Only auto-save when survey started

    try {
      const updatedAttributes = attributes.map(attr => {
        if (attr.id === attrId) {
          return {
            ...attr,
            levels: attr.levels.map(level =>
              level.id === levelId ? { ...level, [field]: value } : level
            )
          };
        }
        return attr;
      });

      await axios.put(
        `${API}/conjoint/studies/${studyId}/attributes`,
        {
          study_id: studyId,
          attributes: updatedAttributes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('บันทึกอัตโนมัติสำเร็จ', { duration: 2000 });
    } catch (error) {
      console.error('Auto-save error:', error);
      toast.error('ไม่สามารถบันทึกอัตโนมัติได้');
    }
  };

  const handleCopySurveyLink = () => {
    const surveyLink = `${window.location.origin}/survey/conjoint/${studyId}`;
    copyToClipboard(surveyLink, { successMessage: 'คัดลอกลิงก์แล้ว!' });
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
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }}>LOADING…</div>
      </div>
    );
  }

  const recommendedSets = calculateRecommendedSets();

  return (
    <div className="be-root">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                subtitle="CONJOINT ANALYSIS" active="conjoint"
                right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/market-research/conjoint-analysis')}>
                         <Icon name="chevronL" size={10}/>Studies
                       </button>}/>

      <div className="be-conjoint-page" style={{ maxWidth: 1200 }}>
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(`/research/conjoint/${studyId}/qualitative`)}
            className="mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ Phase 1
          </Button>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 mb-2 leading-tight">
            Phase 2: Study Design
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-3 sm:mb-4 break-words">
            {study?.title}
          </p>
          <p className="text-sm sm:text-base text-gray-600">
            แก้ไข Attributes & Levels และสร้าง Choice Sets ด้วย D-Optimal Design
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-6 sm:mb-8 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-4 min-w-max">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm sm:text-base">
                ✓
              </div>
              <span className="font-bold text-green-600 text-xs sm:text-base">Qualitative</span>
            </div>
            <div className="h-1 w-8 sm:w-16 bg-[#00A9CE]"></div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#00A9CE] text-white flex items-center justify-center font-bold text-sm sm:text-base">
                2
              </div>
              <span className="font-bold text-[#00A9CE] text-xs sm:text-base">Design</span>
            </div>
            <div className="h-1 w-8 sm:w-16 bg-gray-300"></div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm sm:text-base">
                3
              </div>
              <span className="text-gray-600 text-xs sm:text-base">Analysis</span>
            </div>
          </div>
        </div>

        {/* Attributes Section */}
        <Card className="p-4 sm:p-6 mb-4 sm:mb-6 bg-white border-2 border-gray-300">
          {/* Survey Started Notice */}
          {surveyStarted && (
            <>
              <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-900 mb-1">
                    📊 สำรวจเริ่มแล้ว - โครงสร้างถูก Lock
                  </p>
                  <p className="text-xs text-blue-700 mb-2">
                    ไม่สามารถเพิ่ม/ลบ Attributes หรือ Levels หรือบันทึกโครงสร้างได้
                  </p>
                  <p className="text-xs text-blue-800 font-semibold">
                    ✓ แก้ไขได้: ชื่อ, คำอธิบาย, รูปภาพ (แก้ไขโดยตรงใน field แล้วกด Enter หรือคลิกที่อื่น)
                  </p>
                </div>
              </div>

              {/* Survey Link */}
              <div className="mb-4 p-3 sm:p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-lg shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-base sm:text-lg">🔗</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-green-900">
                    ลิงก์แบบสอบถาม (พร้อมใช้งาน)
                  </h3>
                </div>
                
                <div className="bg-white rounded-lg p-3 sm:p-4 border border-green-300 mb-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex-1 overflow-hidden min-w-0">
                      <p className="text-xs text-gray-500 mb-1">ลิงก์สำหรับผู้ตอบแบบสอบถาม:</p>
                      <a
                        href={`${window.location.origin}/survey/conjoint/${studyId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-mono text-xs sm:text-sm break-all underline block"
                      >
                        {`${window.location.origin}/survey/conjoint/${studyId}`}
                      </a>
                    </div>
                    <Button
                      onClick={() => {
                        const surveyLink = `${window.location.origin}/survey/conjoint/${studyId}`;
                        copyToClipboard(surveyLink, { successMessage: 'คัดลอกลิงก์แล้ว!' });
                      }}
                      className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white whitespace-nowrap flex-shrink-0 text-sm"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      คัดลอกลิงก์
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-xs text-green-800">
                  <span className="font-bold">💡 คำแนะนำ:</span>
                  <p>แชร์ลิงก์นี้ให้กับผู้ตอบแบบสอบถามผ่าน Email, Line, Facebook หรือช่องทางอื่นๆ</p>
                </div>
              </div>
            </>
          )}

          {/* Unsaved Changes Warning */}
          {isDirty && !surveyStarted && (
            <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-300 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-900 mb-1">
                  ⚠️ มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
                </p>
                <p className="text-xs text-orange-700">
                  กรุณากดปุ่ม "บันทึก Attributes & Levels" ด้านขวาบนก่อนสร้าง D-Optimal Design
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900">
              Attributes & Levels
            </h2>
            <div className="flex gap-2">
              <Button
                onClick={handleAddAttribute}
                variant="outline"
                disabled={surveyStarted}
                className={`border-2 border-[#00A9CE] text-[#005A73] ${surveyStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                เพิ่ม Attribute
              </Button>
              <Button
                onClick={handleSaveAttributes}
                disabled={surveyStarted}
                className={`bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white ${surveyStarted ? 'opacity-50 cursor-not-allowed' : isDirty ? 'animate-pulse ring-4 ring-orange-300' : ''}`}
                title={surveyStarted ? 'ไม่สามารถบันทึกได้เมื่อสำรวจเริ่มแล้ว' : ''}
              >
                <Save className="w-4 h-4 mr-2" />
                บันทึก Attributes & Levels
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
                        onBlur={(e) => handleAutoSaveAttribute(attr.id, 'name', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                        }}
                        placeholder="ชื่อ Attribute (เช่น: ราคา, แบรนด์)"
                        className="w-full p-2 mb-2 border-2 border-gray-300 rounded-lg font-bold text-lg focus:border-[#00A9CE] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={attr.description || ''}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'description', e.target.value)}
                        onBlur={(e) => handleAutoSaveAttribute(attr.id, 'description', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                        }}
                        placeholder="คำอธิบาย (optional)"
                        className="w-full p-2 border-2 border-gray-300 rounded-lg text-sm focus:border-[#00A9CE] focus:outline-none"
                      />
                    </div>
                    <Button
                      onClick={() => handleRemoveAttribute(attr.id)}
                      variant="ghost"
                      size="sm"
                      disabled={surveyStarted}
                      className={`text-red-600 hover:text-red-700 ml-2 ${surveyStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-3 mb-3">
                    {attr.levels.map((level, levelIndex) => (
                      <div key={level.id} className="p-3 bg-white rounded-lg border-2 border-gray-200">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-[#00A9CE] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {levelIndex + 1}
                          </div>
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={level.value}
                              onChange={(e) => handleUpdateLevel(attr.id, level.id, 'value', e.target.value)}
                              onBlur={(e) => handleAutoSaveLevel(attr.id, level.id, 'value', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                }
                              }}
                              placeholder="Level value (เช่น: 10,000 บาท)"
                              className="w-full p-2 border-2 border-gray-300 rounded-lg font-semibold focus:border-[#00A9CE] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={level.description || ''}
                              onChange={(e) => handleUpdateLevel(attr.id, level.id, 'description', e.target.value)}
                              onBlur={(e) => handleAutoSaveLevel(attr.id, level.id, 'description', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                }
                              }}
                              placeholder="คำอธิบาย Level (optional - เช่น: ราคาระดับเริ่มต้น)"
                              className="w-full p-2 border-2 border-gray-200 rounded-lg text-sm text-gray-700 focus:border-[#00A9CE] focus:outline-none"
                            />
                          </div>
                          {attr.levels.length > 2 && (
                            <Button
                              onClick={() => handleRemoveLevel(attr.id, level.id)}
                              variant="ghost"
                              size="sm"
                              disabled={surveyStarted}
                              className={`text-red-600 ${surveyStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleAddLevel(attr.id)}
                    variant="outline"
                    size="sm"
                    disabled={surveyStarted}
                    className={`text-xs ${surveyStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
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

            {/* Warning if unsaved changes */}
            {isDirty && (
              <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm font-bold text-red-900">
                  กรุณาบันทึก Attributes & Levels ก่อนสร้าง Design
                </p>
              </div>
            )}

            <Button
              onClick={handleGenerateDesign}
              disabled={generating || designGenerated || isDirty}
              className={`w-full bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white font-bold ${isDirty ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              ) : isDirty ? (
                <>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  บันทึก Attributes ก่อนสร้าง Design
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  สร้าง D-Optimal Design
                </>
              )}
            </Button>

            {designGenerated && !surveyStarted && (
              <div className="mt-4 space-y-3">
                <div className="text-center">
                  <Button
                    onClick={() => {
                      if (isDirty) {
                        toast.warning('กรุณาบันทึก Attributes & Levels ก่อนสร้าง Design ใหม่');
                        return;
                      }
                      setDesignGenerated(false);
                      handleGenerateDesign();
                    }}
                    variant="outline"
                    className="text-sm"
                    disabled={isDirty}
                  >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    สร้างใหม่
                  </Button>
                </div>

                {/* Start Survey Button */}
                <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                  <p className="text-sm text-green-800 mb-3 font-semibold">
                    🚀 พร้อมเริ่มเก็บข้อมูลแล้ว? กดปุ่มด้านล่างเพื่อเปิดสำรวจ
                  </p>
                  <Button
                    onClick={handleStartSurvey}
                    disabled={startingSurvey}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white font-bold"
                  >
                    {startingSurvey ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        กำลังเริ่มสำรวจ...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        เริ่มสำรวจ
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-green-700 mt-2">
                    หมายเหตุ: หลังเริ่มแล้วจะแก้ไขได้เฉพาะชื่อ คำอธิบาย และรูปภาพเท่านั้น
                  </p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Reference Images Section */}
        {designGenerated && attributes.length > 0 && (
          <ReferenceImagesSection
            studyId={studyId}
            referenceImages={referenceImages}
            token={token}
            onUpdate={setReferenceImages}
          />
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
                        referenceImages={referenceImages}
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
                        referenceImages={referenceImages}
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
