"""
NCA (Necessary Condition Analysis) Implementation
"""
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone
from scipy.spatial import ConvexHull
from scipy.stats import spearmanr


def calculate_ceiling_line(X: np.ndarray, Y: np.ndarray, method: str = 'ce_fdh') -> Dict:
    """
    Calculate ceiling line for NCA using CE-FDH or CR-FDH method
    
    Args:
        X: Independent variable (attribute utility)
        Y: Dependent variable (choice probability/preference)
        method: 'ce_fdh' (Ceiling Envelopment - Free Disposal Hull) or 'cr_fdh' (Ceiling Regression)
    
    Returns:
        Dictionary with ceiling line points and effect size
    """
    # Remove invalid points
    valid_mask = ~(np.isnan(X) | np.isnan(Y))
    X_clean = X[valid_mask]
    Y_clean = Y[valid_mask]
    
    if len(X_clean) < 2:
        return {
            'method': method,
            'effect_size': 0.0,
            'ceiling_points': [],
            'error': 'Insufficient data points'
        }
    
    # Normalize to [0, 1] range
    X_min, X_max = X_clean.min(), X_clean.max()
    Y_min, Y_max = Y_clean.min(), Y_clean.max()
    
    if X_max == X_min or Y_max == Y_min:
        return {
            'method': method,
            'effect_size': 0.0,
            'ceiling_points': [],
            'error': 'No variation in data'
        }
    
    X_norm = (X_clean - X_min) / (X_max - X_min)
    Y_norm = (Y_clean - Y_min) / (Y_max - Y_min)
    
    if method == 'ce_fdh':
        ceiling_points, effect_size = _ce_fdh_method(X_norm, Y_norm)
    else:
        ceiling_points, effect_size = _cr_fdh_method(X_norm, Y_norm)
    
    # Denormalize ceiling points
    ceiling_points_denorm = []
    for x, y in ceiling_points:
        x_denorm = x * (X_max - X_min) + X_min
        y_denorm = y * (Y_max - Y_min) + Y_min
        ceiling_points_denorm.append([float(x_denorm), float(y_denorm)])
    
    return {
        'method': method,
        'effect_size': float(effect_size),
        'ceiling_points': ceiling_points_denorm,
        'X_range': [float(X_min), float(X_max)],
        'Y_range': [float(Y_min), float(Y_max)]
    }


def _ce_fdh_method(X: np.ndarray, Y: np.ndarray) -> Tuple[List[Tuple[float, float]], float]:
    """
    Ceiling Envelopment - Free Disposal Hull method
    Creates step-wise ceiling line
    """
    # Sort points by X
    sorted_indices = np.argsort(X)
    X_sorted = X[sorted_indices]
    Y_sorted = Y[sorted_indices]
    
    # Build ceiling line using FDH
    ceiling_points = []
    current_max_y = 0
    
    for i in range(len(X_sorted)):
        if Y_sorted[i] >= current_max_y:
            current_max_y = Y_sorted[i]
            ceiling_points.append((X_sorted[i], Y_sorted[i]))
    
    # Add corner points for proper area calculation
    if ceiling_points:
        if ceiling_points[0][0] > 0:
            ceiling_points.insert(0, (0, ceiling_points[0][1]))
        if ceiling_points[-1][0] < 1:
            ceiling_points.append((1, ceiling_points[-1][1]))
    
    # Calculate effect size (area under ceiling / total area)
    effect_size = _calculate_effect_size(ceiling_points)
    
    return ceiling_points, effect_size


def _cr_fdh_method(X: np.ndarray, Y: np.ndarray) -> Tuple[List[Tuple[float, float]], float]:
    """
    Ceiling Regression - Free Disposal Hull method
    Linear regression through upper boundary points
    """
    # Find upper boundary points using quantile regression approach
    # Take points in upper 90th percentile
    from sklearn.linear_model import LinearRegression
    
    # Identify ceiling points (points that are not dominated)
    ceiling_mask = np.ones(len(X), dtype=bool)
    for i in range(len(X)):
        for j in range(len(X)):
            if i != j:
                if X[j] >= X[i] and Y[j] > Y[i]:
                    ceiling_mask[i] = False
                    break
    
    X_ceiling = X[ceiling_mask]
    Y_ceiling = Y[ceiling_mask]
    
    if len(X_ceiling) < 2:
        # Fallback to CE-FDH
        return _ce_fdh_method(X, Y)
    
    # Fit linear regression to ceiling points
    reg = LinearRegression()
    reg.fit(X_ceiling.reshape(-1, 1), Y_ceiling)
    
    # Create ceiling line from 0 to 1
    X_line = np.array([0, 1])
    Y_line = reg.predict(X_line.reshape(-1, 1))
    
    # Clip to [0, 1] range
    Y_line = np.clip(Y_line, 0, 1)
    
    ceiling_points = [(float(X_line[0]), float(Y_line[0])), (float(X_line[1]), float(Y_line[1]))]
    effect_size = _calculate_effect_size(ceiling_points)
    
    return ceiling_points, effect_size


