"""
Image utilities for compression and processing
"""
import base64
import io
from PIL import Image


def compress_base64_image(base64_string: str, max_size_kb: int = 500, quality: int = 85) -> str:
    """
    Compress a base64 image to reduce file size
    
    Args:
        base64_string: Base64 encoded image (with or without data URL prefix)
        max_size_kb: Maximum file size in KB (default: 500KB)
        quality: JPEG quality 1-100 (default: 85)
    
    Returns:
        Compressed base64 string with data URL prefix
    """
    try:
        # Remove data URL prefix if present
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 to bytes
        image_data = base64.b64decode(base64_string)
        
        # Open image with PIL
        img = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        
        # Compress iteratively until under max size
        output = io.BytesIO()
        current_quality = quality
        
        while current_quality > 20:
            output.seek(0)
            output.truncate()
            
            # Save as JPEG with current quality
            img.save(output, format='JPEG', quality=current_quality, optimize=True)
            
            # Check size
            size_kb = len(output.getvalue()) / 1024
            
            if size_kb <= max_size_kb:
                break
            
            # Reduce quality for next iteration
            current_quality -= 10
        
        # If still too large, resize image
        if len(output.getvalue()) / 1024 > max_size_kb:
            # Calculate new dimensions (reduce by 20%)
            new_width = int(img.width * 0.8)
            new_height = int(img.height * 0.8)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            output.seek(0)
            output.truncate()
            img.save(output, format='JPEG', quality=75, optimize=True)
        
        # Encode back to base64
        compressed_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        
        # Return with data URL prefix
        return f"data:image/jpeg;base64,{compressed_base64}"
        
    except Exception as e:
        print(f"Image compression error: {str(e)}")
        # Return original if compression fails
        if not base64_string.startswith('data:image'):
            return f"data:image/png;base64,{base64_string}"
        return base64_string


def get_image_size_kb(base64_string: str) -> float:
    """Get size of base64 image in KB"""
    try:
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        return len(image_data) / 1024
    except:
        return 0.0
