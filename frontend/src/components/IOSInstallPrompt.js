import React from 'react';
import { X, Share } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const IOSInstallPrompt = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center p-4">
      <Card className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-slide-up">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black text-gray-900">
              📱 ติดตั้ง SWUMKT Portal
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <p className="text-gray-700 font-semibold">
              เพื่อใช้งานการแจ้งเตือนบน iPhone/iPad คุณต้องติดตั้งแอปก่อน
            </p>

            {/* Step 1 */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">กดปุ่ม Share</p>
                <div className="flex items-center gap-2">
                  <Share className="w-5 h-5 text-blue-600" />
                  <p className="text-sm text-gray-700">
                    กดที่ไอคอน Share ด้านล่างหน้าจอ
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border-2 border-green-200">
              <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">เลือก "Add to Home Screen"</p>
                <p className="text-sm text-gray-700">
                  เลื่อนหาและกด "เพิ่มที่หน้าจอหัก" หรือ "Add to Home Screen"
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">เปิดจาก Home Screen</p>
                <p className="text-sm text-gray-700">
                  เปิดแอปจากไอคอนที่หน้าจอหลัก จากนั้นเปิดการแจ้งเตือนได้เลย!
                </p>
              </div>
            </div>

            {/* iOS Version Warning */}
            <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-800">
                <span className="font-bold">⚠️ หมายเหตุ:</span> ต้องใช้ iOS 16.4 ขึ้นไป
              </p>
            </div>
          </div>

          {/* Close Button */}
          <Button
            onClick={onClose}
            className="w-full mt-6 bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold"
          >
            เข้าใจแล้ว
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default IOSInstallPrompt;