def _calculate_effect_size(ceiling_points: List[Tuple[float, float]]) -> float:
    """
    Calculate NCA effect size (d) as the area between scope line and ceiling line
    
    In NCA:
    - Scope line = upper boundary (diagonal from (0,0) to (1,1) or actual max boundary)
    - Effect size (d) = Area between ceiling and scope / Total scope area
    - Higher d = stronger necessity condition
    """
    if len(ceiling_points) < 2:
        return 0.0
    
    # Scope line is typically the diagonal (0,0) to (1,1)
    # But we adjust based on actual ceiling to get meaningful values
    
    # Calculate area ABOVE the ceiling line (this is the "empty space" or necessity zone)
    # Area above ceiling = Total area - Area under ceiling
    
    area_under_ceiling = 0.0
    for i in range(len(ceiling_points) - 1):
        x1, y1 = ceiling_points[i]
        x2, y2 = ceiling_points[i + 1]
        width = x2 - x1
        avg_height = (y1 + y2) / 2
        area_under_ceiling += width * avg_height
    
    # Total possible area (scope)
    total_area = 1.0
    
    # Effect size = Area above ceiling / Total area
    # This represents how much of the space is "empty" (necessity constraint)
    effect_size = total_area - area_under_ceiling
    
    # Normalize to [0, 1] range
    effect_size = max(0.0, min(1.0, effect_size))
    
    return effect_size


def interpret_effect_size(effect_size: float) -> Dict[str, str]:
    """
    Interpret NCA effect size according to standard thresholds
    
    Thresholds:
    - 0 < d < 0.1: Small
    - 0.1 <= d < 0.3: Medium
    - 0.3 <= d < 0.5: Large
    - d >= 0.5: Very large
    """
    if effect_size < 0.1:
        level = "ต่ำ (Small)"
        interpretation = "คุณลักษณะนี้มีความจำเป็นน้อยมาก อาจไม่ใช่เงื่อนไขที่จำเป็นสำหรับความสำเร็จ"
        color = "gray"
    elif effect_size < 0.3:
        level = "ปานกลาง (Medium)"
        interpretation = "คุณลักษณะนี้มีความจำเป็นในระดับปานกลาง ควรพิจารณาเป็นปัจจัยสนับสนุน"
        color = "blue"
    elif effect_size < 0.5:
        level = "สูง (Large)"
        interpretation = "คุณลักษณะนี้เป็นเงื่อนไขที่จำเป็นในระดับสูง ผลิตภัณฑ์ควรมีคุณลักษณะนี้"
        color = "orange"
    else:
        level = "สูงมาก (Very Large)"
        interpretation = "คุณลักษณะนี้เป็นเงื่อนไขที่จำเป็นอย่างยิ่ง ขาดไม่ได้สำหรับความสำเร็จ"
        color = "red"
    
    return {
        "level": level,
        "interpretation": interpretation,
        "color": color
    }


def analyze_nca_for_conjoint(
    part_worths: Dict[str, Dict],
    attribute_importance: Dict[str, Dict],
    respondent_count: int
) -> Dict:
    """
    Perform NCA analysis on conjoint data
    
    Args:
        part_worths: Dictionary with structure {attr_id: {"name": str, "levels": {level_id: {"utility": float, ...}}}}
        attribute_importance: Dictionary with structure {attr_id: {"name": str, "importance": float}}
        respondent_count: Number of respondents
    
    Returns:
        NCA results with effect sizes and interpretations for each attribute
    """
    results = {}
    
    for attr_id, attr_data in part_worths.items():
        # Extract levels data
        levels = attr_data.get("levels", {})
        attr_name = attr_data.get("name", attr_id)
        
        if len(levels) < 2:
            continue
        
        # Extract utilities and selection counts from nested structure
        level_utilities = []
        selection_counts = []
        for level_id, level_data in levels.items():
            if isinstance(level_data, dict):
                if "utility" in level_data:
                    level_utilities.append(level_data["utility"])
                    selection_counts.append(level_data.get("selection_count", 0))
            elif isinstance(level_data, (int, float)):
                level_utilities.append(level_data)
                selection_counts.append(0)
        
        if len(level_utilities) < 2:
            continue
        
        # Get attribute importance
        importance_data = attribute_importance.get(attr_id, {})
        if isinstance(importance_data, dict):
            base_importance = importance_data.get("importance", 0)
        else:
            base_importance = importance_data
        
        utilities_array = np.array(level_utilities, dtype=float)
        counts_array = np.array(selection_counts, dtype=float)
        
        # Check if we have variation
        if utilities_array.max() == utilities_array.min():
            continue
        
        # For NCA with Conjoint data:
        # X = Utility (normalized) - represents the "condition" (attribute level quality)
        # Y = Selection probability (normalized) - represents the "outcome" (actual preference)
        
        # Normalize X (utilities) to [0, 1]
        X = (utilities_array - utilities_array.min()) / (utilities_array.max() - utilities_array.min())
        
        # Normalize Y (selection counts) to [0, 1]
        # If no selection counts, use utilities as proxy
        if counts_array.sum() > 0:
            Y = counts_array / counts_array.max()
        else:
            # Fallback: Use utilities weighted by importance
            Y = X.copy()
            if base_importance > 0:
                # Scale by importance (more important attributes have higher Y values)
                Y = Y * (base_importance / 100)
        
        # Add small noise to break ties and avoid perfect diagonal
        np.random.seed(42)  # For reproducibility
        Y = Y + np.random.uniform(0, 0.05, size=Y.shape)
        
        # Calculate NCA with CE-FDH method
        nca_result = calculate_ceiling_line(X, Y, method='ce_fdh')
        
        if 'error' not in nca_result:
            effect_size = nca_result['effect_size']
            interpretation = interpret_effect_size(effect_size)
            
            results[attr_id] = {
                **nca_result,
                **interpretation,
                'attribute_name': attr_name,
                'attribute_importance': base_importance,
                'n_levels': len(levels),
                'levels': {k: v for k, v in levels.items()}  # Preserve level details
            }
    
    # Sort by effect size (descending)
    sorted_results = dict(sorted(results.items(), key=lambda x: x[1]['effect_size'], reverse=True))
    
    return {
        'attributes': sorted_results,
        'respondent_count': respondent_count,
        'method': 'CE-FDH (Ceiling Envelopment - Free Disposal Hull)',
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
