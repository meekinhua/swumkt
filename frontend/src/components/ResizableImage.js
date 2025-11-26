import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useRef } from 'react';

const ResizableImageComponent = ({ node, updateAttributes, selected }) => {
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(node.attrs.width || 'auto');
  const imgRef = useRef(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startX.current = e.clientX;
    
    if (imgRef.current) {
      startWidth.current = imgRef.current.offsetWidth;
    }

    const handleMouseMove = (e) => {
      if (!isResizing && imgRef.current) {
        const diff = e.clientX - startX.current;
        let newWidth;
        
        if (direction === 'right' || direction === 'both') {
          newWidth = startWidth.current + diff;
        } else if (direction === 'left') {
          newWidth = startWidth.current - diff;
        }

        if (newWidth >= 100 && newWidth <= 1200) {
          setWidth(newWidth);
          updateAttributes({ width: newWidth });
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleAlignChange = (align) => {
    updateAttributes({ align });
  };

  return (
    <NodeViewWrapper className="resizable-image-wrapper" style={{ textAlign: node.attrs.align || 'center' }}>
      <div 
        className="resizable-image-container"
        style={{ 
          display: 'inline-block',
          position: 'relative',
          width: width === 'auto' ? 'auto' : `${width}px`,
          maxWidth: '100%'
        }}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || ''}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '8px',
            cursor: 'move',
          }}
          draggable={false}
        />
        
        {selected && (
          <>
            {/* Resize handles */}
            <div
              className="resize-handle resize-handle-left"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
              style={{
                position: 'absolute',
                left: '-8px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '60px',
                background: 'linear-gradient(90deg, transparent 0%, #00A9CE 50%, #00A9CE 100%)',
                borderRadius: '8px 0 0 8px',
                cursor: 'ew-resize',
                zIndex: 5,
                opacity: 0.9,
              }}
            />
            <div
              className="resize-handle resize-handle-right"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
              style={{
                position: 'absolute',
                right: '-8px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '60px',
                background: 'linear-gradient(90deg, #00A9CE 0%, #00A9CE 50%, transparent 100%)',
                borderRadius: '0 8px 8px 0',
                cursor: 'ew-resize',
                zIndex: 5,
                opacity: 0.9,
              }}
            />
            
            {/* Alignment controls */}
            <div
              style={{
                position: 'absolute',
                top: '-35px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '4px',
                background: 'white',
                padding: '4px',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10,
              }}
            >
              <button
                onClick={() => handleAlignChange('left')}
                style={{
                  padding: '4px 8px',
                  border: node.attrs.align === 'left' ? '2px solid #00A9CE' : '1px solid #ddd',
                  borderRadius: '4px',
                  background: node.attrs.align === 'left' ? '#e6f7ff' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                title="จัดซ้าย"
              >
                ⬅️
              </button>
              <button
                onClick={() => handleAlignChange('center')}
                style={{
                  padding: '4px 8px',
                  border: node.attrs.align === 'center' ? '2px solid #00A9CE' : '1px solid #ddd',
                  borderRadius: '4px',
                  background: node.attrs.align === 'center' ? '#e6f7ff' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                title="จัดกลาง"
              >
                ↔️
              </button>
              <button
                onClick={() => handleAlignChange('right')}
                style={{
                  padding: '4px 8px',
                  border: node.attrs.align === 'right' ? '2px solid #00A9CE' : '1px solid #ddd',
                  borderRadius: '4px',
                  background: node.attrs.align === 'right' ? '#e6f7ff' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                title="จัดขวา"
              >
                ➡️
              </button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const ResizableImage = Node.create({
  name: 'resizableImage',
  
  group: 'block',
  
  draggable: true,
  
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: 'auto',
      },
      align: {
        default: 'center',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
