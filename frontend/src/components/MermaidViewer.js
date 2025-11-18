import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import mermaid from 'mermaid';

const MermaidViewer = ({ code }) => {
  const { t } = useTranslation();
  const mermaidRef = useRef(null);
  const containerRef = useRef(null);
  const fullscreenRef = useRef(null);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpandedModal, setIsExpandedModal] = useState(false);
  
  // Detect if running as standalone PWA (iOS home screen app)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone || 
                       document.referrer.includes('android-app://');

  useEffect(() => {
    // Initialize Mermaid
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif'
    });
  }, []);

  useEffect(() => {
    if (code && mermaidRef.current) {
      const renderDiagram = async () => {
        try {
          mermaidRef.current.innerHTML = '';
          const id = `mermaid-${Date.now()}`;
          const { svg } = await mermaid.render(id, code);
          mermaidRef.current.innerHTML = svg;
        } catch (error) {
          console.error('Mermaid rendering error:', error);
          mermaidRef.current.innerHTML = '<p class="text-red-500">Error rendering diagram</p>';
        }
      };
      renderDiagram();
    }
  }, [code]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(0.3, prev + delta), 3));
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.3));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFullscreen = () => {
    // If standalone PWA (iOS), use modal instead
    if (isStandalone) {
      setIsExpandedModal(!isExpandedModal);
      if (!isExpandedModal) {
        // Reset zoom and pan when opening modal
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }
    
    const elem = fullscreenRef.current;
    
    // Check if already in fullscreen
    const isCurrentlyFullscreen = 
      document.fullscreenElement || 
      document.webkitFullscreenElement || 
      document.mozFullScreenElement || 
      document.msFullscreenElement;

    if (!isCurrentlyFullscreen && elem) {
      // Enter fullscreen with vendor prefixes
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen(); // Safari
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen(); // Firefox
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen(); // IE/Edge
      }
      setIsFullscreen(true);
    } else {
      // Exit fullscreen with vendor prefixes
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen(); // Safari
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen(); // Firefox
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen(); // IE/Edge
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement
      );
      setIsFullscreen(isFullscreen);
    };
    
    // Add event listeners for all vendor prefixes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  if (!code) {
    return null;
  }

  return (
    <>
      {/* Expanded Modal for PWA (iOS standalone) */}
      {isExpandedModal && isStandalone && (
        <div 
          className="fixed inset-0 z-[9999] bg-white"
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden'
          }}
        >
          {/* Header with controls */}
          <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
            <h3 className="text-lg font-black text-gray-900">Customer Journey Diagram</h3>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleZoomIn}
                variant="outline"
                size="sm"
                className="border-2 border-gray-300 p-2"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleZoomOut}
                variant="outline"
                size="sm"
                className="border-2 border-gray-300 p-2"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleResetZoom}
                variant="outline"
                size="sm"
                className="border-2 border-gray-300 p-2"
              >
                <Maximize className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setIsExpandedModal(false)}
                variant="outline"
                size="sm"
                className="border-2 border-[#E63946] text-[#E63946] p-2"
              >
                ✕
              </Button>
            </div>
          </div>

          {/* Diagram container */}
          <div 
            ref={containerRef}
            className="absolute inset-0 pt-20 overflow-hidden bg-white"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              setIsDragging(true);
              setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
            }}
            onTouchMove={(e) => {
              if (isDragging && e.touches[0]) {
                const touch = e.touches[0];
                setPan({
                  x: touch.clientX - dragStart.x,
                  y: touch.clientY - dragStart.y
                });
              }
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <div className="absolute top-24 left-4 text-xs text-gray-500 font-semibold z-10 bg-white/90 px-2 py-1 rounded">
              💡 ลากเพื่อเลื่อน, Pinch เพื่อซูม
            </div>
            <div 
              ref={mermaidRef} 
              className="w-full h-full flex justify-center items-center"
              style={{ 
                cursor: isDragging ? 'grabbing' : 'grab',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out'
              }}
            ></div>
          </div>
        </div>
      )}

      <div className="my-6">
        <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-black text-gray-900">Customer Journey Diagram</h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleZoomIn}
            variant="outline"
            size="sm"
            className="border-2 border-gray-300 p-2"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleZoomOut}
            variant="outline"
            size="sm"
            className="border-2 border-gray-300 p-2"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleResetZoom}
            variant="outline"
            size="sm"
            className="border-2 border-gray-300 p-2"
            title="Reset zoom"
          >
            <Maximize className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleFullscreen}
            variant="outline"
            size="sm"
            className="border-2 border-[#00A9CE] text-[#00A9CE] p-2"
            title={isStandalone ? 'Expand' : 'Fullscreen'}
          >
            {isStandalone ? (isExpandedModal ? '✕' : '⛶') : (isFullscreen ? '✕' : '⛶')}
          </Button>
        </div>
      </div>

      <div 
        ref={fullscreenRef}
        className="bg-white rounded-lg border-2 border-gray-200"
      >
        <div 
          ref={containerRef}
          className="p-4 relative overflow-hidden" 
          style={{ minHeight: '500px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="absolute top-2 left-2 text-xs text-gray-500 font-semibold z-10 bg-white/90 px-2 py-1 rounded">
            💡 ลากเพื่อเลื่อน, Scroll เพื่อซูม
          </div>
          <div 
            ref={mermaidRef} 
            className="w-full h-full flex justify-center items-center"
            style={{ 
              cursor: isDragging ? 'grabbing' : 'grab', 
              minHeight: '500px',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out'
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default MermaidViewer;
