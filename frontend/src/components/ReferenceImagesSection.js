import React, { useState, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Upload, X, Image as ImageIcon, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const ReferenceImagesSection = ({ studyId, referenceImages = [], token, onUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Test section states
  const [testPrompt, setTestPrompt] = useState('');
  const [selectedTestRefs, setSelectedTestRefs] = useState([]);
  const [generatingTest, setGeneratingTest] = useState(false);
  const [generatedTestImage, setGeneratedTestImage] = useState(null);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    console.log('Files selected:', files.length);
    
    // Validate total count
    const currentCount = referenceImages.length;
    const newCount = currentCount + files.length;
    
    if (newCount > 5) {
      toast.error(`สามารถเพิ่มได้สูงสุด 5 รูป (ปัจจุบันมี ${currentCount} รูป)`);
      return;
    }

    setUploading(true);

    try {
      const imageUrls = [];

      // Convert files to base64
      for (const file of files) {
        console.log('Processing file:', file.name, file.type);
        
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} ไม่ใช่ไฟล์รูปภาพ`);
          continue;
        }

        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => {
            console.error('FileReader error:', error);
            reject(error);
          };
          reader.readAsDataURL(file);
        });

        console.log('Base64 length:', base64.length);
        imageUrls.push(base64);
      }

      if (imageUrls.length === 0) {
        toast.warning('ไม่มีไฟล์รูปภาพที่ถูกต้อง');
        setUploading(false);
        return;
      }

      console.log('Uploading', imageUrls.length, 'images to backend');

      // Upload to backend (will compress)
      const allImages = [...referenceImages, ...imageUrls];
      
      const uploadUrl = `${API}/api/conjoint/studies/${studyId}/reference-images`;
      console.log('Upload URL:', uploadUrl);
      console.log('API base:', API);
      console.log('Study ID:', studyId);
      
      const response = await axios.post(
        uploadUrl,
        { image_urls: allImages },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Upload response:', response.data);
      toast.success(`อัปโหลด ${imageUrls.length} รูปสำเร็จ`);
      onUpdate(response.data.reference_images);
    } catch (error) {
      console.error('Upload error:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.response?.data?.detail || error.message || 'ไม่สามารถอัปโหลดรูปได้');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (index) => {
    try {
      const response = await axios.delete(
        `${API}/api/conjoint/studies/${studyId}/reference-images/${index}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('ลบรูป reference สำเร็จ');
      
      // Update local state
      const newImages = referenceImages.filter((_, i) => i !== index);
      onUpdate(newImages);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('ไม่สามารถลบรูปได้');
    }
  };

  const toggleTestRefSelection = (index) => {
    setSelectedTestRefs(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleTestGeneration = async () => {
    if (!testPrompt.trim()) {
      toast.error('กรุณากรอก prompt');
      return;
    }

    setGeneratingTest(true);
    setGeneratedTestImage(null);

    try {
      const payload = {
        attribute_id: 'test',
        level_id: 'test'
      };

      // Add reference images if selected
      if (selectedTestRefs.length > 0) {
        payload.reference_image_indices = selectedTestRefs;
      }

      // Override with custom prompt
      payload.prompt = testPrompt;

      const response = await axios.post(
        `${API}/api/conjoint/studies/${studyId}/generate-single-image`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.image_url) {
        setGeneratedTestImage(response.data.image_url);
        const msg = selectedTestRefs.length > 0 
          ? `✅ สร้างรูปสำเร็จ! (ใช้ ${selectedTestRefs.length} รูปอ้างอิง)`
          : '✅ สร้างรูปสำเร็จ!';
        toast.success(msg);
      }
    } catch (error) {
      console.error('Test generation error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างรูปได้');
    } finally {
      setGeneratingTest(false);
    }
  };

  return (
    <div className="mb-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-indigo-900">
              Reference Images (รูปอ้างอิง)
            </h3>
            <p className="text-xs text-indigo-600">
              อัปโหลดรูปเพื่อใช้เป็น reference ในการสร้างรูป AI (สูงสุด 5 รูป)
            </p>
          </div>
        </div>
        
        <div className="text-sm font-semibold text-indigo-700">
          {referenceImages.length} / 5 รูป
        </div>
      </div>

      {/* Info Box */}
      <div className="mb-4 p-3 bg-white rounded-lg border border-indigo-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-800">
            <p className="font-semibold mb-1">💡 วิธีใช้งาน:</p>
            <ul className="list-disc list-inside space-y-1 text-indigo-700">
              <li>อัปโหลดรูปที่ต้องการให้ AI ใช้เป็นแนวทาง (สไตล์, สี, องค์ประกอบ)</li>
              <li>AI จะใช้รูปเหล่านี้เป็น reference ในการสร้างรูป Level และ Profile</li>
              <li>รูปจะถูก compress อัตโนมัติเป็น 640px และ ~150KB</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Images Grid */}
      {referenceImages.length > 0 && (
        <div className="mb-4 grid grid-cols-5 gap-3">
          {referenceImages.map((imgUrl, index) => (
            <div key={index} className="relative group">
              <img
                src={imgUrl}
                alt={`Reference ${index + 1}`}
                className="w-full aspect-square object-cover rounded-lg border-2 border-indigo-300 shadow-sm"
              />
              <button
                onClick={() => handleDelete(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                #{index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {referenceImages.length < 5 && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || referenceImages.length >= 5}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                กำลังอัปโหลด...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                อัปโหลดรูป Reference (เลือกได้หลายรูป)
              </>
            )}
          </Button>
          <p className="text-xs text-indigo-600 text-center mt-2">
            รองรับ JPG, PNG, WebP (จะถูก compress อัตโนมัติ)
          </p>
        </div>
      )}
    </div>
  );
};

export default ReferenceImagesSection;
