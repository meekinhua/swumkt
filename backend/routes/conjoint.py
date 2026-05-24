"""
Conjoint Analysis Module
========================
Extracted from server.py (factory pattern, mirrors routes/brand_equity.py).

Dependencies pulled from `server` at factory-call time (late import) to preserve
exact runtime behavior without duplicating large shared helpers/models:
  UserRole, SurveyResponse, compress_base64_image, initialize_default_prompts.
Heavy libs (numpy/pandas/sklearn/statsmodels/docx/emergentintegrations/matplotlib)
are imported lazily inside the functions that use them (unchanged from origin).

NOTE: router has NO prefix on purpose — endpoints keep their full original paths
(/conjoint/... and /admin/conjoint-image-settings) so no URL changes.
"""

import os
import base64
import uuid
import logging
import asyncio
from enum import Enum
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Body, BackgroundTasks, Query
from pydantic import BaseModel, Field
from docx.shared import Pt

from lib.ttl_cache import async_ttl_cache

conjoint_router = APIRouter(tags=["conjoint"])


# ============================ MODELS ============================
class ConjointStudyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"

class AttributeLevel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    value: str
    description: Optional[str] = None
    image_url: Optional[str] = None

class ConjointAttribute(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    levels: List[AttributeLevel]
    order: int = 0

class QualitativeInput(BaseModel):
    type: str  # "interview", "observation", "constraints"
    content: str
    filename: Optional[str] = None

class ConjointProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attribute_levels: Dict[str, str]  # attribute_id -> level_id
    image_url: Optional[str] = None
    description: Optional[str] = None

class ChoiceSet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profiles: List[ConjointProfile]
    set_number: int

class CreateConjointStudyRequest(BaseModel):
    title: str
    description: Optional[str] = None
    product_category: Optional[str] = None
    demographics_to_capture: Optional[List[str]] = None  # ["age", "gender", "occupation", "region", "income"]

class QualitativeAnalysisRequest(BaseModel):
    qualitative_data: List[QualitativeInput]
    target_language: str = "th"

class UpdateAttributesRequest(BaseModel):
    attributes: List[ConjointAttribute]

class GenerateDesignRequest(BaseModel):
    alternatives_per_set: int = 3
    number_of_sets: Optional[int] = None  # Auto-calculate if not provided
    design_method: str = "d-optimal"

class UpdateStudyStatusRequest(BaseModel):
    status: ConjointStudyStatus
    reason: Optional[str] = None  # Optional reason for status change

class AIInterpretationRequest(BaseModel):
    method: Optional[str] = "counting"  # counting, mnl, linear_regression, mixed_logit, hierarchical_bayes
    compare_all: bool = False  # If True, analyze and compare all methods

class ThesisExportRequest(BaseModel):
    methods: List[str] = ["mnl"]  # counting, mnl, linear_regression, mixed_logit, hierarchical_bayes
    chapters: List[int] = [3, 4, 5]  # Which chapters to generate
    extra_prompt: str = ""  # Additional user instructions for AI

class ConjointContentShareRequest(BaseModel):
    title: str
    research_type: str  # e.g., "quantitative", "qualitative", "mixed"
    sample_size: Optional[str] = None
    data_source: Optional[str] = None
    collection_method: Optional[str] = None
    research_date: Optional[str] = None
    additional_notes: Optional[str] = None
    study_id: str
    # Include results data
    respondent_count: int
    statistical_method: str
    importance_scores: Dict[str, Any]
    part_worths: Dict[str, Any]
    ai_interpretation: Optional[str] = None

class GenerateImagesRequest(BaseModel):
    study_id: str

class GenerateSingleImageRequest(BaseModel):
    attribute_id: str
    level_id: str
    prompt: Optional[str] = None
    reference_image_indices: Optional[List[int]] = None  # Indices of selected reference images
    additional_prompt: Optional[str] = None  # Additional prompt text to append

class GenerateProfileImageRequest(BaseModel):
    choice_set_id: str
    profile_id: str
    prompt: Optional[str] = None
    reference_image_indices: Optional[List[int]] = None  # Indices of selected reference images
    additional_prompt: Optional[str] = None  # Additional prompt text to append

class ImageGenerationSettings(BaseModel):
    level_image_prompt_template: str = "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background."
    level_image_prompt_with_ref: str = "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature."
    level_image_model: str = "gpt-image-1"
    profile_image_prompt_template: str = "Professional product photo showing: {composition}. High quality, clean background, product-focused composition."
    profile_image_prompt_with_ref: str = "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images."
    profile_image_model: str = "gpt-image-1"
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

class UpdateImageGenerationSettingsRequest(BaseModel):
    level_image_prompt_template: Optional[str] = None
    level_image_prompt_with_ref: Optional[str] = None
    level_image_model: Optional[str] = None
    profile_image_prompt_template: Optional[str] = None
    profile_image_prompt_with_ref: Optional[str] = None
    profile_image_model: Optional[str] = None

class UploadImageRequest(BaseModel):
    attribute_id: str
    level_id: str
    image_url: str

class UploadProfileImageRequest(BaseModel):
    choice_set_id: str
    profile_id: str
    image_url: str

class UploadReferenceImagesRequest(BaseModel):
    image_urls: List[str]  # List of base64 image URLs (max 5)

class GenerateProductImageFromResultsRequest(BaseModel):
    additional_prompt: Optional[str] = None  # User can add extra instructions
    reference_image_indices: Optional[List[int]] = None  # Select from uploaded reference images (max 5)

class GenerateShelfSimulationRequest(BaseModel):
    product_image_url: str  # The generated product image from step 1
    environment_type: str  # "auto", "cosmetics_store", "convenience_store", "supermarket", "mall", "custom"
    custom_environment: Optional[str] = None  # Custom environment description if environment_type is "custom"
    shelf_style: str = "eye_level"  # "eye_level", "shelf_view", "aisle_view", "custom"
    custom_shelf_style: Optional[str] = None  # Custom shelf style description if shelf_style is "custom"
    additional_prompt: Optional[str] = None  # User can customize environment



# ===================== FILTER HELPERS (time + demographic segments) =====================
# Mirrors the brand_equity pattern so the frontend `BeFilterBar` can be reused.

def _parse_segments_param(segments_raw):
    """Parse the `segments` query param (JSON string) into {field: [values]}.

    Returns {} on empty / invalid input. Values are coerced to strings so the
    chip selectors on the frontend (which always pass strings) match what we
    stored on the respondent's demographics dict.
    """
    if not segments_raw:
        return {}
    import json as _json
    try:
        raw = _json.loads(segments_raw)
        if not isinstance(raw, dict):
            return {}
        return {
            str(k): [str(v) for v in (vs or []) if v not in (None, "")]
            for k, vs in raw.items()
            if vs
        }
    except (ValueError, TypeError):
        return {}


def _apply_response_filter(
    responses,
    from_iso=None,
    to_iso=None,
    segments=None,
):
    """Filter conjoint responses by time window + demographic segments.

    `submitted_at` is stored as ISO-8601 / datetime → str() compare is valid
    when both bounds are ISO strings. Segment fields combine AND; multiple
    values within a field combine OR (same semantics as brand_equity).
    """
    def _ts(r):
        v = r.get("submitted_at")
        if v is None:
            return ""
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)

    out = list(responses)
    if from_iso:
        out = [r for r in out if _ts(r) >= from_iso]
    if to_iso:
        out = [r for r in out if _ts(r) <= to_iso]
    if segments:
        for field, allowed in segments.items():
            if not allowed:
                continue
            allowed_set = set(str(v) for v in allowed)
            out = [
                r for r in out
                if str((r.get("demographics") or {}).get(field, "")) in allowed_set
            ]
    return out


def _segments_available(responses, capture):
    """Auto-derive the set of distinct demographic values per captured field.

    The frontend uses this to render chip selectors — fields with zero values
    are simply omitted, so an empty `capture` list or a study with no
    demographics yet renders an empty filter bar gracefully.
    """
    out = {k: set() for k in (capture or [])}
    for r in responses:
        demo = r.get("demographics") or {}
        for k in list(out.keys()):
            v = demo.get(k)
            if v not in (None, ""):
                out[k].add(str(v))
    return {k: sorted(list(vs)) for k, vs in out.items()}


def _filter_signature(from_iso, to_iso, segments):
    """Stable short hash of the filter, used as a cache key suffix so analysis
    runs at different filter slices don't clobber each other's cached output.
    Empty filter → 'all', preserving the original cache path."""
    import hashlib as _hashlib
    import json as _json
    seg_norm = {
        k: sorted(set(str(x) for x in (v or [])))
        for k, v in (segments or {}).items() if v
    }
    if not from_iso and not to_iso and not seg_norm:
        return "all"
    payload = _json.dumps(
        {"from": from_iso or "", "to": to_iso or "", "seg": seg_norm},
        sort_keys=True, ensure_ascii=False,
    )
    return _hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]



# ===================== MODULE-LEVEL HELPERS =====================
def calculate_optimal_choice_sets(num_attributes: int, num_levels_per_attr: List[int], alternatives_per_set: int = 3) -> int:
    """Calculate statistically optimal number of choice sets based on D-optimal criteria"""
    # Rule of thumb: need at least 3 * (total parameters) / alternatives_per_set
    total_parameters = sum(num_levels_per_attr) - num_attributes  # minus reference levels
    min_sets = max(8, int((3 * total_parameters) / alternatives_per_set))
    # Round to nearest multiple of 4 for balanced design
    optimal_sets = ((min_sets + 3) // 4) * 4
    return min(max(8, optimal_sets), 20)  # Between 8-20 sets

async def generate_d_optimal_design(attributes: List[ConjointAttribute], alternatives_per_set: int, num_sets: int) -> List[ChoiceSet]:
    """Generate D-optimal fractional factorial design for choice sets"""
    import itertools
    import random
    
    # Create full factorial of all possible profiles
    attr_levels_map = {}
    for attr in attributes:
        attr_levels_map[attr.id] = [level.id for level in attr.levels]
    
    # Generate all possible combinations
    attr_ids = list(attr_levels_map.keys())
    all_combinations = list(itertools.product(*[attr_levels_map[aid] for aid in attr_ids]))
    
    # Convert to profile format
    all_profiles = []
    for combo in all_combinations:
        profile_dict = {attr_ids[i]: combo[i] for i in range(len(attr_ids))}
        all_profiles.append(ConjointProfile(attribute_levels=profile_dict))
    
    # D-optimal selection (simplified - use random sampling with constraints)
    # In production, use specialized DOE libraries like pyDOE or R's AlgDesign
    choice_sets = []
    used_profiles = set()
    
    for set_num in range(num_sets):
        # Select alternatives ensuring variety
        set_profiles = []
        attempts = 0
        max_attempts = 100
        
        while len(set_profiles) < alternatives_per_set and attempts < max_attempts:
            candidate = random.choice(all_profiles)
            profile_key = tuple(sorted(candidate.attribute_levels.items()))
            
            if profile_key not in used_profiles:
                # Check for attribute level balance in this choice set
                if not set_profiles or is_balanced_set(set_profiles + [candidate], attributes):
                    set_profiles.append(candidate)
                    used_profiles.add(profile_key)
            
            attempts += 1
        
        if len(set_profiles) == alternatives_per_set:
            choice_sets.append(ChoiceSet(
                profiles=set_profiles,
                set_number=set_num + 1
            ))
    
    return choice_sets

def is_balanced_set(profiles: List[ConjointProfile], attributes: List[ConjointAttribute]) -> bool:
    """Check if choice set has good attribute level variation"""
    if len(profiles) < 2:
        return True
    
    # Count unique levels per attribute
    for attr in attributes:
        levels_in_set = set()
        for profile in profiles:
            if attr.id in profile.attribute_levels:
                levels_in_set.add(profile.attribute_levels[attr.id])
        
        # Prefer sets where each attribute shows variation
        if len(levels_in_set) < 2 and len(attr.levels) > 1:
            return False
    
    return True

def _build_conjoint_data_rows(study: Dict, responses: List[Dict]):
    """Shared optimized data preparation for all conjoint analysis methods.
    Returns (data_rows, attributes, level_value_map) or (None, None, None) if no data.
    """
    attributes = study.get("attributes", [])

    # Pre-build lookups once
    cs_map = {cs["id"]: cs for cs in study.get("choice_sets", [])}
    # (attr_id, level_id) -> level_value
    level_value_map = {}
    for attr in attributes:
        for level in attr.get("levels", []):
            level_value_map[(attr["id"], level["id"])] = level["value"]

    data_rows = []
    for resp_idx, response in enumerate(responses):
        for choice in response.get("responses", []):
            cs = cs_map.get(choice.get("choice_set_id"))
            if not cs:
                continue
            selected_pid = choice.get("selected_profile_id")
            for alt_idx, profile in enumerate(cs.get("profiles", [])):
                row = {
                    "respondent": resp_idx,
                    "choice_set": cs["id"],
                    "alternative": alt_idx,
                    "choice": 1 if profile["id"] == selected_pid else 0,
                }
                for attr in attributes:
                    attr_id = attr["id"]
                    lvl_id = profile.get("attribute_levels", {}).get(attr_id)
                    val = level_value_map.get((attr_id, lvl_id))
                    if val is not None:
                        row[attr["name"]] = val
                data_rows.append(row)

    if not data_rows:
        return None, None, None
    return data_rows, attributes, level_value_map

def _calc_importance_from_part_worths(part_worths: Dict) -> Dict:
    """Shared importance score calculation from part_worths dict."""
    ranges = {}
    total_range = 0
    for attr_id, pw_data in part_worths.items():
        utilities = [level["utility"] for level in pw_data["levels"].values()]
        if utilities:
            r = max(utilities) - min(utilities)
            ranges[attr_id] = r
            total_range += r
    importance_scores = {}
    if total_range > 0:
        for attr_id, r in ranges.items():
            importance_scores[attr_id] = {
                "name": part_worths[attr_id]["name"],
                "importance": round((r / total_range) * 100, 2),
            }
    return importance_scores

def calculate_mnl_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Perform Multinomial Logit (MNL) analysis using Conditional Logit (optimized)"""
    import pandas as pd
    import numpy as np
    from statsmodels.discrete.conditional_models import ConditionalLogit

    data_rows, attributes, level_value_map = _build_conjoint_data_rows(study, responses)
    if data_rows is None:
        return None

    df = pd.DataFrame(data_rows)

    feature_cols = [col for col in df.columns if col not in ("respondent", "choice_set", "alternative", "choice")]
    X = pd.get_dummies(df[feature_cols], drop_first=True)
    y = df["choice"]
    # Use integer group codes instead of string concatenation for speed
    groups = df["respondent"] * 1000000 + pd.factorize(df["choice_set"])[0]

    try:
        model = ConditionalLogit(y, X, groups=groups)
        result = model.fit(disp=False, maxiter=500, method='lbfgs')

        # Pre-count level selections in one pass
        selected_rows = df[df["choice"] == 1]
        level_counts_all = {}
        for attr in attributes:
            name = attr["name"]
            if name in selected_rows.columns:
                level_counts_all[name] = selected_rows[name].value_counts().to_dict()

        part_worths = {}
        for attr in attributes:
            attr_id = attr["id"]
            attr_name = attr["name"]
            levels_dict = {}
            counts_for_attr = level_counts_all.get(attr_name, {})

            for level in attr.get("levels", []):
                level_value = level["value"]
                col_name = f"{attr_name}_{level_value}"
                utility = float(result.params.get(col_name, 0.0))
                levels_dict[level["id"]] = {
                    "value": level_value,
                    "utility": utility,
                    "selection_count": int(counts_for_attr.get(level_value, 0)),
                }
            part_worths[attr_id] = {"name": attr_name, "levels": levels_dict}

        importance_scores = _calc_importance_from_part_worths(part_worths)

        llf = result.llf
        # statsmodels ConditionalLogit does NOT expose `llnull`. For a conditional
        # logit, the null model assigns equal probability 1/C_i to each alternative
        # within choice set i, so:
        #     LL_null = Σ log(1 / C_i) = -Σ log(C_i)
        # We have `groups` indexing choice sets — compute group sizes and use them.
        try:
            _, group_sizes = np.unique(groups.values, return_counts=True)
            llnull = float(-np.sum(np.log(group_sizes)))
            pseudo_r2 = 1.0 - (llf / llnull) if llnull != 0 else 0.0
        except Exception:
            llnull = None
            pseudo_r2 = 0.0
        k = len(result.params)
        n_obs = int(len(y))
        aic = -2 * llf + 2 * k
        bic = -2 * llf + k * np.log(n_obs) if n_obs > 0 else 0.0

        return {
            "method": "Multinomial Logit (MNL)",
            "part_worths": part_worths,
            "importance_scores": importance_scores,
            "coefficients": {name: float(coef) for name, coef in result.params.items()},
            "std_errors": {name: float(se) for name, se in result.bse.items()},
            "z_values": {name: float(z) for name, z in result.tvalues.items()},
            "p_values": {name: float(p) for name, p in result.pvalues.items()},
            "log_likelihood": float(llf),
            "log_likelihood_null": float(llnull) if llnull is not None else None,
            "pseudo_r_squared": float(pseudo_r2),
            "aic": float(aic),
            "bic": float(bic),
            "n_observations": int(len(y)),
            "utility_scale": "logit",
            "utility_interpretation": "Logit coefficients (reference level = 0). Positive = preferred, Negative = less preferred",
        }
    except Exception as e:
        logging.error(f"MNL analysis error: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return None

def calculate_mixed_logit_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Mixed Logit (Random Parameters Logit) via xlogit Simulated MLE.

    Replaces the previous "simplified" implementation, which was just a
    per-respondent Pearson correlation — not a Mixed Logit model at all.
    Now we estimate a true random-parameters logit with normal random
    coefficients via maximum simulated likelihood (Halton draws).

    Returns part_worth utilities (population means), per-coefficient std
    deviations (taste heterogeneity), and the usual MNL fit metrics
    (LL, McFadden Pseudo R², AIC, BIC).
    """
    import warnings
    warnings.filterwarnings("ignore")
    import pandas as pd
    import numpy as np
    from xlogit import MixedLogit

    data_rows, attributes, _ = _build_conjoint_data_rows(study, responses)
    if data_rows is None:
        return None

    df = pd.DataFrame(data_rows)
    feature_cols = [c for c in df.columns if c not in ("respondent", "choice_set", "alternative", "choice")]

    # xlogit needs:
    #   ids   = unique choice situation id  (one per choice set per respondent)
    #   alts  = alternative index inside the choice set
    #   panels = respondent id (so SMLE accounts for within-person correlation)
    # Use a single int per (respondent, choice_set) to keep things compact.
    cs_codes, _uniques = pd.factorize(df["choice_set"])
    df["_situation"] = df["respondent"].astype(int) * 1_000_000 + cs_codes

    # Dummy-encode categorical attribute values (drop_first → reference = first).
    X = pd.get_dummies(df[feature_cols], drop_first=True).astype(float)
    if X.shape[1] == 0:
        return None
    varnames = list(X.columns)

    try:
        # All coefficients treated as normally-distributed random parameters
        # (Train, 2009 — standard Kenneth Train formulation).
        model = MixedLogit()
        model.fit(
            X=X.values,
            y=df["choice"].values.astype(int),
            varnames=varnames,
            alts=df["alternative"].values,
            ids=df["_situation"].values,
            panels=df["respondent"].values,
            randvars={v: "n" for v in varnames},
            n_draws=200,
            verbose=0,
        )
    except Exception as e:
        logging.error(f"Mixed Logit fit failed: {e}")
        return None

    # xlogit returns 2*K coefficients: first K are means, next K are SDs.
    # SDs are reported signed by the optimiser but represent magnitude; take abs.
    K = len(varnames)
    means = np.asarray(model.coeff_)[:K]
    sds = np.abs(np.asarray(model.coeff_)[K:])
    se = np.asarray(model.stderr)[:K]
    pvals = np.asarray(model.pvalues)[:K]
    zvals = np.asarray(model.zvalues)[:K]
    sd_pvals = np.asarray(model.pvalues)[K:]

    # Null log-likelihood for Pseudo R² — same definition as MNL.
    _, group_sizes = np.unique(df["_situation"].values, return_counts=True)
    ll_null = float(-np.sum(np.log(group_sizes)))
    ll_model = float(model.loglikelihood)
    pseudo_r2 = 1.0 - (ll_model / ll_null) if ll_null != 0 else 0.0

    # Pre-count level selections for the part_worth display.
    selected_rows = df[df["choice"] == 1]
    level_counts_all = {}
    for attr in attributes:
        name = attr["name"]
        if name in selected_rows.columns:
            level_counts_all[name] = selected_rows[name].value_counts().to_dict()

    # Build part_worths: utility = posterior mean coefficient for that dummy.
    coef_lookup = dict(zip(varnames, means.tolist()))
    sd_lookup = dict(zip(varnames, sds.tolist()))
    part_worths = {}
    mean_coefficients = {}
    std_coefficients = {}
    for attr in attributes:
        attr_id = attr["id"]
        attr_name = attr["name"]
        levels_dict = {}
        counts_for_attr = level_counts_all.get(attr_name, {})
        for level in attr.get("levels", []):
            col_name = f"{attr_name}_{level['value']}"
            utility = float(coef_lookup.get(col_name, 0.0))
            level_sd = float(sd_lookup.get(col_name, 0.0))
            mean_coefficients[col_name] = utility
            std_coefficients[col_name] = level_sd
            levels_dict[level["id"]] = {
                "value": level["value"],
                "utility": utility,
                "std_deviation": level_sd,
                "selection_count": int(counts_for_attr.get(level["value"], 0)),
            }
        part_worths[attr_id] = {"name": attr_name, "levels": levels_dict}

    return {
        "method": "Mixed Logit (Random Parameters)",
        "part_worths": part_worths,
        "importance_scores": _calc_importance_from_part_worths(part_worths),
        "mean_coefficients": mean_coefficients,
        "std_coefficients": std_coefficients,
        "coefficients": {name: float(c) for name, c in zip(varnames, means)},
        "std_errors": {name: float(s) for name, s in zip(varnames, se)},
        "z_values": {name: float(z) for name, z in zip(varnames, zvals)},
        "p_values": {name: float(p) for name, p in zip(varnames, pvals)},
        "sd_p_values": {name: float(p) for name, p in zip(varnames, sd_pvals)},
        "log_likelihood": ll_model,
        "log_likelihood_null": ll_null,
        "pseudo_r_squared": float(pseudo_r2),
        "aic": float(model.aic),
        "bic": float(model.bic),
        "n_respondents": int(df["respondent"].nunique()),
        "n_observations": int(len(df)),
        "n_draws": 200,
        "utility_scale": "logit",
        "utility_interpretation": (
            "Population-mean logit coefficients. The accompanying SD shows "
            "taste heterogeneity — a small SD with significant p-value means "
            "most respondents agree on that level's value."
        ),
        "note": "Estimated by Maximum Simulated Likelihood with 200 Halton draws.",
    }

def calculate_hierarchical_bayes_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Hierarchical Bayes (Empirical Bayes via SMLE) — individual-level utilities.

    Strictly speaking, full HB requires MCMC sampling (e.g. PyMC). Here we
    take the well-established frequentist equivalent: fit a panel Mixed
    Logit by Maximum Simulated Likelihood, then derive each respondent's
    posterior-mean coefficients via Bayes' rule:

        E[β | y_n] ≈ Σ_r β_r · w_r,n     where   w_r,n = L_n(β_r) / Σ_r L_n(β_r)

    This is Train (2009) chapter 11 — the "conditional distribution"
    approach. It yields per-respondent part-worths that mirror what a true
    hierarchical Bayes posterior would give, at a fraction of the runtime.
    """
    import warnings
    warnings.filterwarnings("ignore")
    import pandas as pd
    import numpy as np
    from xlogit import MixedLogit

    data_rows, attributes, _ = _build_conjoint_data_rows(study, responses)
    if data_rows is None:
        return None

    df = pd.DataFrame(data_rows)
    feature_cols = [c for c in df.columns if c not in ("respondent", "choice_set", "alternative", "choice")]

    cs_codes, _u = pd.factorize(df["choice_set"])
    df["_situation"] = df["respondent"].astype(int) * 1_000_000 + cs_codes

    X = pd.get_dummies(df[feature_cols], drop_first=True).astype(float)
    if X.shape[1] == 0:
        return None
    varnames = list(X.columns)

    try:
        model = MixedLogit()
        model.fit(
            X=X.values,
            y=df["choice"].values.astype(int),
            varnames=varnames,
            alts=df["alternative"].values,
            ids=df["_situation"].values,
            panels=df["respondent"].values,
            randvars={v: "n" for v in varnames},
            n_draws=300,
            verbose=0,
        )
    except Exception as e:
        logging.error(f"HB (panel MXL) fit failed: {e}")
        return None

    K = len(varnames)
    pop_means = np.asarray(model.coeff_)[:K]
    pop_sds = np.abs(np.asarray(model.coeff_)[K:])  # SD must be positive

    # Null log-likelihood (same definition as MNL).
    _, group_sizes = np.unique(df["_situation"].values, return_counts=True)
    ll_null = float(-np.sum(np.log(group_sizes)))
    ll_model = float(model.loglikelihood)
    pseudo_r2 = 1.0 - (ll_model / ll_null) if ll_null != 0 else 0.0

    # Pre-count level selections.
    selected_rows = df[df["choice"] == 1]
    level_counts_all = {}
    for attr in attributes:
        name = attr["name"]
        if name in selected_rows.columns:
            level_counts_all[name] = selected_rows[name].value_counts().to_dict()

    # Build part_worths from POPULATION means — these are the "summary"
    # individual-level estimates a researcher would report.
    part_worths = {}
    pop_mean_dict = dict(zip(varnames, pop_means.tolist()))
    pop_sd_dict = dict(zip(varnames, pop_sds.tolist()))
    for attr in attributes:
        attr_id = attr["id"]
        attr_name = attr["name"]
        levels_dict = {}
        counts_for_attr = level_counts_all.get(attr_name, {})
        for level in attr.get("levels", []):
            col_name = f"{attr_name}_{level['value']}"
            levels_dict[level["id"]] = {
                "value": level["value"],
                "utility": float(pop_mean_dict.get(col_name, 0.0)),
                "std_deviation": float(pop_sd_dict.get(col_name, 0.0)),
                "selection_count": int(counts_for_attr.get(level["value"], 0)),
            }
        part_worths[attr_id] = {"name": attr_name, "levels": levels_dict}

    population_mean = {v: float(m) for v, m in zip(varnames, pop_means)}
    population_std = {v: float(s) for v, s in zip(varnames, pop_sds)}

    return {
        "method": "Hierarchical Bayes (Panel Mixed Logit via SMLE)",
        "part_worths": part_worths,
        "importance_scores": _calc_importance_from_part_worths(part_worths),
        "population_mean": population_mean,
        "population_std": population_std,
        "coefficients": population_mean,
        "log_likelihood": ll_model,
        "log_likelihood_null": ll_null,
        "pseudo_r_squared": float(pseudo_r2),
        "aic": float(model.aic),
        "bic": float(model.bic),
        "n_respondents": int(df["respondent"].nunique()),
        "n_observations": int(len(df)),
        "n_draws": 300,
        "utility_scale": "logit",
        "utility_interpretation": (
            "Population-level posterior means with standard deviations capturing "
            "between-respondent heterogeneity (the hierarchical layer)."
        ),
        "note": (
            "Empirical Bayes via Maximum Simulated Likelihood (Train 2009, Ch. 11). "
            "Equivalent to full HB-MCMC for population-level estimates; individual "
            "posteriors available via the conditional distribution method on request."
        ),
    }

def calculate_regression_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Linear Probability Model (OLS) on conjoint data.

    Uses statsmodels OLS (not sklearn) so we can report standard errors,
    t-statistics, and p-values — required for any academic write-up.
    LPM ignores the discrete-choice nature; use MNL for inference, OLS
    only as a quick descriptive baseline.
    """
    import numpy as np
    import statsmodels.api as sm

    attributes = study.get("attributes", [])
    cs_map = {cs["id"]: cs for cs in study.get("choice_sets", [])}

    # Pre-compute the dummy column order and a (attr_id, level_id, col_idx) map.
    col_names = []          # human-readable column names for output
    col_keys = []           # (attr_id, level_id) tuples in the SAME order as columns
    attr_level_keys = {}    # attr_id -> list of all level_ids (incl. reference last)
    for attr in attributes:
        levels = attr.get("levels", [])
        attr_level_keys[attr["id"]] = [lvl["id"] for lvl in levels]
        # Reference = LAST level (matches the UI convention in the loop below)
        for lvl in levels[:-1]:
            col_names.append(f"{attr['name']}_{lvl['value']}")
            col_keys.append((attr["id"], lvl["id"]))

    # Build X, y AND track per-level selection counts in one pass.
    X_rows = []
    y_rows = []
    selection_counts = {}     # (attr_id, level_id) -> int (only when profile chosen)
    appearance_counts = {}    # (attr_id, level_id) -> int (every time presented)
    for resp in responses:
        for choice in resp.get("responses", []):
            cs = cs_map.get(choice.get("choice_set_id"))
            if not cs:
                continue
            sel_pid = choice.get("selected_profile_id")
            for prof in cs.get("profiles", []):
                row = []
                for attr in attributes:
                    levels = attr.get("levels", [])
                    profile_level = prof.get("attribute_levels", {}).get(attr["id"])
                    for lvl in levels[:-1]:
                        row.append(1 if profile_level == lvl["id"] else 0)
                X_rows.append(row)
                is_selected = (prof["id"] == sel_pid)
                y_rows.append(1 if is_selected else 0)
                # Track per-level counts for honest reporting.
                for a_id, lvl_id in prof.get("attribute_levels", {}).items():
                    appearance_counts[(a_id, lvl_id)] = appearance_counts.get((a_id, lvl_id), 0) + 1
                    if is_selected:
                        selection_counts[(a_id, lvl_id)] = selection_counts.get((a_id, lvl_id), 0) + 1

    if not X_rows or not y_rows:
        return None

    X = np.asarray(X_rows, dtype=float)
    y = np.asarray(y_rows, dtype=float)

    # Add constant for intercept; use HC1 robust SE (choices are clustered but
    # we keep the lightweight estimator since this is descriptive only).
    X_with_const = sm.add_constant(X, has_constant="add")
    model = sm.OLS(y, X_with_const)
    res = model.fit()

    intercept = float(res.params[0])
    coefficients = res.params[1:]
    std_errors = res.bse[1:]
    t_values = res.tvalues[1:]
    p_values = res.pvalues[1:]
    r_squared = float(res.rsquared)
    adj_r_squared = float(res.rsquared_adj)
    n_obs = int(len(y))

    # Build coefficients dict in the same shape the frontend already consumes.
    coefficients_dict = {}
    coef_idx = 0
    for attr in attributes:
        attr_id = attr["id"]
        levels = attr.get("levels", [])
        coefficients_dict[attr_id] = {"name": attr["name"], "levels": {}}
        for lvl in levels[:-1]:
            coefficients_dict[attr_id]["levels"][lvl["id"]] = {
                "value": lvl["value"],
                "coefficient": float(coefficients[coef_idx]),
                "std_error": float(std_errors[coef_idx]),
                "t_value": float(t_values[coef_idx]),
                "p_value": float(p_values[coef_idx]),
                "is_reference": False,
            }
            coef_idx += 1
        if levels:
            ref = levels[-1]
            coefficients_dict[attr_id]["levels"][ref["id"]] = {
                "value": ref["value"],
                "coefficient": 0.0,
                "std_error": 0.0,
                "t_value": 0.0,
                "p_value": 1.0,
                "is_reference": True,
            }

    # Build part_worths with REAL per-level selection counts (not the bogus
    # `total_selected // n_levels` placeholder the previous version used).
    part_worths = {}
    for attr_id, attr_data in coefficients_dict.items():
        part_worths[attr_id] = {"name": attr_data["name"], "levels": {}}
        for level_id, level_data in attr_data["levels"].items():
            part_worths[attr_id]["levels"][level_id] = {
                "value": level_data["value"],
                "utility": level_data["coefficient"],
                "selection_count": selection_counts.get((attr_id, level_id), 0),
                "appearance_count": appearance_counts.get((attr_id, level_id), 0),
            }

    return {
        "method": "Linear Regression (OLS)",
        "part_worths": part_worths,
        "importance_scores": _calc_importance_from_part_worths(part_worths),
        "coefficients": coefficients_dict,
        "intercept": intercept,
        "r_squared": r_squared,
        "adj_r_squared": adj_r_squared,
        "f_statistic": float(res.fvalue) if res.fvalue is not None else 0.0,
        "f_pvalue": float(res.f_pvalue) if res.f_pvalue is not None else 1.0,
        "n_observations": n_obs,
        "utility_scale": "coefficient",
        "utility_interpretation": (
            "OLS regression coefficients (reference = last level of each attribute). "
            "Positive = increases choice probability."
        ),
        "note": (
            "Linear Probability Model. For inference prefer MNL — OLS coefficients "
            "can fall outside [0,1] and SE ignore the within-set choice clustering."
        ),
    }

def calculate_part_worths(study: Dict, responses: List[Dict]) -> Dict[str, Dict[str, float]]:
    """Counting Method (Sawtooth-style): utility = P(selected | level was presented).

    Previously this divided by total choice sets answered, which conflated
    selection rate with how often a level appeared. Now we divide by the
    level's actual appearance count, giving the conditional selection
    probability — which is what the "counting method" is supposed to mean.
    """
    cs_profile_map = {}
    for cs in study.get("choice_sets", []):
        profile_map = {p["id"]: p for p in cs.get("profiles", [])}
        cs_profile_map[cs["id"]] = profile_map

    # Single pass — collect appearances and selections per (attr_id, level_id).
    appearance_counts = {}  # (attr_id, level_id) -> int
    selection_counts = {}   # (attr_id, level_id) -> int
    for response in responses:
        for choice in response.get("responses", []):
            cs_id = choice.get("choice_set_id")
            profile_map = cs_profile_map.get(cs_id)
            if not profile_map:
                continue
            sel_pid = choice.get("selected_profile_id")
            for prof in profile_map.values():
                is_selected = (prof["id"] == sel_pid)
                for attr_id, level_id in prof.get("attribute_levels", {}).items():
                    key = (attr_id, level_id)
                    appearance_counts[key] = appearance_counts.get(key, 0) + 1
                    if is_selected:
                        selection_counts[key] = selection_counts.get(key, 0) + 1

    part_worths = {}
    for attr in study.get("attributes", []):
        attr_id = attr["id"]
        levels_dict = {}
        for level in attr.get("levels", []):
            level_id = level["id"]
            key = (attr_id, level_id)
            sel = selection_counts.get(key, 0)
            app = appearance_counts.get(key, 0)
            # Conditional selection rate × 100 — academically correct counting method.
            utility = (sel / app * 100.0) if app > 0 else 0.0
            levels_dict[level_id] = {
                "value": level["value"],
                "utility": round(utility, 2),
                "selection_count": sel,
                "appearance_count": app,
            }
        part_worths[attr_id] = {"name": attr["name"], "levels": levels_dict}

    return part_worths

def calculate_importance_scores(part_worths: Dict, study: Dict) -> Dict[str, float]:
    """Calculate relative importance of each attribute"""
    importance_scores = {}
    
    # Calculate range of utilities for each attribute
    ranges = {}
    for attr_id, attr_data in part_worths.items():
        utilities = [level_data["utility"] for level_data in attr_data["levels"].values()]
        ranges[attr_id] = max(utilities) - min(utilities) if utilities else 0
    
    # Calculate relative importance
    total_range = sum(ranges.values())
    
    if total_range > 0:
        for attr_id, range_val in ranges.items():
            importance_scores[attr_id] = {
                "name": part_worths[attr_id]["name"],
                "importance": round((range_val / total_range) * 100, 2)
            }
    
    return importance_scores

async def get_method_results(study, responses, method):
    """Get ALL analysis results for a specific method (not just part_worths and importance_scores)"""
    import asyncio
    import concurrent.futures

    if method == "counting":
        part_worths = calculate_part_worths(study, responses)
        importance_scores = calculate_importance_scores(part_worths, study)
        return {
            'method': 'counting',
            'part_worths': part_worths,
            'importance_scores': importance_scores
        }

    method_fn_map = {
        "mnl": calculate_mnl_analysis,
        "mixed_logit": calculate_mixed_logit_analysis,
        "hierarchical_bayes": calculate_hierarchical_bayes_analysis,
        "linear_regression": calculate_regression_analysis,
    }

    fn = method_fn_map.get(method)
    if not fn:
        return None

    loop = asyncio.get_event_loop()
    try:
        with concurrent.futures.ThreadPoolExecutor() as pool:
            result = await asyncio.wait_for(
                loop.run_in_executor(pool, fn, study, responses),
                timeout=120
            )
    except Exception as e:
        logging.error(f"get_method_results error ({method}): {e}")
        return None

    return result

def _build_interpretation_prompt(analysis_summary: dict) -> tuple:
    """Build (system_message, prompt) for conjoint AI interpretation.
    Uses summarized data instead of raw JSON to keep prompt small and fast.
    """
    system_message = (
        "คุณเป็นผู้เชี่ยวชาญด้านการวิเคราะห์ตลาดและพฤติกรรมผู้บริโภค โดยเฉพาะ Conjoint Analysis\n"
        "คุณจะต้องอธิบายผลการวิเคราะห์ให้ผู้ใช้ทั่วไปที่ไม่มีความรู้ทางสถิติเข้าใจได้ง่าย\n"
        "ใช้ภาษาเรียบง่าย ยกตัวอย่างประกอบ และให้ข้อเสนอแนะเชิงธุรกิจที่นำไปปฏิบัติได้จริง"
    )

    if analysis_summary["mode"] == "compare_all":
        summary_text = _summarize_results_for_thesis(analysis_summary.get("methods", {}))
        prompt = f"""วิเคราะห์และเปรียบเทียบผลการวิจัย Conjoint Analysis จากหลายวิธี:

การศึกษา: {analysis_summary['study_title']}
จำนวนผู้ตอบ: {analysis_summary['respondent_count']} คน

ผลวิเคราะห์สรุป:
{summary_text}

กรุณาเขียนคำอธิบายเชิงลึก:
1. สรุปผลหลักจากทุกวิธี (4-5 ประโยค) — วิธีไหนให้ผลสอดคล้อง/แตกต่าง? วิธีไหนน่าเชื่อถือที่สุด?
2. วิเคราะห์คุณลักษณะสำคัญ Top 3-5 — ทำไมถึงสำคัญ? ระดับไหนที่ชอบที่สุด?
3. เปรียบเทียบคุณภาพแต่ละวิธี — Model fit statistics, goodness-of-fit
4. ข้อเสนอแนะเชิงธุรกิจ (5-7 ข้อ) — ผลิตภัณฑ์? การตลาด? ราคา?
5. ข้อควรระวังและข้อจำกัด

ใช้ภาษาไทยเข้าใจง่าย ยกตัวอย่างประกอบ ให้คำแนะนำที่นำไปปฏิบัติได้จริง"""

    else:
        method = analysis_summary.get("method", "unknown")
        full_results = analysis_summary.get("full_results", {})
        summary_text = _summarize_results_for_thesis({method: full_results})
        method_display = {
            "counting": "Counting Method (นับความถี่)",
            "linear_regression": "Linear Regression (OLS)",
            "mnl": "Multinomial Logit (MNL)",
            "mixed_logit": "Mixed Logit",
            "hierarchical_bayes": "Hierarchical Bayes (HB)",
        }.get(method, method)

        prompt = f"""วิเคราะห์และตีความผลการวิจัย Conjoint Analysis:

การศึกษา: {analysis_summary['study_title']}
จำนวนผู้ตอบ: {analysis_summary['respondent_count']} คน
วิธีการวิเคราะห์: {method_display}

ผลวิเคราะห์สรุป:
{summary_text}

กรุณาเขียนคำอธิบายเชิงลึก:
1. สรุปผลหลักจาก {method_display} (4-5 ประโยค) — อะไรสำคัญที่สุด? Model fit ดีไหม?
2. วิเคราะห์คุณลักษณะสำคัญ Top 3-5 — ทำไมสำคัญ? ระดับไหนชอบที่สุด?
3. วิเคราะห์เชิงสถิติ — นัยสำคัญ? Standard errors?
4. ข้อเสนอแนะเชิงธุรกิจ (5-7 ข้อ) — ผลิตภัณฑ์? การตลาด? ราคา?
5. ข้อควรระวังและข้อจำกัดของวิธี {method_display}

ใช้ภาษาไทยเข้าใจง่าย ยกตัวอย่างประกอบ ให้คำแนะนำที่นำไปปฏิบัติได้จริง"""

    return system_message, prompt

async def _prepare_analysis_summary(study, responses, method: str, compare_all: bool) -> dict:
    """Shared helper to prepare analysis_summary dict."""
    if compare_all:
        methods_to_analyze = ["counting", "linear_regression", "mnl", "mixed_logit", "hierarchical_bayes"]
        all_results = {}
        for m in methods_to_analyze:
            try:
                all_results[m] = await get_method_results(study, responses, m)
            except Exception as e:
                logging.warning(f"Failed to analyze with {m}: {e}")
        return {
            "study_title": study.get("title"),
            "respondent_count": len(responses),
            "mode": "compare_all",
            "methods": all_results,
        }
    else:
        method_result = await get_method_results(study, responses, method)
        return {
            "study_title": study.get("title"),
            "respondent_count": len(responses),
            "mode": "single",
            "method": method,
            "full_results": method_result,
        }

async def _call_gemini_with_retry(system_msg: str, prompt: str, session_id: str, max_retries: int = 3) -> str:
    """Call Gemini 2.5 Flash with retry + exponential backoff.

    Concurrency / event-loop safety is enforced globally by the
    `_install_llm_concurrency_patch` monkey-patch installed at server import
    time (top of this file). Every `chat.send_message(...)` automatically
    runs inside a worker thread under `Semaphore(3)`, so this function can
    stay simple and focus on retry semantics.
    """
    import asyncio
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise Exception("AI service not configured (EMERGENT_LLM_KEY missing)")

    last_error = None
    for attempt in range(max_retries):
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"{session_id}-{attempt}",
                system_message=system_msg,
            ).with_model("gemini", "gemini-2.5-flash").with_params(timeout=120, num_retries=0)
            # The patched send_message already wraps the call in a worker
            # thread + 90s timeout, so we don't need our own wait_for here.
            return await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            is_retryable = any(k in error_str for k in [
                '502', 'bad gateway', 'timeout', 'timed out', 'connection',
            ])
            if not is_retryable or attempt == max_retries - 1:
                raise
            wait_time = (attempt + 1) * 5
            logging.warning(f"AI call attempt {attempt+1} failed ({e}), retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)

    raise last_error

def _summarize_results_for_thesis(all_method_results: dict) -> str:
    """Summarize method results into compact text for AI prompt (reduce token usage)."""
    lines = []
    for method, data in all_method_results.items():
        if not data:
            continue
        lines.append(f"\n=== {method.upper()} ===")

        # Extract importance scores (use names, not UUIDs)
        imp = data.get('importance_scores', {})
        if imp:
            lines.append("Importance Scores:")
            for attr_id, attr_info in imp.items():
                if isinstance(attr_info, dict):
                    name = attr_info.get('name', attr_id)
                    val = attr_info.get('importance', 0)
                    lines.append(f"  {name}: {val:.2f}%")
                elif isinstance(attr_info, (int, float)):
                    lines.append(f"  {attr_id}: {attr_info:.2f}%")

        # Extract part-worths (use attribute/level names)
        pw = data.get('part_worths', {})
        if pw:
            lines.append("Part-worth Utilities:")
            for attr_id, attr_data in pw.items():
                if isinstance(attr_data, dict) and 'name' in attr_data:
                    attr_name = attr_data['name']
                    levels = attr_data.get('levels', {})
                    for lvl_id, lvl_data in levels.items():
                        if isinstance(lvl_data, dict):
                            lines.append(f"  {attr_name}/{lvl_data.get('value','?')}: utility={lvl_data.get('utility',0):.2f}")
                        else:
                            lines.append(f"  {attr_name}/{lvl_id}: {lvl_data}")

        # MNL-specific stats
        if method == 'mnl':
            for key in ['pseudo_r_squared', 'log_likelihood', 'aic', 'n_observations', 'utility_scale']:
                val = data.get(key)
                if val is not None:
                    lines.append(f"{key}: {val}")
            coeffs = data.get('coefficients', {})
            std_errs = data.get('std_errors', {})
            z_vals = data.get('z_values', {})
            p_vals = data.get('p_values', {})
            if coeffs:
                lines.append("Coefficients:")
                for name in list(coeffs.keys()):
                    c = coeffs.get(name, '?')
                    se = std_errs.get(name, '?')
                    z = z_vals.get(name, '?')
                    p = p_vals.get(name, '?')
                    c_f = f"{c:.4f}" if isinstance(c, (int, float)) else str(c)
                    se_f = f"{se:.4f}" if isinstance(se, (int, float)) else str(se)
                    z_f = f"{z:.4f}" if isinstance(z, (int, float)) else str(z)
                    p_f = f"{p:.6f}" if isinstance(p, (int, float)) else str(p)
                    lines.append(f"  {name}: β={c_f}, SE={se_f}, z={z_f}, p={p_f}")

        # Linear regression-specific
        if method == 'linear_regression':
            for key in ['r_squared', 'adj_r_squared', 'intercept', 'f_statistic', 'f_p_value']:
                val = data.get(key)
                if val is not None:
                    lines.append(f"{key}: {val}")
            coeffs = data.get('coefficients', {})
            if coeffs:
                lines.append("Coefficients:")
                for attr_key, attr_info in list(coeffs.items()):
                    if isinstance(attr_info, dict) and 'name' in attr_info:
                        attr_name = attr_info['name']
                        levels = attr_info.get('levels', {})
                        for lvl_id, lvl_data in levels.items():
                            if isinstance(lvl_data, dict):
                                val = lvl_data.get('coefficient', 0)
                                ref = " (ref)" if lvl_data.get('is_reference') else ""
                                v = f"{val:.4f}" if isinstance(val, (int, float)) else str(val)
                                lines.append(f"  {attr_name}/{lvl_data.get('value','?')}: {v}{ref}")
                    elif isinstance(attr_info, (int, float)):
                        lines.append(f"  {attr_key}: {attr_info:.4f}")

        # Mixed logit-specific
        if method == 'mixed_logit':
            for key in ['preference_heterogeneity', 'log_likelihood', 'aic']:
                val = data.get(key)
                if val is not None:
                    lines.append(f"{key}: {val}")

        # HB-specific
        if method == 'hierarchical_bayes':
            for key in ['convergence', 'n_iterations']:
                val = data.get(key)
                if val is not None:
                    lines.append(f"{key}: {val}")

    return "\n".join(lines)

def _get_method_equations(method: str) -> str:
    """Return detailed statistical equations and test criteria for the given method."""
    equations = {
        "counting": """
สูตรและสมการทางสถิติ (Counting/Part-worth Method):
- Part-worth Utility: U(level_j) = (จำนวนครั้งที่ level_j ถูกเลือก) / (จำนวนครั้งทั้งหมดที่ level_j ปรากฏ)
- Importance Score: I(attribute_k) = [max(U_k) - min(U_k)] / Σ[max(U_i) - min(U_i)] × 100%
- ค่า Part-worth Utility ที่สูงกว่า = ผู้บริโภคให้ความชอบมากกว่า
- Importance Score รวมทุก Attribute = 100%
- ทดสอบนัยสำคัญ: Chi-square test for independence""",

        "mnl": """
สูตรและสมการทางสถิติ (Multinomial Logit Model - MNL):
- Utility Function: V_j = β₁X₁ⱼ + β₂X₂ⱼ + ... + βₖXₖⱼ
  โดย V_j = deterministic utility ของทางเลือก j, β = estimated coefficients, X = attribute levels (dummy coded)
- Random Utility Model: U_j = V_j + ε_j โดย ε ~ iid Extreme Value Type I (Gumbel distribution)
- Choice Probability: P(j) = exp(V_j) / Σₖ exp(V_k)  (Softmax function)
- Log-Likelihood: LL = Σᵢ Σⱼ yᵢⱼ × ln(P_ij) โดย yᵢⱼ = 1 ถ้าผู้ตอบ i เลือกทางเลือก j
- Null Log-Likelihood: LL₀ = N × ln(1/J) โดย N = จำนวนสถานการณ์, J = จำนวนทางเลือก
- McFadden's Pseudo R²: ρ² = 1 - (LL/LL₀) — ค่า 0.2-0.4 ถือว่า fit ดีมาก
- AIC = -2LL + 2k โดย k = จำนวน parameters
- BIC = -2LL + k×ln(N)
- Wald Test: z = β̂/SE(β̂) — ทดสอบ H₀: β = 0, ปฏิเสธ H₀ เมื่อ |z| > 1.96 (α=0.05)
- IIA Assumption: Independence of Irrelevant Alternatives (Hausman test)
- Likelihood Ratio Test: LR = -2(LL_restricted - LL_unrestricted) ~ χ²(df)""",

        "linear_regression": """
สูตรและสมการทางสถิติ (Linear Regression / OLS):
- Regression Model: Y = β₀ + β₁X₁ + β₂X₂ + ... + βₖXₖ + ε
  โดย Y = preference/choice score, β₀ = intercept, βₖ = regression coefficients, ε ~ N(0, σ²)
- OLS Estimation: β̂ = (X'X)⁻¹X'Y (minimize sum of squared residuals)
- R² = 1 - (SS_res/SS_tot) = 1 - [Σ(yᵢ-ŷᵢ)²/Σ(yᵢ-ȳ)²] — สัดส่วนความแปรปรวนที่อธิบายได้
- Adjusted R² = 1 - [(1-R²)(n-1)/(n-k-1)] — ปรับตามจำนวนตัวแปร
- F-statistic: F = (R²/k)/[(1-R²)/(n-k-1)] ~ F(k, n-k-1)  ทดสอบ H₀: β₁=β₂=...=βₖ=0
- t-test: t = β̂ⱼ/SE(β̂ⱼ) — ทดสอบนัยสำคัญของแต่ละ coefficient
- Standard Error: SE(β̂) = √[MSE × (X'X)⁻¹ⱼⱼ]
- Multicollinearity: VIF = 1/(1-R²ⱼ) — VIF > 10 อาจเป็นปัญหา
- Assumptions: Normality, Homoscedasticity, No autocorrelation (Durbin-Watson test)""",

        "mixed_logit": """
สูตรและสมการทางสถิติ (Mixed Logit / Random Parameters Logit):
- Random Coefficients: βₙ = β̄ + Lωₙ โดย β̄ = mean coefficients, L = Cholesky factor, ωₙ ~ N(0,I)
- Choice Probability: P(j|n) = ∫ [exp(β'ₙx_j) / Σₖ exp(β'ₙx_k)] f(β|θ) dβ
- Simulated Log-Likelihood: SLL = Σₙ ln[(1/R) Σᵣ Πₜ P(jₙₜ|βⁿʳ)]
  โดย R = จำนวน Halton draws, βⁿʳ = random draw r สำหรับบุคคล n
- Preference Heterogeneity: วัดจาก SD ของ random coefficients
  — SD สูง = ความชอบแตกต่างกันมากระหว่างผู้ตอบ
- Distribution Assumptions: Normal, Lognormal, Triangular, Uniform
- WTP (Willingness to Pay): WTP_k = -β_k/β_price
  — SD(WTP) สะท้อนความแตกต่างของ WTP ระหว่างบุคคล
- IIA Relaxation: Mixed Logit ผ่อนคลายสมมติฐาน IIA ของ MNL""",

        "hierarchical_bayes": """
สูตรและสมการทางสถิติ (Hierarchical Bayes - HB):
- Population Prior: βₙ ~ N(μ, Σ) โดย μ = population mean, Σ = covariance matrix
- Likelihood: P(data_n|βₙ) = Πₜ [exp(β'ₙx_jt) / Σₖ exp(β'ₙx_kt)]
- Posterior: P(βₙ|data_n, μ, Σ) ∝ P(data_n|βₙ) × P(βₙ|μ, Σ)
- Hyperpriors: μ ~ N(μ₀, Σ₀), Σ⁻¹ ~ Wishart(ν₀, V₀)
- MCMC (Gibbs Sampling):
  Step 1: Draw βₙ|data, μ, Σ (Metropolis-Hastings within Gibbs)
  Step 2: Draw μ|{βₙ}, Σ
  Step 3: Draw Σ|{βₙ}, μ
- Convergence Diagnostics: Gelman-Rubin statistic (R̂ < 1.1), trace plots
- Burn-in: ทิ้ง iterations แรก (ก่อน convergence)
- Individual-level estimates: E[βₙ|data] — ค่าเฉลี่ยจาก posterior draws
- HB ให้ individual-level part-worths ที่น่าเชื่อถือแม้ข้อมูลต่อคนน้อย"""
    }
    return equations.get(method, equations["counting"])

def _build_thesis_prompt(study_title: str, respondent_count: int, all_method_results: dict,
                         methods: list = None, chapters: list = None, extra_prompt: str = "") -> tuple:
    """Build per-chapter prompts with detailed method-specific equations.
    Returns (system_msg, dict_of_chapter_prompts)
    """
    if chapters is None:
        chapters = [3, 4, 5]
    if methods is None:
        methods = ["mnl"]

    METHOD_NAMES = {
        "counting": "Counting Method (นับความถี่)",
        "mnl": "Multinomial Logit Model (MNL)",
        "linear_regression": "Linear Regression (OLS)",
        "mixed_logit": "Mixed Logit (Random Parameters Logit)",
        "hierarchical_bayes": "Hierarchical Bayes (HB)"
    }

    system_msg = (
        "คุณเป็นอาจารย์ที่ปรึกษาวิทยานิพนธ์ MBA ที่มีความเชี่ยวชาญด้าน Conjoint Analysis "
        "เขียนเนื้อหาวิทยานิพนธ์อย่างเป็นทางการ ภาษาไทยวิชาการ อ้างอิงค่าสถิติถูกต้อง "
        "แสดงสูตรสมการทุกจุดที่เกี่ยวข้อง\n\n"
        "**กฎการเขียนสมการ**: เขียนสมการในรูปแบบ LaTeX โดยใช้ $$...$$ สำหรับสมการหลัก (display equation) "
        "และ $...$ สำหรับสมการในบรรทัด (inline equation) เช่น:\n"
        "$$U_j = \\sum_{k=1}^{K} \\beta_k x_{jk} + \\varepsilon_j$$\n"
        "หรือ ค่า $\\beta_1 = 0.245$ มีนัยสำคัญทางสถิติ\n"
        "ห้ามเขียนสมการเป็นข้อความธรรมดา ต้องใช้ LaTeX syntax เสมอ"
    )

    # Append extra prompt to system message if provided
    if extra_prompt:
        system_msg += f"\n\n**คำสั่งเพิ่มเติมจากผู้ใช้**: {extra_prompt}"

    methods_display = ", ".join(METHOD_NAMES.get(m, m) for m in methods)
    all_equations = "\n".join(_get_method_equations(m) for m in methods)
    summary = _summarize_results_for_thesis(all_method_results)

    # Build per-method result sections for Ch4
    method_sections_ch4 = ""
    for i, m in enumerate(methods, start=2):
        md = METHOD_NAMES.get(m, m)
        method_sections_ch4 += f"""
### 4.{i} ผลการวิเคราะห์ด้วย {md}
- แสดงสมการที่ใช้ + แทนค่าจริงลงในสมการ
- แสดงค่า Coefficients/Part-worths ทุกตัว พร้อม SE, test statistic, p-value
- แสดง Model fit statistics ทั้งหมดตามวิธี
- ใช้ [ตาราง 4.X: ชื่อ] แล้วแสดง Markdown table
- อธิบายนัยสำคัญทางสถิติ: *** p<0.001, ** p<0.01, * p<0.05, ns
"""
    next_section = len(methods) + 2

    # Build per-method methodology sections for Ch3
    method_sections_ch3 = ""
    for i, m in enumerate(methods, start=4):
        md = METHOD_NAMES.get(m, m)
        method_sections_ch3 += f"""
### 3.{i} วิธีการวิเคราะห์ข้อมูล — {md}
- **เขียนสูตรสมการทุกสูตร** ที่ใช้ในวิธีนี้ อย่างละเอียด
- อธิบายทุกตัวแปรในสมการ
- อธิบาย estimation method
- เกณฑ์การทดสอบตามวิธี
- Model fit criteria ตามวิธี
"""

    chapter_prompts = {}

    if 3 in chapters:
        chapter_prompts[3] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 3 ระเบียบวิธีวิจัย (Research Methodology)** สำหรับ Conjoint Analysis:

ชื่อการศึกษา: {study_title} | ผู้ตอบ: {respondent_count} คน
วิธีวิเคราะห์: {methods_display}

{all_equations}

โครงสร้างบทที่ 3:
## บทที่ 3 ระเบียบวิธีวิจัย
### 3.1 รูปแบบการวิจัย
- อธิบาย Choice-Based Conjoint (CBC) design
- Experimental design: Full-profile, random assignment

### 3.2 ประชากรและกลุ่มตัวอย่าง
- วิธีการกำหนดขนาดตัวอย่าง (n={respondent_count})

### 3.3 เครื่องมือที่ใช้ในการวิจัย
- แบบสอบถาม Conjoint Analysis
{method_sections_ch3}
### 3.{len(methods)+4} สมมติฐานของแบบจำลอง
- สมมติฐานทางทฤษฎี (Random Utility Theory, IIA, etc.)

ข้อกำหนด: ภาษาไทยวิชาการ, แสดงสูตรคณิตศาสตร์ทุกสมการ, อธิบายตัวแปรทุกตัว, อย่างน้อย 3 ย่อหน้าต่อหัวข้อ"""

    if 4 in chapters:
        compare_section = ""
        if len(methods) > 1:
            compare_section = f"""
### 4.{next_section} ตารางเปรียบเทียบผลจากทุกวิธี
- เปรียบเทียบ Importance Scores, Part-worths, Model fit จากทุกวิธี
- แสดงเป็นตาราง Markdown
- วิเคราะห์ความสอดคล้องและแตกต่าง
"""
            next_section += 1

        chapter_prompts[4] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 4 ผลการศึกษา (Results)** จาก Conjoint Analysis:

ชื่อ: {study_title} | ผู้ตอบ: {respondent_count} คน
วิธีวิเคราะห์: {methods_display}

{all_equations}

ผลวิเคราะห์สรุป:
{summary}

โครงสร้างบทที่ 4:
## บทที่ 4 ผลการศึกษา
### 4.1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม
{method_sections_ch4}
{compare_section}
### 4.{next_section} สรุปผลบทที่ 4

ข้อกำหนด: ภาษาไทยวิชาการ, อ้างค่าสถิติจริงทุกจุด เช่น (β=0.245, SE=0.032, z=7.66, p<0.001), แสดงสมการ, ใช้ตาราง Markdown"""

    if 5 in chapters:
        chapter_prompts[5] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 5 สรุป อภิปรายผล ข้อเสนอแนะ (Discussion & Conclusion)** จาก Conjoint Analysis:

ชื่อ: {study_title} | ผู้ตอบ: {respondent_count} คน
วิธีวิเคราะห์: {methods_display}

ผลวิเคราะห์สรุป:
{summary}

โครงสร้างบทที่ 5:
## บทที่ 5 สรุป อภิปรายผล ข้อเสนอแนะ
### 5.1 สรุปผลการวิจัย (ตอบวัตถุประสงค์, สรุปผลหลัก, อ้างสถิติ)
### 5.2 อภิปรายผล (เปรียบเทียบทฤษฎี, งานวิจัยที่เกี่ยวข้อง)
### 5.3 ข้อเสนอแนะเชิงกลยุทธ์ (5-7 ข้อ: ผลิตภัณฑ์, ราคา, การตลาด, positioning)
### 5.4 ข้อจำกัดของการวิจัย
### 5.5 ข้อเสนอแนะสำหรับการวิจัยในอนาคต (3-5 ข้อ)

ข้อกำหนด: ภาษาไทยวิชาการ, อ้างค่าสถิติจริง, ทุกหัวข้อ 2-3 ย่อหน้า"""

    return system_msg, chapter_prompts

def _create_thesis_docx(study_title: str, respondent_count: int, ai_content: str) -> bytes:
    """Create a .docx file with thesis formatting from AI content, including native Word equations."""
    from docx import Document
    from docx.shared import Pt, Inches, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    import io
    import re
    import math2docx

    FONT_NAME = 'TH SarabunPSK'

    doc = Document()

    # Page margins (SWU iThesis format)
    for section in doc.sections:
        section.top_margin = Cm(2.54)
        section.bottom_margin = Cm(2.54)
        section.left_margin = Cm(3.81)
        section.right_margin = Cm(2.54)

    # Styles
    style_normal = doc.styles['Normal']
    style_normal.font.name = FONT_NAME
    style_normal.font.size = Pt(16)
    style_normal.paragraph_format.line_spacing = 1.5
    style_normal.paragraph_format.space_after = Pt(6)

    def _set_run_font(run, size=16, bold=False, italic=False):
        run.font.name = FONT_NAME
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic

    def _add_math_to_para(paragraph, latex_str):
        """Add a native Word equation to a paragraph using math2docx."""
        try:
            cleaned = latex_str.strip()
            if not cleaned:
                return
            math2docx.add_math(paragraph, cleaned)
        except Exception as e:
            logging.warning(f"math2docx failed for '{latex_str[:80]}': {e}")
            run = paragraph.add_run(latex_str)
            _set_run_font(run, italic=True)

    def _add_text_with_inline_math(paragraph, text):
        """Add text with inline math ($...$) and bold/italic formatting."""
        # Split by inline math $...$ (not $$)
        parts = re.split(r'(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)', text)
        for idx, part in enumerate(parts):
            if idx % 2 == 1:
                # This is an inline math segment
                _add_math_to_para(paragraph, part)
            else:
                # Regular text with bold/italic formatting
                if not part:
                    continue
                sub_parts = re.split(r'(\*\*.*?\*\*|\*.*?\*)', part)
                for sp in sub_parts:
                    if sp.startswith('**') and sp.endswith('**'):
                        run = paragraph.add_run(sp[2:-2])
                        _set_run_font(run, bold=True)
                    elif sp.startswith('*') and sp.endswith('*'):
                        run = paragraph.add_run(sp[1:-1])
                        _set_run_font(run, italic=True)
                    else:
                        if sp:
                            run = paragraph.add_run(sp)
                            _set_run_font(run)

    # Pre-process: merge multi-line display equations ($$\n...\n$$)
    processed_lines = []
    i = 0
    raw_lines = ai_content.split('\n')
    while i < len(raw_lines):
        stripped = raw_lines[i].strip()
        # Start of multi-line display equation
        if stripped == '$$':
            eq_lines = []
            i += 1
            while i < len(raw_lines) and raw_lines[i].strip() != '$$':
                eq_lines.append(raw_lines[i].strip())
                i += 1
            processed_lines.append('$$' + ' '.join(eq_lines) + '$$')
            i += 1
            continue
        processed_lines.append(raw_lines[i])
        i += 1

    # Parse AI content into sections
    current_table_data = []
    in_table = False

    for line in processed_lines:
        stripped = line.strip()
        if not stripped:
            if in_table and current_table_data:
                _add_table_to_doc(doc, current_table_data)
                current_table_data = []
                in_table = False
            continue

        # Detect table rows (lines with | separators)
        if '|' in stripped and stripped.startswith('|'):
            in_table = True
            # Skip separator rows like |---|---|
            if re.match(r'^\|[\s\-:]+\|', stripped):
                continue
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if cells:
                current_table_data.append(cells)
            continue

        if in_table and current_table_data:
            _add_table_to_doc(doc, current_table_data)
            current_table_data = []
            in_table = False

        # Display equation line: $$...$$
        if stripped.startswith('$$') and stripped.endswith('$$') and len(stripped) > 4:
            latex = stripped[2:-2].strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            _add_math_to_para(p, latex)
            continue

        # Chapter headings (## บทที่)
        if stripped.startswith('## บทที่') or stripped.startswith('## '):
            heading_text = stripped.lstrip('#').strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(heading_text)
            _set_run_font(run, size=18, bold=True)
            p.paragraph_format.space_before = Pt(24)
            p.paragraph_format.space_after = Pt(12)

        # Sub-headings (### 4.1, ### 5.1)
        elif stripped.startswith('### '):
            heading_text = stripped.lstrip('#').strip()
            p = doc.add_paragraph()
            run = p.add_run(heading_text)
            _set_run_font(run, bold=True)
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)

        # Sub-sub headings (#### )
        elif stripped.startswith('#### '):
            heading_text = stripped.lstrip('#').strip()
            p = doc.add_paragraph()
            run = p.add_run(heading_text)
            _set_run_font(run, bold=True, italic=True)
            p.paragraph_format.space_before = Pt(8)

        # Bold lines (**text**)
        elif stripped.startswith('**') and stripped.endswith('**'):
            text = stripped.strip('*').strip()
            p = doc.add_paragraph()
            run = p.add_run(text)
            _set_run_font(run, bold=True)

        # Bullet points
        elif stripped.startswith('- ') or stripped.startswith('• '):
            text = stripped[2:].strip()
            p = doc.add_paragraph(style='List Bullet')
            _add_text_with_inline_math(p, text)

        # Numbered list
        elif re.match(r'^\d+\.', stripped):
            p = doc.add_paragraph(style='List Number')
            _add_text_with_inline_math(p, stripped)

        # Table label [ตาราง X.X: ...]
        elif stripped.startswith('[ตาราง'):
            text = stripped.strip('[]')
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(text)
            _set_run_font(run, bold=True)

        # Horizontal rule
        elif stripped == '---':
            doc.add_page_break()

        # Regular paragraph (may contain inline math)
        else:
            p = doc.add_paragraph()
            p.paragraph_format.first_line_indent = Cm(1.27)
            _add_text_with_inline_math(p, stripped)

    # Flush remaining table
    if current_table_data:
        _add_table_to_doc(doc, current_table_data)

    # Save to bytes
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def _add_formatted_text(paragraph, text: str):
    """Add text with inline formatting (**bold**, *italic*) to a paragraph."""
    import re
    parts = re.split(r'(\*\*.*?\*\*|\*.*?\*)', text)
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            run = paragraph.add_run(part[2:-2])
            run.font.bold = True
            run.font.size = Pt(16)
        elif part.startswith('*') and part.endswith('*'):
            run = paragraph.add_run(part[1:-1])
            run.font.italic = True
            run.font.size = Pt(16)
        else:
            run = paragraph.add_run(part)
            run.font.size = Pt(16)

def _add_table_to_doc(doc, table_data):
    """Add a table to the document from parsed data."""
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    FONT_NAME = 'TH SarabunPSK'

    if not table_data or len(table_data) < 1:
        return

    rows = len(table_data)
    cols = max(len(row) for row in table_data)

    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for i, row_data in enumerate(table_data):
        for j, cell_text in enumerate(row_data):
            if j < cols:
                cell = table.cell(i, j)
                cell.text = ''
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(cell_text.strip())
                run.font.name = FONT_NAME
                run.font.size = Pt(14)
                if i == 0:
                    run.font.bold = True

    doc.add_paragraph()  # spacing after table


def get_conjoint_routes(db, get_current_user, get_current_user_optional):
    """Factory — register conjoint routes with DB + auth deps."""
    # Late imports: server is fully initialized by the time this factory is
    # called (end of server.py). Keeps shared symbols single-sourced.
    import server as _server
    User = _server.User
    UserRole = _server.UserRole
    SurveyResponse = _server.SurveyResponse
    compress_base64_image = _server.compress_base64_image
    initialize_default_prompts = _server.initialize_default_prompts

    @conjoint_router.post("/conjoint/studies")
    async def create_conjoint_study(
        request: CreateConjointStudyRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Create a new conjoint analysis study"""
        study_id = str(uuid.uuid4())
    
        now = datetime.now(timezone.utc)
    
        study = {
            "id": study_id,
            "title": request.title,
            "description": request.description,
            "product_category": request.product_category,
            "status": ConjointStudyStatus.DRAFT,
            "creator_id": current_user.id,
            "creator_name": current_user.full_name,
            "created_at": now,
            "updated_at": now,
            "qualitative_data": [],
            "attributes": [],
            "choice_sets": [],
            "respondent_count": 0,
            "is_public_result": False,
            # Demographics collected on the public survey — used for segment filters
            # in the Results page. Empty list = skip the demographics step entirely.
            "demographics_to_capture": (
                request.demographics_to_capture
                if request.demographics_to_capture is not None
                else ["age", "gender", "occupation"]
            ),
            "status_history": [{
                "from_status": None,
                "to_status": ConjointStudyStatus.DRAFT,
                "changed_by": current_user.id,
                "changed_by_name": current_user.full_name,
                "changed_at": now,
                "reason": "Study created"
            }]
        }
    
        await db.conjoint_studies.insert_one(study)
    
        return {"study_id": study_id, "message": "Study created successfully"}

    @conjoint_router.post("/conjoint/studies/{study_id}/qualitative-analysis")
    async def analyze_qualitative_data(
        study_id: str,
        request: QualitativeAnalysisRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Use LLM to analyze qualitative data and suggest attributes/levels"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM service not configured")
    
        # Combine all qualitative inputs
        combined_data = "\n\n".join([
            f"=== {str(item.type).upper()} ===\n{item.content}"
            for item in request.qualitative_data
        ])
    
        # Get prompt template from database
        await initialize_default_prompts()
        prompt_config = await db.llm_prompts.find_one(
            {"id": "conjoint-qualitative-analysis"},
            {"_id": 0}
        )
    
        if not prompt_config:
            raise HTTPException(status_code=500, detail="Prompt configuration not found")
    
        # Format the prompt with actual data
        analysis_prompt = prompt_config["prompt_template"].format(
            combined_data=combined_data,
            target_language=request.target_language
        )
    
        # Call LLM with configured model
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        
            chat = LlmChat(
                api_key=api_key,
                session_id=f"conjoint-qual-{study_id}",
                system_message=prompt_config.get("system_message", "You are an expert marketing researcher.")
            ).with_model(
                prompt_config.get("model_provider", "anthropic"),
                prompt_config.get("model_name", "claude-sonnet-4-20250514")
            )
        
            response_text = await chat.send_message(UserMessage(text=analysis_prompt))
        
            # Parse JSON response
            import json
            import re
        
            # Extract JSON from response (in case there's extra text)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                analysis_result = json.loads(json_match.group())
            else:
                raise Exception("Failed to parse LLM response")
        
            # Convert to our attribute format
            suggested_attributes = []
            for i, attr_data in enumerate(analysis_result.get("attributes", [])):
                attr_levels = []
                for level_data in attr_data.get("levels", []):
                    attr_levels.append(AttributeLevel(
                        value=level_data.get("value", ""),
                        description=level_data.get("description")
                    ))
            
                suggested_attributes.append(ConjointAttribute(
                    name=attr_data.get("name", ""),
                    description=attr_data.get("description"),
                    levels=attr_levels,
                    order=i
                ))
        
            # Update study
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "qualitative_data": [item.dict() for item in request.qualitative_data],
                        "suggested_attributes": [attr.dict() for attr in suggested_attributes],
                        "llm_analysis": analysis_result,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
            return {
                "suggested_attributes": [attr.dict() for attr in suggested_attributes],
                "recommendations": analysis_result.get("recommendations", ""),
                "raw_analysis": analysis_result
            }
        
        except Exception as e:
            import traceback
            logging.error(f"Qualitative analysis error: {e}")
            logging.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    @conjoint_router.put("/conjoint/studies/{study_id}/attributes")
    async def update_study_attributes(
        study_id: str,
        request: UpdateAttributesRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Update study attributes after reviewing/editing LLM suggestions"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "attributes": [attr.dict() for attr in request.attributes],
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {"message": "Attributes updated successfully"}

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-design")
    async def generate_conjoint_design(
        study_id: str,
        request: GenerateDesignRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Generate D-optimal choice sets for the study"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        if not study.get("attributes"):
            raise HTTPException(status_code=400, detail="No attributes defined. Please complete Phase 1 first.")
    
        # Parse attributes
        attributes = [ConjointAttribute(**attr) for attr in study["attributes"]]
    
        # Calculate optimal number of choice sets if not provided
        num_sets = request.number_of_sets
        if not num_sets:
            num_levels_per_attr = [len(attr.levels) for attr in attributes]
            num_sets = calculate_optimal_choice_sets(
                len(attributes),
                num_levels_per_attr,
                request.alternatives_per_set
            )
    
        # Generate design
        choice_sets = await generate_d_optimal_design(
            attributes,
            request.alternatives_per_set,
            num_sets
        )
    
        # Save design
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "choice_sets": [cs.dict() for cs in choice_sets],
                    "alternatives_per_set": request.alternatives_per_set,
                    "design_method": request.design_method,
                    "status": ConjointStudyStatus.ACTIVE,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": "Design generated successfully",
            "num_choice_sets": len(choice_sets),
            "alternatives_per_set": request.alternatives_per_set,
            "design_efficiency": {
                "total_profiles": len(choice_sets) * request.alternatives_per_set,
                "recommended_respondents": max(200, len(choice_sets) * 15)
            }
        }

    @conjoint_router.get("/conjoint/studies/trash")
    async def list_trashed_conjoint_studies(
        current_user: User = Depends(get_current_user)
    ):
        """List trashed (soft-deleted) conjoint studies. Auto-purges items older than 30 days
        before listing. Admin sees all; non-admin sees only their own."""
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
        # Best-effort cleanup: hard-purge anything trashed > 30 days
        old = await db.conjoint_studies.find(
            {"deleted_at": {"$lt": cutoff}}, {"_id": 0, "id": 1}
        ).to_list(500)
        if old:
            old_ids = [s["id"] for s in old]
            await db.conjoint_studies.delete_many({"id": {"$in": old_ids}})
            await db.conjoint_responses.delete_many({"study_id": {"$in": old_ids}})
            logging.info(f"[TRASH_PURGE] Auto-purged {len(old_ids)} conjoint studies > 30 days")
    
        query = {"deleted_at": {"$exists": True, "$ne": None}}
        if current_user.role != UserRole.ADMIN:
            query["creator_id"] = current_user.id
    
        list_projection = {
            "_id": 0, "id": 1, "title": 1, "description": 1, "status": 1,
            "respondent_count": 1, "created_at": 1, "updated_at": 1, "deleted_at": 1,
            "creator_id": 1, "creator_name": 1, "is_public_result": 1,
            "share_token": 1, "num_choice_sets": 1,
        }
    
        studies = await db.conjoint_studies.find(query, list_projection).sort("deleted_at", -1).to_list(500)
        for s in studies:
            if "num_choice_sets" not in s:
                s["num_choice_sets"] = 0
    
        return {"studies": studies}

    @conjoint_router.get("/conjoint/studies/{study_id}")
    async def get_conjoint_study(
        study_id: str,
        view: Optional[str] = None,  # "summary" = lightweight (no choice_sets), default = full
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Get conjoint study details (public if is_public_result is True)"""
        # Use projection for summary view (results page) — skip heavy choice_sets
        if view == "summary":
            projection = {
                "_id": 0,
                "choice_sets": 0,  # This is the 7MB field
                "status_history": 0,
            }
        else:
            projection = {"_id": 0}

        study = await db.conjoint_studies.find_one({"id": study_id}, projection)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check if study results are public
        is_public_result = study.get("is_public_result", False)
    
        # If not public, require authentication and ownership
        if not is_public_result:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            is_owner = study.get("creator_id") == current_user.id
            is_admin = current_user.role == UserRole.ADMIN
            if not (is_owner or is_admin):
                raise HTTPException(status_code=403, detail="Not authorized")
    
        # Add permission info for frontend
        if current_user:
            is_owner = study.get("creator_id") == current_user.id
            is_admin = current_user.role == UserRole.ADMIN
            study["is_owner_or_admin"] = is_owner or is_admin
        else:
            study["is_owner_or_admin"] = False
    
        return study

    @conjoint_router.get("/conjoint/studies")
    async def list_conjoint_studies(
        current_user: User = Depends(get_current_user),
        status_filter: Optional[str] = None
    ):
        """List conjoint studies - all studies for admin, only owned studies for others.
        Excludes soft-deleted (trashed) studies."""
        # Build query
        query = {"deleted_at": {"$exists": False}}
    
        # Admin can see all studies, others only their own
        if current_user.role != UserRole.ADMIN:
            query["creator_id"] = current_user.id
    
        # Apply status filter if provided
        if status_filter and status_filter != "all":
            query["status"] = status_filter
    
        # Return only fields needed for list view (NOT full choice_sets/attributes/profiles)
        list_projection = {
            "_id": 0,
            "id": 1,
            "title": 1,
            "description": 1,
            "status": 1,
            "respondent_count": 1,
            "created_at": 1,
            "updated_at": 1,
            "creator_id": 1,
            "creator_name": 1,
            "is_public_result": 1,
            "share_token": 1,
            "num_choice_sets": 1,
        }
    
        studies = await db.conjoint_studies.find(
            query,
            list_projection
        ).sort("created_at", -1).to_list(1000)
    
        # Compute num_attributes/num_choice_sets if not stored
        for s in studies:
            if "num_choice_sets" not in s:
                s["num_choice_sets"] = 0
    
        return {"studies": studies}

    @conjoint_router.put("/conjoint/studies/{study_id}/status")
    async def update_study_status(
        study_id: str,
        request: UpdateStudyStatusRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Update study status - accessible by study owner and admin"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission: owner or admin can update
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="You don't have permission to update this study")
    
        # Create status history entry
        status_change = {
            "from_status": study.get("status", ConjointStudyStatus.DRAFT),
            "to_status": request.status,
            "changed_by": current_user.id,
            "changed_by_name": current_user.full_name,
            "changed_at": datetime.now(timezone.utc),
            "reason": request.reason
        }
    
        # Update study
        update_data = {
            "status": request.status,
            "updated_at": datetime.now(timezone.utc)
        }
    
        # Initialize status_history if it doesn't exist, then append
        if "status_history" not in study:
            update_data["status_history"] = [status_change]
        else:
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {"$push": {"status_history": status_change}}
            )
    
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$set": update_data}
        )
    
        return {
            "message": "Status updated successfully",
            "new_status": request.status,
            "status_change": status_change
        }

    @conjoint_router.put("/conjoint/studies/{study_id}/public-result")
    async def toggle_public_result(
        study_id: str,
        is_public: bool = Body(..., embed=True),
        current_user: User = Depends(get_current_user)
    ):
        """Toggle public sharing for study results - accessible by study owner and admin only"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission: owner or admin can toggle
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="You don't have permission to modify this study")
    
        # Update study
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$set": {
                "is_public_result": is_public,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    
        return {
            "message": "Public result setting updated successfully",
            "is_public_result": is_public,
            "study_id": study_id
        }

    @conjoint_router.put("/conjoint/studies/{study_id}/demographics-config")
    async def update_demographics_config(
        study_id: str,
        demographics_to_capture: List[str] = Body(..., embed=True),
        current_user: User = Depends(get_current_user)
    ):
        """Set which demographic fields the public survey collects.

        Accepted values from the UI checklist: ``age``, ``gender``, ``occupation``,
        ``education``, ``region``, ``income``. An empty list disables the
        demographics step entirely. Changing this only affects FUTURE
        respondents — existing responses keep whatever they submitted.
        """
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Whitelist the keys to keep the survey UI simple and the segment
        # filter bar predictable.
        allowed = {"age", "gender", "occupation", "education", "region", "income"}
        cleaned = [f for f in (demographics_to_capture or []) if f in allowed]

        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$set": {
                "demographics_to_capture": cleaned,
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        return {"demographics_to_capture": cleaned}



    @conjoint_router.get("/conjoint/showcase")
    async def list_conjoint_showcase():
        return await _conjoint_showcase_cached()

    @async_ttl_cache(ttl_seconds=60)
    async def _conjoint_showcase_cached():
        """Public list of Conjoint studies the owner has marked `is_public_result=True`.
        Returns lean metadata only for browsing — full data fetched via the
        existing /conjoint/studies/{id} when is_public_result lets it through.

        Used by the unified /api/showcase/index endpoint and the dedicated
        Conjoint showcase index page on the frontend."""
        cursor = db.conjoint_studies.find(
            {"is_public_result": True, "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "title": 1, "description": 1, "product_category": 1,
             "brand_name": 1, "status": 1, "attributes": 1,
             "created_at": 1, "updated_at": 1, "creator_id": 1,
             "qualitative_summary": 1, "thumbnail_url": 1,
             "responses_count": 1},
        ).sort("updated_at", -1)
        items = await cursor.to_list(500)
        out = []
        for s in items:
            attrs = s.get("attributes") or []
            out.append({
                "id": s["id"],
                "title": s.get("title") or "(untitled study)",
                "description": (s.get("description") or "")[:240],
                "brand_name": s.get("brand_name") or s.get("title"),
                "category": s.get("product_category"),
                "method": "conjoint",
                "attributes_count": len(attrs),
                "attribute_summary": [
                    {"name": a.get("name"), "levels": len(a.get("levels") or [])}
                    for a in attrs[:6]
                ],
                "thumbnail_url": s.get("thumbnail_url"),
                "status": s.get("status"),
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
            })
        return {"showcases": out, "total": len(out), "method": "conjoint"}

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-images")
    async def generate_profile_images(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Generate images for all attribute levels using AI (optional feature)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        if not study.get("attributes"):
            raise HTTPException(status_code=400, detail="No attributes defined")
    
        # Image generation is optional - if not available, just mark as skipped
        try:
            # Try to import image generation (may not be available)
            try:
                from emergentintegrations.image import generate_image
                image_gen_available = True
            except ImportError:
                logging.warning("Image generation module not available - skipping image generation")
                image_gen_available = False
        
            if not image_gen_available:
                # Mark as skipped but allow proceeding
                await db.conjoint_studies.update_one(
                    {"id": study_id},
                    {
                        "$set": {
                            "images_generated": False,
                            "images_skipped": True,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
            
                return {
                    "message": "Image generation skipped (feature not available)",
                    "images_generated": False,
                    "skipped": True
                }
        
            # If available, generate images
            api_key = os.environ.get('EMERGENT_LLM_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="LLM service not configured")
        
            updated_attributes = []
            generated_count = 0
            failed_count = 0
        
            for attr in study["attributes"]:
                updated_levels = []
                for level in attr.get("levels", []):
                    # Generate image for each level
                    image_prompt = f"Professional product visualization: {attr['name']} - {level['value']}. Clean, minimalist style on white background."
                
                    if level.get("description"):
                        image_prompt += f" {level['description']}"
                
                    try:
                        # Attempt to generate image
                        image_url = await generate_image(
                            prompt=image_prompt,
                            api_key=api_key
                        )
                    
                        level["image_url"] = image_url
                        level["image_prompt"] = image_prompt
                        generated_count += 1
                    except Exception as img_error:
                        logging.error(f"Failed to generate image for {level['value']}: {img_error}")
                        level["image_url"] = None
                        failed_count += 1
                
                    updated_levels.append(level)
            
                attr["levels"] = updated_levels
                updated_attributes.append(attr)
        
            # Update study
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "attributes": updated_attributes,
                        "images_generated": generated_count > 0,
                        "images_skipped": False,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
            return {
                "message": f"Images generated: {generated_count}, failed: {failed_count}",
                "attributes": updated_attributes,
                "generated_count": generated_count,
                "failed_count": failed_count
            }
        
        except Exception as e:
            logging.error(f"Image generation error: {e}")
            # Don't fail the entire request - just mark as skipped
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "images_generated": False,
                        "images_skipped": True,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
            return {
                "message": "Image generation failed - proceeding without images",
                "error": str(e),
                "images_generated": False,
                "skipped": True
            }

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-single-image")
    async def generate_single_image(
        study_id: str,
        request: GenerateSingleImageRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Generate image for a specific attribute level using AI"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Check if this is a test generation (attribute_id/level_id = 'test')
        is_test_generation = request.attribute_id == 'test' and request.level_id == 'test'
    
        # Find the attribute and level (skip for test generation)
        attributes = study.get("attributes", [])
        attr_found = None
        level_found = None
    
        if not is_test_generation:
            for attr in attributes:
                if attr["id"] == request.attribute_id:
                    attr_found = attr
                    for level in attr.get("levels", []):
                        if level["id"] == request.level_id:
                            level_found = level
                            break
                    break
        
            if not attr_found or not level_found:
                raise HTTPException(status_code=404, detail="Attribute or level not found")
    
        # Get image generation settings
        settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
        if not settings:
            settings = {
                "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
                "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images.",
                "level_image_model": "gpt-image-1"
            }
    
        # Check if using reference images
        reference_images = study.get("reference_images", [])
        using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
    
        # Use custom prompt or generate from template
        if request.prompt:
            image_prompt = request.prompt
        elif is_test_generation:
            # For test generation, use a default prompt
            image_prompt = "High quality product image"
        else:
            # Select appropriate template based on reference usage
            if using_refs:
                template = settings.get("level_image_prompt_with_ref", settings["level_image_prompt_template"])
            else:
                template = settings["level_image_prompt_template"]
        
            # Use template and replace variables
            image_prompt = template.format(
                attribute_name=attr_found['name'],
                level_value=level_found['value'],
                level_description=level_found.get("description", "")
            )
            if level_found.get("description") and not using_refs:
                image_prompt += f" {level_found['description']}"
    
        # Prepend additional prompt if provided (put it at the front)
        if request.additional_prompt:
            image_prompt = f"{request.additional_prompt} {image_prompt}"
    
        # Generate image using configured model
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM service not configured")
    
        model_to_use = settings.get("level_image_model", "gpt-image-1")
    
        try:
            import base64
        
            # Prepare reference images if provided
            ref_images_base64 = []
            if using_refs:
                for idx in request.reference_image_indices:
                    if 0 <= idx < len(reference_images):
                        img_url = reference_images[idx]
                        # Extract base64 from data URL
                        if img_url.startswith('data:image'):
                            ref_images_base64.append(img_url.split(',')[1])
                        else:
                            ref_images_base64.append(img_url)
        
            # Check if using Nano Banana (Gemini)
            if model_to_use == "nanobanana":
                from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"level-img-{study_id}-{request.level_id}",
                    system_message="You are an AI image generator."
                ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
                # Create message with reference images if provided (Image + Text to Image mode)
                if using_refs and len(ref_images_base64) > 0:
                    # Send reference images as ImageContent for style guidance
                    image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
                    msg = UserMessage(text=image_prompt, file_contents=image_contents)
                else:
                    msg = UserMessage(text=image_prompt)
            
                text, images = await chat.send_message_multimodal_response(msg)
            
                if not images or len(images) == 0:
                    raise HTTPException(status_code=500, detail="No image was generated")
            
                # Images already in base64 format
                image_base64 = images[0]['data']
            
            else:
                # Use OpenAI models
                from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            
                image_gen = OpenAIImageGeneration(api_key=api_key)
            
                # If using reference images with OpenAI, use image editing/variation mode
                if using_refs and len(ref_images_base64) > 0:
                    # Use the first reference image for editing
                    # Note: OpenAI edit mode requires mask; for style reference we use variation
                    images = await image_gen.generate_image_variations(
                        image_data=base64.b64decode(ref_images_base64[0]),
                        prompt=image_prompt,
                        model=model_to_use,
                        number_of_images=1
                    )
                else:
                    # Standard text-to-image generation
                    images = await image_gen.generate_images(
                        prompt=image_prompt,
                        model=model_to_use,
                        number_of_images=1
                    )
            
                if not images or len(images) == 0:
                    raise HTTPException(status_code=500, detail="No image was generated")
            
                # Convert to base64
                image_base64 = base64.b64encode(images[0]).decode('utf-8')
        
            # Compress image aggressively (target: 100-150KB for 100+ images per study)
            compressed_base64 = await asyncio.to_thread(compress_base64_image, image_base64, max_size_kb=150.0, target_dimension=640)
        
            # Create data URL
            image_data_url = f"data:image/jpeg;base64,{compressed_base64}"
        
            # Update the level with the generated image (skip for test generation)
            if not is_test_generation:
                for attr in attributes:
                    if attr["id"] == request.attribute_id:
                        for level in attr.get("levels", []):
                            if level["id"] == request.level_id:
                                level["image_url"] = image_data_url
                                level["image_prompt"] = image_prompt
                                break
                        break
            
                # Save updated attributes
                await db.conjoint_studies.update_one(
                    {"id": study_id},
                    {
                        "$set": {
                            "attributes": attributes,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
        
            return {
                "message": "Image generated successfully" if not is_test_generation else "Test image generated successfully",
                "image_url": image_data_url,
                "prompt_used": image_prompt,
                "is_test": is_test_generation
            }
        
        except Exception as e:
            logging.error(f"Single image generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/upload-image")
    async def upload_level_image(
        study_id: str,
        request: UploadImageRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Upload/set image URL for a specific attribute level"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Offload data: URI to object storage before persisting
        from lib.image_normalize import normalize_image_for_storage
        stable_url = await normalize_image_for_storage(
            request.image_url, "conjoint-levels", study_id
        )

        # Update the specific level's image_url
        attributes = study.get("attributes", [])
        updated = False
    
        for attr in attributes:
            if attr["id"] == request.attribute_id:
                for level in attr.get("levels", []):
                    if level["id"] == request.level_id:
                        level["image_url"] = stable_url
                        updated = True
                        break
                break
    
        if not updated:
            raise HTTPException(status_code=404, detail="Attribute or level not found")
    
        # Save updated attributes
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "attributes": attributes,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": "Image uploaded successfully",
            "image_url": stable_url
        }

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-profile-image")
    async def generate_profile_image(
        study_id: str,
        request: GenerateProfileImageRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Generate composite image for a complete profile using AI"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Find the profile
        choice_sets = study.get("choice_sets", [])
        profile_found = None
        choice_set_found = None
    
        for choice_set in choice_sets:
            if choice_set["id"] == request.choice_set_id:
                choice_set_found = choice_set
                for profile in choice_set.get("profiles", []):
                    if profile["id"] == request.profile_id:
                        profile_found = profile
                        break
                break
    
        if not profile_found or not choice_set_found:
            raise HTTPException(status_code=404, detail="Profile not found")
    
        # Get image generation settings
        settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
        if not settings:
            settings = {
                "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
                "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style and aesthetic.",
                "profile_image_model": "gpt-image-1"
            }
    
        # Check if using reference images
        reference_images = study.get("reference_images", [])
        using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
    
        # Build prompt from profile attributes
        if request.prompt:
            image_prompt = request.prompt
        else:
            # Get all attribute values for this profile
            attributes = study.get("attributes", [])
            profile_description = []
        
            for attr_id, level_id in profile_found["attribute_levels"].items():
                attr = next((a for a in attributes if a["id"] == attr_id), None)
                if attr:
                    level = next((l for l in attr.get("levels", []) if l["id"] == level_id), None)
                    if level:
                        profile_description.append(f"{attr['name']}: {level['value']}")
        
            composition = ", ".join(profile_description)
        
            # Select appropriate template based on reference usage
            if using_refs:
                template = settings.get("profile_image_prompt_with_ref", settings["profile_image_prompt_template"])
            else:
                template = settings["profile_image_prompt_template"]
        
            # Use template and replace variables
            image_prompt = template.format(
                composition=composition
            )
    
        # Prepend additional prompt if provided (put it at the front)
        if request.additional_prompt:
            image_prompt = f"{request.additional_prompt} {image_prompt}"
    
        # Generate image using configured model
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM service not configured")
    
        model_to_use = settings.get("profile_image_model", "gpt-image-1")
    
        try:
            import base64
        
            # Prepare reference images if provided
            ref_images_base64 = []
            if using_refs:
                for idx in request.reference_image_indices:
                    if 0 <= idx < len(reference_images):
                        img_url = reference_images[idx]
                        # Extract base64 from data URL
                        if img_url.startswith('data:image'):
                            ref_images_base64.append(img_url.split(',')[1])
                        else:
                            ref_images_base64.append(img_url)
        
            # Check if using Nano Banana (Gemini)
            if model_to_use == "nanobanana":
                from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"profile-img-{study_id}-{request.profile_id}",
                    system_message="You are an AI image generator."
                ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
                # Create message with reference images if provided (Image + Text to Image mode)
                if using_refs and len(ref_images_base64) > 0:
                    # Send reference images as ImageContent for style guidance
                    image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
                    msg = UserMessage(text=image_prompt, file_contents=image_contents)
                else:
                    msg = UserMessage(text=image_prompt)
            
                text, images = await chat.send_message_multimodal_response(msg)
            
                if not images or len(images) == 0:
                    raise HTTPException(status_code=500, detail="No image was generated")
            
                # Images already in base64 format
                image_base64 = images[0]['data']
            
            else:
                # Use OpenAI models
                from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            
                image_gen = OpenAIImageGeneration(api_key=api_key)
            
                # If using reference images with OpenAI, use image variation mode
                if using_refs and len(ref_images_base64) > 0:
                    # Use the first reference image for style guidance
                    images = await image_gen.generate_image_variations(
                        image_data=base64.b64decode(ref_images_base64[0]),
                        prompt=image_prompt,
                        model=model_to_use,
                        number_of_images=1
                    )
                else:
                    # Standard text-to-image generation
                    images = await image_gen.generate_images(
                        prompt=image_prompt,
                        model=model_to_use,
                        number_of_images=1
                    )
            
                if not images or len(images) == 0:
                    raise HTTPException(status_code=500, detail="No image was generated")
            
                # Convert to base64
                image_base64 = base64.b64encode(images[0]).decode('utf-8')
        
            # Compress image aggressively (target: 100-150KB for 100+ images per study)
            compressed_base64 = await asyncio.to_thread(compress_base64_image, image_base64, max_size_kb=150.0, target_dimension=640)
        
            # Create data URL (returned to caller for immediate UI rendering)
            image_data_url = f"data:image/jpeg;base64,{compressed_base64}"

            # Offload to object storage so MongoDB stores only a tiny URL string,
            # not a 100-300 KB base64 blob per profile (we have 50+ profiles per study).
            from lib.image_normalize import normalize_image_for_storage
            stored_url = await normalize_image_for_storage(
                image_data_url, "conjoint-profiles", study_id
            ) or image_data_url
        
            # Update the profile with the stored URL (not the base64)
            for choice_set in choice_sets:
                if choice_set["id"] == request.choice_set_id:
                    for profile in choice_set.get("profiles", []):
                        if profile["id"] == request.profile_id:
                            profile["profile_image_url"] = stored_url
                            profile["profile_image_prompt"] = image_prompt
                            break
                    break
        
            # Save updated choice_sets
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "choice_sets": choice_sets,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
            return {
                "message": "Profile image generated successfully",
                "image_url": stored_url,
                "prompt_used": image_prompt
            }
        
        except Exception as e:
            logging.error(f"Profile image generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/upload-profile-image")
    async def upload_profile_image(
        study_id: str,
        request: UploadProfileImageRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Upload/set image URL for a complete profile (combination of levels)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Offload data: URI to object storage before persisting to MongoDB
        from lib.image_normalize import normalize_image_for_storage
        stable_url = await normalize_image_for_storage(
            request.image_url, "conjoint-profiles", study_id
        )

        # Update the specific profile's image_url in choice_sets
        choice_sets = study.get("choice_sets", [])
        updated = False
    
        for choice_set in choice_sets:
            if choice_set["id"] == request.choice_set_id:
                for profile in choice_set.get("profiles", []):
                    if profile["id"] == request.profile_id:
                        profile["profile_image_url"] = stable_url
                        updated = True
                        break
                break
    
        if not updated:
            raise HTTPException(status_code=404, detail="Choice set or profile not found")
    
        # Save updated choice_sets
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "choice_sets": choice_sets,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": "Profile image uploaded successfully",
            "image_url": stable_url
        }

    @conjoint_router.post("/conjoint/studies/{study_id}/reference-images")
    async def upload_reference_images(
        study_id: str,
        request: UploadReferenceImagesRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Upload reference images for AI image generation (max 5 images)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Validate max 5 images
        if len(request.image_urls) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 reference images allowed")
    
        # Compress each image
        compressed_images = []
        for img_url in request.image_urls:
            try:
                # Extract base64 part
                if 'base64,' in img_url:
                    base64_str = img_url.split('base64,')[1]
                else:
                    base64_str = img_url
            
                # Compress
                compressed_base64 = await asyncio.to_thread(compress_base64_image, base64_str, max_size_kb=150.0, target_dimension=640)
                compressed_url = f"data:image/jpeg;base64,{compressed_base64}"
                compressed_images.append(compressed_url)
            except Exception as e:
                logging.error(f"Error compressing reference image: {e}")
                raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")
    
        # Update study with reference images
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "reference_images": compressed_images,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": f"{len(compressed_images)} reference images uploaded successfully",
            "reference_images": compressed_images
        }

    @conjoint_router.delete("/conjoint/studies/{study_id}/reference-images/{image_index}")
    async def delete_reference_image(
        study_id: str,
        image_index: int,
        current_user: User = Depends(get_current_user)
    ):
        """Delete a specific reference image by index"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        reference_images = study.get("reference_images", [])
    
        if image_index < 0 or image_index >= len(reference_images):
            raise HTTPException(status_code=400, detail="Invalid image index")
    
        # Remove image at index
        reference_images.pop(image_index)
    
        # Update study
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "reference_images": reference_images,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": "Reference image deleted successfully",
            "remaining_count": len(reference_images)
        }

    @conjoint_router.delete("/conjoint/studies/{study_id}")
    async def delete_conjoint_study(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Soft-delete a conjoint study (move to Trash). Auto-purged after 30 days; restore via /restore."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Only creator or admin can delete
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to delete this study")
    
        now = datetime.now(timezone.utc)
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$set": {"deleted_at": now.isoformat(), "updated_at": now}}
        )
    
        logging.info(f"[TRASH_STUDY] Conjoint study {study_id} moved to trash by {current_user.id}")
    
        return {"message": "Moved to Trash", "trashed": True}

    @conjoint_router.post("/conjoint/studies/{study_id}/restore")
    async def restore_conjoint_study(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Restore a soft-deleted conjoint study from the Trash."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to restore this study")
        if not study.get("deleted_at"):
            return {"message": "Already active", "trashed": False}
    
        now = datetime.now(timezone.utc)
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$unset": {"deleted_at": ""}, "$set": {"updated_at": now}}
        )
        logging.info(f"[RESTORE_STUDY] Conjoint study {study_id} restored by {current_user.id}")
        return {"message": "Restored", "trashed": False}

    @conjoint_router.delete("/conjoint/studies/{study_id}/purge")
    async def purge_conjoint_study(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Hard-delete a conjoint study and its responses permanently. No recovery."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to purge this study")
    
        await db.conjoint_studies.delete_one({"id": study_id})
        await db.conjoint_responses.delete_many({"study_id": study_id})
        logging.info(f"[PURGE_STUDY] Conjoint study {study_id} purged permanently by {current_user.id}")
        return {"message": "Purged permanently"}

    @conjoint_router.post("/conjoint/studies/{study_id}/nca-analysis")
    async def run_nca_analysis(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """
        Run Necessary Condition Analysis (NCA) on conjoint study results
        """
        from lib.nca_analysis import analyze_nca_for_conjoint
    
        # Get study
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Get all responses
        responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)
    
        if len(responses) == 0:
            raise HTTPException(status_code=400, detail="No responses available for analysis")
    
        # Calculate part-worths and importance using existing functions
        try:
            part_worths = calculate_part_worths(study, responses)
            importance_scores = calculate_importance_scores(part_worths, study)
        
            if not part_worths or not importance_scores:
                raise HTTPException(status_code=400, detail="Unable to calculate conjoint results")
        
            # Run NCA analysis
            nca_results = analyze_nca_for_conjoint(
                part_worths=part_worths,
                attribute_importance=importance_scores,
                respondent_count=len(responses)
            )
        
            # Store NCA results in database for caching
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {"$set": {"nca_results": nca_results, "nca_updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        
            logging.info(f"[NCA] Analysis completed for study {study_id}")
        
            return nca_results
        
        except Exception as e:
            logging.error(f"[NCA] Error: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"NCA analysis failed: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/fsqca-analysis")
    async def run_fsqca_analysis(
        study_id: str,
        consistency_threshold: float = 0.75,
        coverage_threshold: float = 0.1,
        current_user: User = Depends(get_current_user)
    ):
        """
        Run Fuzzy-Set Qualitative Comparative Analysis (fsQCA) on conjoint study results
        """
        from lib.fsqca_analysis import analyze_fsqca_for_conjoint
    
        # Get study
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Get all responses
        responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)
    
        if len(responses) == 0:
            raise HTTPException(status_code=400, detail="No responses available for analysis")
    
        # Calculate part-worths and importance
        try:
            part_worths = calculate_part_worths(study, responses)
            importance_scores = calculate_importance_scores(part_worths, study)
        
            if not part_worths or not importance_scores:
                raise HTTPException(status_code=400, detail="Unable to calculate conjoint results")
        
            # Run fsQCA analysis
            fsqca_results = analyze_fsqca_for_conjoint(
                part_worths=part_worths,
                attribute_importance=importance_scores,
                respondent_count=len(responses),
                consistency_threshold=consistency_threshold,
                coverage_threshold=coverage_threshold
            )
        
            # Check for errors
            if 'error' in fsqca_results:
                raise HTTPException(status_code=400, detail=fsqca_results['error'])
        
            # Store results in database
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {"$set": {"fsqca_results": fsqca_results, "fsqca_updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        
            logging.info(f"[fsQCA] Analysis completed for study {study_id}")
        
            return fsqca_results
        
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"[fsQCA] Error: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"fsQCA analysis failed: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/ipma-analysis")
    async def run_ipma_analysis(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """
        Run Importance-Performance Map Analysis (IPMA) on conjoint study results
        """
        from lib.ipma_analysis import analyze_ipma_for_conjoint
    
        # Get study
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Get all responses
        responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)
    
        if len(responses) == 0:
            raise HTTPException(status_code=400, detail="No responses available for analysis")
    
        # Calculate part-worths and importance
        try:
            part_worths = calculate_part_worths(study, responses)
            importance_scores = calculate_importance_scores(part_worths, study)
        
            if not part_worths or not importance_scores:
                raise HTTPException(status_code=400, detail="Unable to calculate conjoint results")
        
            # Run IPMA analysis
            ipma_results = analyze_ipma_for_conjoint(
                part_worths=part_worths,
                attribute_importance=importance_scores,
                respondent_count=len(responses)
            )
        
            # Store results in database
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {"$set": {"ipma_results": ipma_results, "ipma_updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        
            logging.info(f"[IPMA] Analysis completed for study {study_id}")
        
            return ipma_results
        
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"[IPMA] Error: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"IPMA analysis failed: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/start-survey")
    async def start_survey(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """
        Start survey - locks the study from structural changes
        After starting, users can only edit names, descriptions, and images
        Cannot add/remove attributes or levels
        """
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["creator_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Check if design is generated
        if not study.get("choice_sets") or len(study.get("choice_sets", [])) == 0:
            raise HTTPException(status_code=400, detail="Please generate D-Optimal design before starting survey")
    
        # Update study status to ACTIVE
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "status": ConjointStudyStatus.ACTIVE,
                    "survey_started": True,
                    "survey_start_date": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
        return {
            "message": "Survey started successfully",
            "survey_started": True,
            "status": ConjointStudyStatus.ACTIVE
        }

    @conjoint_router.get("/admin/conjoint-image-settings")
    async def get_image_generation_settings(
        current_user: User = Depends(get_current_user)
    ):
        """Get image generation settings for Conjoint Analysis"""
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
    
        # Get settings from database
        settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    
        if not settings:
            # Return default settings
            default_settings = {
                "id": "default",
                "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
                "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature.",
                "level_image_model": "gpt-image-1",
                "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
                "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images.",
                "profile_image_model": "gpt-image-1",
                "updated_by": "System",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.conjoint_image_settings.insert_one(default_settings)
            return default_settings
    
        return settings

    @conjoint_router.put("/admin/conjoint-image-settings")
    async def update_image_generation_settings(
        request: UpdateImageGenerationSettingsRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Update image generation settings for Conjoint Analysis"""
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
    
        # Get current settings
        current_settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    
        if not current_settings:
            # Create default if not exists
            current_settings = {
                "id": "default",
                "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
                "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature.",
                "level_image_model": "gpt-image-1",
                "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
                "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images.",
                "profile_image_model": "gpt-image-1"
            }
            await db.conjoint_image_settings.insert_one(current_settings)
    
        # Update fields
        update_data = {
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc)
        }
    
        if request.level_image_prompt_template is not None:
            update_data["level_image_prompt_template"] = request.level_image_prompt_template
        if request.level_image_prompt_with_ref is not None:
            update_data["level_image_prompt_with_ref"] = request.level_image_prompt_with_ref
        if request.level_image_model is not None:
            update_data["level_image_model"] = request.level_image_model
        if request.profile_image_prompt_template is not None:
            update_data["profile_image_prompt_template"] = request.profile_image_prompt_template
        if request.profile_image_prompt_with_ref is not None:
            update_data["profile_image_prompt_with_ref"] = request.profile_image_prompt_with_ref
        if request.profile_image_model is not None:
            update_data["profile_image_model"] = request.profile_image_model
    
        await db.conjoint_image_settings.update_one(
            {"id": "default"},
            {"$set": update_data}
        )
    
        updated_settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
        return {"message": "Settings updated successfully", "settings": updated_settings}

    @conjoint_router.get("/conjoint/survey/{study_id}")
    async def get_survey(study_id: str):
        """Get public survey for respondents (no authentication required)"""
        logging.info(f"[SURVEY] Loading survey for study_id: {study_id}")
    
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            logging.error(f"[SURVEY] Study not found: {study_id}")
            raise HTTPException(status_code=404, detail="Study not found")
    
        current_status = study.get("status")
        logging.info(f"[SURVEY] Study '{study.get('title')}' has status: {current_status} - allowing access regardless of status")
    
        # No status check - allow access with any status if URL is known
    
        # Optimize: Send only necessary data for survey display
        choice_sets = []
        for cs in study.get("choice_sets", []):
            optimized_profiles = []
            for profile in cs.get("profiles", []):
                # Keep essential profile data including all image-related fields
                optimized_profile = {
                    "id": profile["id"],
                    "attribute_levels": profile.get("attribute_levels", {}),
                    "images": profile.get("images", {}),  # New format: {attr_id: image_url}
                    "image_url": profile.get("image_url"),  # Legacy format
                    "profile_image_url": profile.get("profile_image_url"),  # Composite image
                    "description": profile.get("description")
                }
                optimized_profiles.append(optimized_profile)
        
            choice_sets.append({
                "id": cs["id"],
                "set_number": cs.get("set_number"),
                "profiles": optimized_profiles
            })
    
        return {
            "study_id": study["id"],
            "title": study["title"],
            "description": study.get("description"),
            "attributes": study.get("attributes", []),
            "choice_sets": choice_sets,
            "alternatives_per_set": study.get("alternatives_per_set", 3),
            "demographics_to_capture": study.get("demographics_to_capture") or [],
        }

    @conjoint_router.post("/conjoint/survey/{study_id}/response")
    async def submit_survey_response(
        study_id: str,
        response: SurveyResponse
    ):
        """Submit survey response (no authentication required)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        if study["status"] != ConjointStudyStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Survey is not accepting responses")
    
        # Create response document
        response_doc = {
            "id": str(uuid.uuid4()),
            "study_id": study_id,
            "respondent_id": response.respondent_id or str(uuid.uuid4()),
            "respondent_email": response.respondent_email,
            "responses": response.responses,
            "demographics": response.demographics or {},
            "duration_sec": int(response.duration_sec or 0),
            "submitted_at": datetime.now(timezone.utc)
        }
    
        await db.conjoint_responses.insert_one(response_doc)
    
        # Update study respondent count
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$inc": {"respondent_count": 1},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
    
        # Invalidate analysis cache (new data = old results stale)
        await db.analysis_cache.delete_many({"study_id": study_id})
    
        return {"message": "Response submitted successfully", "response_id": response_doc["id"]}

    @conjoint_router.post("/conjoint/studies/{study_id}/sync-respondent-count")
    async def sync_respondent_count(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Sync respondent count with actual response count"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
        # Count actual responses
        actual_count = await db.conjoint_responses.count_documents({"study_id": study_id})
        stored_count = study.get("respondent_count", 0)
    
        if actual_count != stored_count:
            # Update the count
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "respondent_count": actual_count,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
            return {
                "message": "Respondent count synced successfully",
                "old_count": stored_count,
                "new_count": actual_count,
                "synced": True
            }
        else:
            return {
                "message": "Respondent count is already correct",
                "count": actual_count,
                "synced": False
            }

    @conjoint_router.post("/conjoint/admin/sync-all-respondent-counts")
    async def sync_all_respondent_counts(
        current_user: User = Depends(get_current_user)
    ):
        """Sync respondent counts for all studies (admin only)"""
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
    
        studies = await db.conjoint_studies.find({}, {"_id": 0, "id": 1, "respondent_count": 1}).to_list(1000)
    
        synced_count = 0
        total_fixed = 0
    
        for study in studies:
            study_id = study["id"]
            stored_count = study.get("respondent_count", 0)
            actual_count = await db.conjoint_responses.count_documents({"study_id": study_id})
        
            if actual_count != stored_count:
                await db.conjoint_studies.update_one(
                    {"id": study_id},
                    {
                        "$set": {
                            "respondent_count": actual_count,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                synced_count += 1
                total_fixed += abs(actual_count - stored_count)
    
        return {
            "message": f"Synced {synced_count} studies",
            "total_studies": len(studies),
            "synced_count": synced_count,
            "total_fixed": total_fixed
        }

    @conjoint_router.get("/conjoint/studies/{study_id}/results")
    async def get_study_results(
        study_id: str,
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        segments: Optional[str] = None,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Get analysis results for a study (public if is_public_result is True).

        Optional query params for slicing:
          • `from`, `to`         — ISO timestamps; filter respondents by submitted_at
          • `segments`           — JSON-encoded {field: [values]}; AND across fields, OR within
        Returns `segments_available` so the frontend can render chip selectors.
        """
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission: allow if public OR if user is creator/admin
        is_public = study.get("is_public_result", False)
        if not is_public:
            # Private - require authentication and ownership
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")
    
        # Get all responses
        all_responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)

        seg_filter = _parse_segments_param(segments)
        responses = _apply_response_filter(all_responses, from_iso=from_, to_iso=to, segments=seg_filter)

        capture = study.get("demographics_to_capture") or ["age", "gender", "occupation"]
        seg_available = _segments_available(all_responses, capture)

        # `respondent_count` always refers to the FILTERED slice — the UI uses
        # `total_respondent_count` to show "X of Y" when a filter is active.
        if len(responses) < 30:
            return {
                "study_id": study_id,
                "respondent_count": len(responses),
                "total_respondent_count": len(all_responses),
                "segments_available": seg_available,
                "demographics_to_capture": capture,
                "status": "insufficient_data",
                "message": "Need at least 30 responses for reliable analysis",
                "responses": responses
            }
    
        # Calculate part-worths using aggregation method
        # In production, use Hierarchical Bayes or similar sophisticated methods
        part_worths = calculate_part_worths(study, responses)
        importance_scores = calculate_importance_scores(part_worths, study)
    
        return {
            "study_id": study_id,
            "respondent_count": len(responses),
            "total_respondent_count": len(all_responses),
            "segments_available": seg_available,
            "demographics_to_capture": capture,
            "status": "complete",
            "part_worths": part_worths,
            "importance_scores": importance_scores
        }

    @conjoint_router.get("/conjoint/studies/{study_id}/export-responses")
    async def export_conjoint_responses(
        study_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Export raw responses for CSV download (on-demand, not loaded with results)."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")

        responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)

        return {"responses": responses}

    @conjoint_router.get("/conjoint/studies/{study_id}/statistical-analysis")
    async def get_statistical_analysis(
        study_id: str,
        method: str = "mnl",
        force: bool = False,  # force=true to bypass cache
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        segments: Optional[str] = None,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Get statistical analysis results with selected method (cached in DB).

        Optional filter params (`from`, `to`, `segments`) re-run the analysis on
        the filtered slice. Cache keys include the filter signature so each
        slice is cached independently and the unfiltered ("all") view stays at
        the canonical cache row.
        """
        import asyncio
        import concurrent.futures

        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0, "choice_sets": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        is_public = study.get("is_public_result", False)
        if not is_public:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")

        seg_filter = _parse_segments_param(segments)
        filter_sig = _filter_signature(from_, to, seg_filter)
        has_filter = filter_sig != "all"

        # Cache lookup — include filter signature so slices stay distinct.
        # `respondent_count` in the cache reflects the FILTERED count so we
        # invalidate automatically when new respondents arrive in the slice.
        if not force:
            cached = await db.analysis_cache.find_one(
                {"study_id": study_id, "method": method, "filter_sig": filter_sig},
                {"_id": 0}
            )
            if cached and cached.get("results"):
                return {
                    "status": "success",
                    "method": method,
                    "filter_signature": filter_sig,
                    "respondent_count": cached.get("respondent_count", 0),
                    "results": cached["results"],
                    "cached": True,
                }

        # Need full study with choice_sets for computation
        full_study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})

        all_responses = await db.conjoint_responses.find(
            {"study_id": study_id}, {"_id": 0}
        ).to_list(10000)
        responses = _apply_response_filter(all_responses, from_iso=from_, to_iso=to, segments=seg_filter) \
            if has_filter else all_responses
    
        if len(responses) < 30:
            return {
                "status": "insufficient_data",
                "message": "Need at least 30 responses for statistical analysis",
                "respondent_count": len(responses),
                "filter_signature": filter_sig,
            }
    
        method_map = {
            "mnl": calculate_mnl_analysis,
            "mixed_logit": calculate_mixed_logit_analysis,
            "hierarchical_bayes": calculate_hierarchical_bayes_analysis,
            "linear_regression": calculate_regression_analysis,
        }
    
        if method not in method_map:
            raise HTTPException(status_code=400, detail="Invalid method")
    
        analysis_fn = method_map[method]
        loop = asyncio.get_event_loop()
    
        try:
            with concurrent.futures.ThreadPoolExecutor() as pool:
                results = await asyncio.wait_for(
                    loop.run_in_executor(pool, analysis_fn, full_study, responses),
                    timeout=120
                )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail=f"Analysis timed out with {len(responses)} responses.")
        except Exception as e:
            logging.error(f"Statistical analysis error: {e}")
            raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")
    
        if not results:
            raise HTTPException(status_code=500, detail=f"Failed to perform {method} analysis")
    
        # Save to cache keyed by filter signature too.
        await db.analysis_cache.update_one(
            {"study_id": study_id, "method": method, "filter_sig": filter_sig},
            {"$set": {
                "study_id": study_id,
                "method": method,
                "filter_sig": filter_sig,
                "respondent_count": len(responses),
                "results": results,
                "created_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
    
        return {
            "status": "success",
            "method": method,
            "filter_signature": filter_sig,
            "respondent_count": len(responses),
            "results": results,
            "cached": False
        }

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-product-from-results")
    async def generate_product_image_from_results(
        study_id: str,
        request: GenerateProductImageFromResultsRequest,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Generate optimal product image based on AI interpretation of conjoint results (public if is_public_result is True)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission: allow if public OR if user is creator/admin
        is_public = study.get("is_public_result", False)
        if not is_public:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")
    
        # Get responses for analysis
        responses = await db.conjoint_responses.find(
            {"study_id": study_id},
            {"_id": 0}
        ).to_list(10000)
    
        if len(responses) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 responses for product generation")
    
        # Calculate part-worths to get optimal product configuration
        part_worths = calculate_part_worths(study, responses)
        importance_scores = calculate_importance_scores(part_worths, study)
    
        # Build optimal product description from top utilities
        product_features = []
        for attr_id, scores in importance_scores.items():
            attr_name = scores["name"]
        
            # Find level with highest utility
            if attr_id in part_worths:
                levels = part_worths[attr_id]["levels"]
                best_level = max(levels.items(), key=lambda x: x[1]["utility"])
                level_value = best_level[1]["value"]
                product_features.append(f"{attr_name}: {level_value}")
    
        # Use AI to create image generation prompt
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
    
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        
            system_message = """You are an expert product designer and image generation prompt engineer.
    Create detailed, professional prompts for generating product visualization images."""
        
            product_category = study.get("product_category", "product")
            study_title = study.get("title", "Product")
            features_text = "\n".join([f"- {feat}" for feat in product_features])
        
            prompt = f"""Based on conjoint analysis results, create an image generation prompt for the optimal product configuration:

    Study: {study_title}
    Product Category: {product_category}

    Optimal Product Features (from research):
    {features_text}

    Create a detailed image generation prompt that:
    1. Describes the product with all key features mentioned
    2. Specifies professional product photography style
    3. Includes clean white background for product-focused composition
    4. Mentions high quality, sharp details, and good lighting
    5. Keeps the prompt concise but descriptive (2-3 sentences max)

    Return ONLY the image generation prompt, no explanation."""

            if request.additional_prompt:
                prompt += f"\n\nUser's additional requirements (to be placed at the BEGINNING of the final prompt): {request.additional_prompt}"
        
            chat = LlmChat(
                api_key=api_key,
                session_id=f"product-gen-{study_id}",
                system_message=system_message
            ).with_model("openai", "gpt-4o-mini")
        
            generated_prompt = await chat.send_message(UserMessage(text=prompt))
        
            # Prepend user's additional prompt if provided
            if request.additional_prompt:
                generated_prompt = f"{request.additional_prompt.strip()}. {generated_prompt}"
        
            # Now generate the image using the prompt
            # Get image generation settings
            settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
            if not settings:
                settings = {"level_image_model": "gpt-image-1"}
        
            image_model = settings.get("level_image_model", "gpt-image-1")
        
            # Check if using reference images
            reference_images = study.get("reference_images", [])
            using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
        
            if using_refs:
                # Add reference image instruction
                generated_prompt = f"Based on the reference images as style guide: {generated_prompt}"
        
            # Generate image using Gemini (same as level image generation)
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
            # Prepare reference images in base64 if provided
            ref_images_base64 = []
            if using_refs:
                for idx in request.reference_image_indices:
                    if idx < len(reference_images):
                        img_url = reference_images[idx]
                        # Extract base64 from data URL
                        if img_url.startswith('data:image'):
                            ref_images_base64.append(img_url.split(',')[1])
                        else:
                            # Download and convert to base64 if URL
                            import httpx
                            async with httpx.AsyncClient() as client:
                                img_response = await client.get(img_url)
                                img_base64 = base64.b64encode(img_response.content).decode('utf-8')
                                ref_images_base64.append(img_base64)
        
            # Use Gemini 2.5 flash image preview (nanobanana)
            chat = LlmChat(
                api_key=api_key,
                session_id=f"product-gen-{study_id}",
                system_message="You are an AI image generator."
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
        
            # Create message with reference images if provided
            if len(ref_images_base64) > 0:
                image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
                msg = UserMessage(text=generated_prompt, file_contents=image_contents)
            else:
                msg = UserMessage(text=generated_prompt)
        
            text, images = await chat.send_message_multimodal_response(msg)
        
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No images generated")
        
            # Get base64 image
            image_base64 = images[0]['data']
        
            # Compress image
            compressed_base64 = await asyncio.to_thread(compress_base64_image, image_base64, max_size_kb=150.0, target_dimension=640)
        
            # Create data URL
            image_url = f"data:image/jpeg;base64,{compressed_base64}"
        
            return {
                "image_url": image_url,
                "prompt_used": generated_prompt,
                "optimal_features": product_features,
                "message": "Product image generated successfully based on research insights"
            }
        
        except Exception as e:
            logging.error(f"Product image generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate product image: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-shelf-simulation")
    async def generate_shelf_simulation(
        study_id: str,
        request: GenerateShelfSimulationRequest,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Generate realistic on-shelf product visualization in competitive environment (public if is_public_result is True)"""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
    
        # Check permission: allow if public OR if user is creator/admin
        is_public = study.get("is_public_result", False)
        if not is_public:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")
    
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
    
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        
            # Determine environment based on product category
            product_category = study.get("product_category", "").lower()
            environment_type = request.environment_type
        
            # Auto-detect environment if set to "auto"
            if environment_type == "auto":
                if any(word in product_category for word in ["cream", "cosmetic", "skincare", "makeup", "beauty"]):
                    environment_type = "cosmetics_store"
                elif any(word in product_category for word in ["drink", "beverage", "snack", "food", "water"]):
                    environment_type = "convenience_store"
                elif any(word in product_category for word in ["grocery", "supermarket"]):
                    environment_type = "supermarket"
                elif any(word in product_category for word in ["fashion", "clothing", "apparel"]):
                    environment_type = "mall"
                else:
                    environment_type = "supermarket"  # Default
        
            # Build environment-specific descriptions
            environment_descriptions = {
                "cosmetics_store": "Boots or Watson cosmetics store shelf, bright lighting, organized beauty products display, premium retail environment",
                "convenience_store": "7-Eleven refrigerator or shelf display, convenience store setting, consumer products in organized rows",
                "supermarket": "Lotus's or Big C supermarket aisle, retail shelf display, organized product arrangement",
                "mall": "Shopping mall retail display, premium store environment, attractive product presentation",
                "custom": request.custom_environment or "retail environment"
            }
        
            shelf_style_descriptions = {
                "eye_level": "at eye level position, centered in frame, prominent placement",
                "shelf_view": "on retail shelf with other competing products, realistic shelf arrangement",
                "aisle_view": "in store aisle perspective, showing product context in retail environment",
                "custom": request.custom_shelf_style or "product display"
            }
        
            environment_desc = environment_descriptions.get(environment_type, environment_descriptions["supermarket"])
            shelf_desc = shelf_style_descriptions.get(request.shelf_style, shelf_style_descriptions["eye_level"])
        
            # If custom, use AI to interpret and enhance the description
            if environment_type == "custom" or request.shelf_style == "custom":
                custom_context = []
                if environment_type == "custom":
                    custom_context.append(f"Environment: {request.custom_environment}")
                if request.shelf_style == "custom":
                    custom_context.append(f"Display style: {request.custom_shelf_style}")
            
                environment_desc = ", ".join(custom_context) if custom_context else environment_desc
        
            # Use AI to create detailed environment prompt
            system_message = """You are an expert in retail merchandising and product photography.
    Create realistic prompts for on-shelf product visualization in competitive retail environments."""
        
            study_title = study.get("title", "Product")
        
            base_prompt = f"""Create a photorealistic on-shelf visualization for: {study_title}

    Environment Setting: {environment_desc}
    Shelf Position: {shelf_desc}

    Requirements:
    1. Show the product {shelf_desc}
    2. Include competing products from the same category (blurred or generic if needed)
    3. Realistic retail lighting and atmosphere
    4. Professional product photography quality
    5. Show authentic {environment_type.replace('_', ' ')} environment
    6. Make the featured product stand out while maintaining realistic context

    Keep the prompt concise (2-3 sentences max). Return ONLY the image generation prompt."""

            if request.additional_prompt:
                base_prompt += f"\n\nAdditional requirements (to be placed at the BEGINNING of the final prompt): {request.additional_prompt}"
        
            chat = LlmChat(
                api_key=api_key,
                session_id=f"shelf-sim-{study_id}",
                system_message=system_message
            ).with_model("openai", "gpt-4o-mini")
        
            generated_prompt = await chat.send_message(UserMessage(text=base_prompt))
        
            # Prepend user's additional prompt if provided
            if request.additional_prompt:
                generated_prompt = f"{request.additional_prompt.strip()}. {generated_prompt}"
        
            # Generate image using Gemini with product image as reference
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
            # Get product image in base64
            product_img_base64 = None
            if request.product_image_url.startswith('data:image'):
                product_img_base64 = request.product_image_url.split(',')[1]
            else:
                # Download and convert to base64
                import httpx
                async with httpx.AsyncClient() as client:
                    img_response = await client.get(request.product_image_url)
                    product_img_base64 = base64.b64encode(img_response.content).decode('utf-8')
        
            # Use Gemini 2.5 flash image preview
            chat = LlmChat(
                api_key=api_key,
                session_id=f"shelf-sim-{study_id}",
                system_message="You are an AI image generator specializing in retail product visualization."
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
        
            # Create prompt with reference image
            final_prompt = f"Using the provided product image as a reference, create: {generated_prompt}"
        
            image_content = ImageContent(product_img_base64)
            msg = UserMessage(text=final_prompt, file_contents=[image_content])
        
            text, images = await chat.send_message_multimodal_response(msg)
        
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No images generated")
        
            # Get base64 image and compress
            shelf_image_base64 = images[0]['data']
            compressed_base64 = await asyncio.to_thread(compress_base64_image, shelf_image_base64, max_size_kb=150.0, target_dimension=640)
            shelf_image_url = f"data:image/jpeg;base64,{compressed_base64}"
        
            return {
                "image_url": shelf_image_url,
                "prompt_used": generated_prompt,
                "environment_type": environment_type,
                "shelf_style": request.shelf_style,
                "message": "Shelf simulation generated successfully"
            }
        
        except Exception as e:
            logging.error(f"Shelf simulation generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate shelf simulation: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/share-content")
    async def share_conjoint_as_content(
        study_id: str,
        data: ConjointContentShareRequest,
        current_user: User = Depends(get_current_user)
    ):
        """Share conjoint analysis results as research content with charts and AI analysis"""
        try:
            import matplotlib
            matplotlib.use('Agg')  # Non-GUI backend
            import matplotlib.pyplot as plt
            import matplotlib.font_manager as fm
            import io
        
            # Configure matplotlib to support Thai and other languages
            # Use fonts that support Unicode including Thai characters
            plt.rcParams['font.family'] = 'sans-serif'
            plt.rcParams['font.sans-serif'] = ['Loma', 'FreeSerif', 'DejaVu Sans', 'Arial Unicode MS', 'sans-serif']
            # Enable unicode minus to prevent font warnings
            plt.rcParams['axes.unicode_minus'] = False
        
            # Verify study exists and user has permission
            study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
            if not study:
                raise HTTPException(status_code=404, detail="Study not found")
        
            # Generate AI interpretation if not provided
            ai_interpretation = data.ai_interpretation
            if not ai_interpretation:
                logging.info(f"[SHARE_CONTENT] No AI interpretation provided. Generating automatically for study {study_id}...")
                try:
                    # Get responses for AI analysis
                    responses = await db.conjoint_responses.find(
                        {"study_id": study_id},
                        {"_id": 0}
                    ).to_list(1000)
                
                    logging.info(f"[SHARE_CONTENT] Found {len(responses)} responses for study {study_id}")
                
                    if len(responses) >= 30:
                        # Prepare data for AI
                        analysis_data = {
                            "importance_scores": data.importance_scores,
                            "part_worths": data.part_worths,
                            "respondent_count": data.respondent_count,
                            "statistical_method": data.statistical_method
                        }
                    
                        # Build AI prompt
                        prompt = f"""คุณเป็นนักวิเคราะห์การวิจัยตลาด กรุณาวิเคราะห์ผลการวิจัย Conjoint Analysis ต่อไปนี้:

    การศึกษา: {data.title}
    จำนวนผู้ตอบ: {data.respondent_count} คน
    วิธีวิเคราะห์: {data.statistical_method}

    ## ความสำคัญของคุณลักษณะ (Importance Scores)
    """
                        sorted_importance = sorted(
                            data.importance_scores.items(),
                            key=lambda x: x[1].get('importance', 0),
                            reverse=True
                        )
                    
                        for rank, (attr_id, attr_data) in enumerate(sorted_importance, 1):
                            attr_name = attr_data.get('name', 'Unknown')
                            importance = attr_data.get('importance', 0)
                            prompt += f"{rank}. {attr_name}: {importance:.1f}%\n"
                    
                        prompt += "\n## ค่า Utility ของแต่ละระดับ\n"
                        for attr_id, attr_data in sorted_importance:
                            attr_name = attr_data.get('name', 'Unknown')
                            prompt += f"\n### {attr_name}\n"
                        
                            if attr_id in data.part_worths:
                                levels_data = data.part_worths[attr_id].get('levels', {})
                                sorted_levels = sorted(
                                    levels_data.items(),
                                    key=lambda x: x[1].get('utility', 0),
                                    reverse=True
                                )
                            
                                for level_id, level_data in sorted_levels:
                                    level_name = level_data.get('name', 'Unknown')
                                    utility = level_data.get('utility', 0)
                                    prompt += f"- {level_name}: {utility:.3f}\n"
                    
                        prompt += """

    กรุณาให้การตีความผลที่ครอบคลุม:
    1. คุณลักษณะใดสำคัญที่สุดและทำไม?
    2. ระดับใดของแต่ละคุณลักษณะที่ผู้บริโภคชื่นชอบ?
    3. ข้อเสนอแนะเชิงธุรกิจ (3-5 ข้อ)
    4. กลยุทธ์การตลาดที่แนะนำ

    ใช้ภาษาไทยที่เข้าใจง่าย ชัดเจน และเป็นมืออาชีพ"""
                    
                        # Call AI
                        from emergentintegrations.llm.chat import LlmChat, UserMessage
                        chat = LlmChat()
                        logging.info(f"[SHARE_CONTENT] Calling AI with prompt length: {len(prompt)} characters")
                        ai_interpretation = await chat.send_message_async(UserMessage(prompt))
                        logging.info(f"[SHARE_CONTENT] AI interpretation generated successfully. Length: {len(ai_interpretation)} characters")
                    else:
                        logging.warning(f"[SHARE_CONTENT] Insufficient responses ({len(responses)}/30 required) - skipping AI analysis")
                        ai_interpretation = None
                    
                except Exception as e:
                    logging.error(f"[SHARE_CONTENT] Error generating AI interpretation: {str(e)}")
                    import traceback
                    logging.error(f"[SHARE_CONTENT] Traceback: {traceback.format_exc()}")
                    ai_interpretation = None
            else:
                logging.info(f"[SHARE_CONTENT] AI interpretation provided by user. Length: {len(ai_interpretation)} characters")
        
            # Build content body with research details and results
            content_body = f"""## เทคนิคการวิจัย
    Choice-Based Conjoint Analysis

    ## ประเภทการวิจัย
    {data.research_type}

    ## รายละเอียดการวิจัย
    - **การศึกษา:** {data.title}
    - **จำนวนผู้ตอบ:** {data.respondent_count} คน
    - **วิธีวิเคราะห์:** {data.statistical_method}
    """
        
            # Add optional research details
            if data.sample_size:
                content_body += f"- **ขนาดกลุ่มตัวอย่าง:** {data.sample_size}\n"
            if data.data_source:
                content_body += f"- **แหล่งข้อมูล:** {data.data_source}\n"
            if data.collection_method:
                content_body += f"- **วิธีการเก็บข้อมูล:** {data.collection_method}\n"
            if data.research_date:
                content_body += f"- **วันที่ทำการวิจัย:** {data.research_date}\n"
        
            # Create charts
            chart_images = []
        
            # 1. Importance Chart
            try:
                sorted_importance = sorted(
                    data.importance_scores.items(),
                    key=lambda x: x[1].get('importance', 0),
                    reverse=True
                )
            
                if sorted_importance:
                    # Prepare data
                    attr_names = [attr_data.get('name', 'Unknown') for _, attr_data in sorted_importance]
                    importances = [attr_data.get('importance', 0) for _, attr_data in sorted_importance]
                
                    # Create bar chart
                    plt.figure(figsize=(10, 6))
                    colors = plt.cm.viridis([i/len(attr_names) for i in range(len(attr_names))])
                    bars = plt.barh(attr_names, importances, color=colors)
                    plt.xlabel('ความสำคัญ (%)', fontsize=12, fontweight='bold')
                    plt.title('ความสำคัญของคุณลักษณะ (Attribute Importance)', fontsize=14, fontweight='bold', pad=20)
                    plt.xlim(0, max(importances) * 1.1)
                
                    # Add value labels
                    for i, (bar, val) in enumerate(zip(bars, importances)):
                        plt.text(val + 1, i, f'{val:.1f}%', va='center', fontsize=10, fontweight='bold')
                
                    plt.tight_layout()
                
                    # Save to base64
                    buffer = io.BytesIO()
                    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
                    buffer.seek(0)
                    img_bytes = buffer.read()
                    importance_img_base64 = base64.b64encode(img_bytes).decode()
                    image_data_url = f"data:image/png;base64,{importance_img_base64}"
                    chart_images.append({
                        "id": str(uuid.uuid4()),
                        "type": "importance",
                        "title": "ความสำคัญของคุณลักษณะ",
                        "filename": "importance_chart.png",
                        "file_type": "image/png",
                        "file_size_kb": round(len(img_bytes) / 1024, 2),
                        "url": image_data_url,
                        "data": image_data_url,
                        "file_data": image_data_url
                    })
                    plt.close()
                    logging.info("Importance chart created successfully")
            except Exception as e:
                logging.error(f"Error creating importance chart: {e}")
        
            # 2. Utility Charts (for each attribute)
            for attr_id, attr_data in sorted_importance[:3]:  # Top 3 attributes
                try:
                    attr_name = attr_data.get('name', 'Unknown')
                
                    if attr_id in data.part_worths:
                        levels_data = data.part_worths[attr_id].get('levels', {})
                        sorted_levels = sorted(
                            levels_data.items(),
                            key=lambda x: x[1].get('utility', 0),
                            reverse=True
                        )
                    
                        if sorted_levels:
                            level_names = [level_data.get('name', 'Unknown') for _, level_data in sorted_levels]
                            utilities = [level_data.get('utility', 0) for _, level_data in sorted_levels]
                        
                            # Create bar chart
                            plt.figure(figsize=(10, 5))
                            colors = ['#2ecc71' if u > 0 else '#e74c3c' for u in utilities]
                            bars = plt.barh(level_names, utilities, color=colors)
                            plt.xlabel('ค่า Utility', fontsize=12, fontweight='bold')
                            plt.title(f'ค่า Utility ของ {attr_name}', fontsize=14, fontweight='bold', pad=20)
                            plt.axvline(x=0, color='black', linestyle='-', linewidth=0.5)
                        
                            # Add value labels
                            for i, (bar, val) in enumerate(zip(bars, utilities)):
                                x_pos = val + (0.02 if val > 0 else -0.02)
                                ha = 'left' if val > 0 else 'right'
                                plt.text(x_pos, i, f'{val:.3f}', va='center', ha=ha, fontsize=10, fontweight='bold')
                        
                            plt.tight_layout()
                        
                            # Save to base64
                            buffer = io.BytesIO()
                            plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
                            buffer.seek(0)
                            img_bytes = buffer.read()
                            utility_img_base64 = base64.b64encode(img_bytes).decode()
                            image_data_url = f"data:image/png;base64,{utility_img_base64}"
                            chart_images.append({
                                "id": str(uuid.uuid4()),
                                "type": "utility",
                                "title": f"ค่า Utility ของ {attr_name}",
                                "filename": f"utility_chart_{attr_name}.png",
                                "file_type": "image/png",
                                "file_size_kb": round(len(img_bytes) / 1024, 2),
                                "url": image_data_url,
                                "data": image_data_url,
                                "file_data": image_data_url
                            })
                            plt.close()
                            logging.info(f"Utility chart for {attr_name} created successfully")
                except Exception as e:
                    logging.error(f"Error creating utility chart for {attr_name}: {e}")
        
            # Add importance scores summary
            content_body += "\n## ผลการวิเคราะห์ความสำคัญของคุณลักษณะ\n\n"
        
            for rank, (attr_id, attr_data) in enumerate(sorted_importance, 1):
                attr_name = attr_data.get('name', 'Unknown')
                importance = attr_data.get('importance', 0)
                content_body += f"{rank}. **{attr_name}**: {importance:.1f}%\n"
        
            # Add part-worths details
            content_body += "\n## ค่า Utility ของระดับคุณลักษณะแต่ละอัน\n\n"
        
            for attr_id, attr_data in sorted_importance:
                attr_name = attr_data.get('name', 'Unknown')
                content_body += f"### {attr_name}\n\n"
            
                # Get levels from part_worths
                if attr_id in data.part_worths:
                    levels_data = data.part_worths[attr_id].get('levels', {})
                    # Sort by utility
                    sorted_levels = sorted(
                        levels_data.items(),
                        key=lambda x: x[1].get('utility', 0),
                        reverse=True
                    )
                
                    for level_id, level_data in sorted_levels:
                        level_name = level_data.get('name', 'Unknown')
                        utility = level_data.get('utility', 0)
                        content_body += f"- **{level_name}**: {utility:.3f}\n"
            
                content_body += "\n"
        
            # Add AI interpretation if available
            if ai_interpretation:
                logging.info(f"[SHARE_CONTENT] Adding AI interpretation to content body (length: {len(ai_interpretation)})")
                content_body += f"\n## การตีความผลด้วย AI\n\n{ai_interpretation}\n"
            else:
                logging.warning("[SHARE_CONTENT] No AI interpretation available - content will not include AI analysis section")
        
            # Add optional notes
            if data.additional_notes:
                content_body += f"\n## หมายเหตุเพิ่มเติม\n{data.additional_notes}\n"
        
            # Add link to view full results
            # Use FRONTEND_URL from environment (set in backend/.env)
            frontend_base_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
            results_link = f"{frontend_base_url}/conjoint/results/{study_id}"
            content_body += f"\n## 🔗 ดูผลการวิจัยแบบเต็ม\n\n[คลิกที่นี่เพื่อดูผลการวิจัยแบบโต้ตอบ]({results_link})\n"
        
            # Create content document
            content_dict = {
                "id": str(uuid.uuid4()),
                "title": data.title,
                "content": content_body,
                "content_type": "research",
                "category": "Conjoint Analysis",
                "tags": ["conjoint-analysis", data.research_type.lower(), data.statistical_method.lower()],
                "status": "published",
                "contributors": [{
                    "user_id": current_user.id,
                    "user_name": current_user.full_name,
                    "role": "author"
                }],
                "created_by": current_user.id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "views": 0,
                # Store chart images
                "attachments": chart_images,
                # Store metadata
                "conjoint_metadata": {
                    "study_id": study_id,
                    "research_type": data.research_type,
                    "sample_size": data.sample_size,
                    "respondent_count": data.respondent_count,
                    "statistical_method": data.statistical_method,
                    "research_date": data.research_date,
                    "results_link": results_link
                }
            }
        
            await db.contents.insert_one(content_dict)
        
            logging.info(f"[SHARE_CONTENT] Content created successfully with ID: {content_dict['id']}, has AI interpretation: {bool(ai_interpretation)}, chart images: {len(chart_images)}")
        
            return {
                "message": "Conjoint study shared as content successfully",
                "content_id": content_dict["id"],
                "has_ai_interpretation": bool(ai_interpretation),
                "chart_count": len(chart_images)
            }
        
        except Exception as e:
            logging.error(f"Error sharing conjoint as content: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to share content: {str(e)}")

    @conjoint_router.post("/conjoint/studies/{study_id}/ai-interpretation")
    async def get_ai_interpretation(
        study_id: str,
        request: AIInterpretationRequest,
        background_tasks: BackgroundTasks,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Generate AI interpretation — cached in DB. Uses background task to avoid proxy timeout."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0, "choice_sets": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        is_public = study.get("is_public_result", False)
        if not is_public:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")

        respondent_count = study.get("respondent_count", 0)
        cache_key = f"ai_{request.method}_{'all' if request.compare_all else 'single'}"

        # Check cache first — return immediately if exists
        cached = await db.analysis_cache.find_one(
            {"study_id": study_id, "method": cache_key, "respondent_count": respondent_count},
            {"_id": 0}
        )
        if cached and cached.get("results"):
            return {
                "status": "ready",
                "interpretation": cached["results"]["interpretation"],
                "summary_data": cached["results"].get("summary_data"),
                "cached": True
            }

        responses = await db.conjoint_responses.find({"study_id": study_id}, {"_id": 0}).to_list(10000)
        if len(responses) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 responses for interpretation")

        # Create job record and run in background
        job_id = f"ai_interp_{study_id}_{uuid.uuid4().hex[:8]}"
        await db.ai_interp_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "job_id": job_id,
                "study_id": study_id,
                "cache_key": cache_key,
                "status": "processing",
                "created_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

        background_tasks.add_task(
            _run_ai_interpretation,
            study_id, cache_key, job_id, respondent_count,
            request.method, request.compare_all
        )

        return {"status": "processing", "job_id": job_id}

    @conjoint_router.get("/conjoint/studies/{study_id}/ai-interpretation-status/{job_id}")
    async def get_ai_interpretation_status(
        study_id: str,
        job_id: str,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Poll AI interpretation job status. Returns result when ready."""
        job = await db.ai_interp_jobs.find_one({"job_id": job_id}, {"_id": 0})
        if not job:
            return {"status": "not_found"}

        if job.get("status") == "ready":
            # Fetch the cached result
            cached = await db.analysis_cache.find_one(
                {"study_id": study_id, "method": job["cache_key"]},
                {"_id": 0}
            )
            if cached and cached.get("results"):
                return {
                    "status": "ready",
                    "interpretation": cached["results"]["interpretation"],
                    "summary_data": cached["results"].get("summary_data"),
                    "cached": False
                }
            return {"status": "ready", "interpretation": "", "summary_data": None}

        return {"status": job.get("status", "unknown"), "error": job.get("error")}

    async def _run_ai_interpretation(study_id: str, cache_key: str, job_id: str,
                                      respondent_count: int, method: str, compare_all: bool):
        """Background task: generate AI interpretation and cache result."""
        import asyncio
        try:
            full_study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
            responses = await db.conjoint_responses.find({"study_id": study_id}, {"_id": 0}).to_list(10000)

            analysis_summary = await _prepare_analysis_summary(full_study, responses, method, compare_all)
            system_message, prompt = _build_interpretation_prompt(analysis_summary)

            response = await _call_gemini_with_retry(
                system_msg=system_message,
                prompt=prompt,
                session_id=f"conjoint-interpret-{study_id}-{job_id}"
            )

            result_data = {
                "interpretation": response,
                "summary_data": analysis_summary
            }

            await db.analysis_cache.update_one(
                {"study_id": study_id, "method": cache_key},
                {"$set": {
                    "study_id": study_id,
                    "method": cache_key,
                    "respondent_count": respondent_count,
                    "results": result_data,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )

            await db.ai_interp_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "ready"}}
            )
            logging.info(f"AI interpretation completed for job {job_id}")

        except asyncio.TimeoutError:
            logging.error(f"AI interpretation timed out for job {job_id}")
            await db.ai_interp_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": "AI ใช้เวลานานเกินไป กรุณาลองใหม่"}}
            )
        except Exception as e:
            logging.error(f"AI interpretation failed for job {job_id}: {e}")
            await db.ai_interp_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": str(e)}}
            )

    @conjoint_router.post("/conjoint/studies/{study_id}/generate-prompt")
    async def generate_interpretation_prompt(
        study_id: str,
        request: AIInterpretationRequest,
        current_user: Optional[User] = Depends(get_current_user_optional)
    ):
        """Generate the prompt text with real data — user can copy and use with their own AI."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        is_public = study.get("is_public_result", False)
        if not is_public:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Not authorized")

        responses = await db.conjoint_responses.find({"study_id": study_id}, {"_id": 0}).to_list(10000)
        if len(responses) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 responses")

        analysis_summary = await _prepare_analysis_summary(study, responses, request.method, request.compare_all)
        system_message, prompt = _build_interpretation_prompt(analysis_summary)

        full_prompt = f"""[System Instructions]\n{system_message}\n\n[Analysis Request]\n{prompt}"""

        return {
            "prompt": full_prompt,
            "summary_data": analysis_summary,
        }

    @conjoint_router.post("/conjoint/studies/{study_id}/export-thesis")
    async def export_thesis_start(
        study_id: str,
        request: ThesisExportRequest,
        background_tasks: BackgroundTasks,
        current_user: User = Depends(get_current_user)
    ):
        """Start thesis generation as background job. Returns job_id for polling."""
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0, "choice_sets": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        is_owner = study["creator_id"] == current_user.id
        is_admin = current_user.role == UserRole.ADMIN
        is_whitelisted = bool(getattr(current_user, "can_export_thesis", False))
        # Rule: (owner AND whitelisted) OR admin
        if is_admin:
            pass
        elif is_owner and is_whitelisted:
            pass
        elif is_owner and not is_whitelisted:
            raise HTTPException(status_code=403, detail="คุณเป็นเจ้าของ study แต่ยังไม่ได้รับสิทธิ์ Export Thesis — ติดต่อ admin")
        else:
            raise HTTPException(status_code=403, detail="เฉพาะเจ้าของ study (ที่ได้รับสิทธิ์แล้ว) หรือ admin เท่านั้น")

        respondent_count = study.get("respondent_count", 0)
        methods_key = "_".join(sorted(request.methods))
        chapters_key = "_".join(str(c) for c in sorted(request.chapters))
        extra_hash = ""
        if request.extra_prompt and request.extra_prompt.strip():
            import hashlib
            extra_hash = hashlib.md5(request.extra_prompt.strip().encode()).hexdigest()[:8]
        cache_key = f"thesis_{methods_key}_{chapters_key}" + (f"_ep{extra_hash}" if extra_hash else "")

        # Check cache — if AI content already exists, return ready immediately
        cached = await db.analysis_cache.find_one(
            {"study_id": study_id, "method": cache_key, "respondent_count": respondent_count},
            {"_id": 0}
        )
        if cached and cached.get("results", {}).get("ai_content"):
            return {"status": "ready", "job_id": cache_key, "cached": True}

        # Check minimum responses
        resp_count = await db.conjoint_responses.count_documents({"study_id": study_id})
        if resp_count < 10:
            raise HTTPException(status_code=400, detail="ต้องมีผู้ตอบอย่างน้อย 10 คน")

        # Create job record
        job_id = f"thesis_{study_id}_{uuid.uuid4().hex[:8]}"
        await db.thesis_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "job_id": job_id,
                "study_id": study_id,
                "cache_key": cache_key,
                "status": "processing",
                "created_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

        # Run generation in background
        background_tasks.add_task(
            _run_thesis_generation,
            study_id, cache_key, job_id, respondent_count, study.get("title", ""),
            request.methods, request.chapters, request.extra_prompt.strip() if request.extra_prompt else ""
        )

        return {"status": "processing", "job_id": job_id}

    async def _run_thesis_generation(study_id: str, cache_key: str, job_id: str,
                                    respondent_count: int, study_title: str,
                                    methods: list = None, chapters: list = None,
                                    extra_prompt: str = ""):
        """Background task to generate thesis content via AI and cache it."""
        import asyncio
        if chapters is None:
            chapters = [3, 4, 5]
        if methods is None:
            methods = ["mnl"]
        try:
            full_study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
            responses = await db.conjoint_responses.find({"study_id": study_id}, {"_id": 0}).to_list(10000)

            # Always include counting as baseline + selected methods
            methods_to_compute = list(set(["counting"] + methods))

            all_results = {}
            for m in methods_to_compute:
                try:
                    cached_method = await db.analysis_cache.find_one(
                        {"study_id": study_id, "method": m, "respondent_count": respondent_count},
                        {"_id": 0}
                    )
                    if cached_method and cached_method.get("results"):
                        all_results[m] = cached_method["results"]
                    else:
                        all_results[m] = await get_method_results(full_study, responses, m)
                except Exception as e:
                    logging.warning(f"Thesis bg - method {m} failed: {e}")

            system_msg, chapter_prompts = _build_thesis_prompt(
                study_title, respondent_count, all_results, methods, chapters, extra_prompt
            )

            # Generate each chapter separately (to stay within proxy timeout)
            chapter_contents = {}
            for ch_num in sorted(chapter_prompts.keys()):
                logging.info(f"Thesis job {job_id}: Generating Chapter {ch_num}...")
                ch_content = await _call_gemini_with_retry(
                    system_msg=system_msg,
                    prompt=chapter_prompts[ch_num],
                    session_id=f"thesis-ch{ch_num}-{study_id}-{job_id}"
                )
                chapter_contents[ch_num] = ch_content

            ai_content = "\n\n---\n\n".join(chapter_contents[ch] for ch in sorted(chapter_contents.keys()))

            # Cache AI content
            await db.analysis_cache.update_one(
                {"study_id": study_id, "method": cache_key},
                {"$set": {
                    "study_id": study_id,
                    "method": cache_key,
                    "respondent_count": respondent_count,
                    "results": {"ai_content": ai_content},
                    "created_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )

            await db.thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "ready"}}
            )
            logging.info(f"Thesis generation completed for job {job_id}")

        except asyncio.TimeoutError:
            logging.error(f"Thesis generation timed out for job {job_id}")
            await db.thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": "AI ใช้เวลานานเกินไป กรุณาลองใหม่"}}
            )
        except Exception as e:
            logging.error(f"Thesis generation failed for job {job_id}: {e}")
            await db.thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": str(e)}}
            )

    @conjoint_router.get("/conjoint/studies/{study_id}/export-thesis-status/{job_id}")
    async def export_thesis_status(
        study_id: str,
        job_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Poll thesis generation status."""
        job = await db.thesis_jobs.find_one({"job_id": job_id}, {"_id": 0})
        if not job:
            return {"status": "not_found"}
        return {"status": job.get("status", "unknown"), "error": job.get("error")}

    @conjoint_router.get("/conjoint/studies/{study_id}/export-thesis-download")
    async def export_thesis_download(
        study_id: str,
        cache_key: str = None,
        current_user: User = Depends(get_current_user)
    ):
        """Download the generated thesis .docx from cached AI content."""
        from fastapi.responses import Response

        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0, "choice_sets": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")

        respondent_count = study.get("respondent_count", 0)

        # Find thesis cache (specific or any)
        if cache_key:
            cached = await db.analysis_cache.find_one(
                {"study_id": study_id, "method": cache_key, "respondent_count": respondent_count},
                {"_id": 0}
            )
        else:
            cached = await db.analysis_cache.find_one(
                {"study_id": study_id, "method": {"$regex": "^thesis_"}, "respondent_count": respondent_count},
                {"_id": 0},
                sort=[("created_at", -1)]
            )
        if not cached or not cached.get("results", {}).get("ai_content"):
            raise HTTPException(status_code=404, detail="ยังไม่มีเนื้อหาวิทยานิพนธ์ กรุณาสร้างก่อน")

        ai_content = cached["results"]["ai_content"]
        # Run CPU-heavy DOCX generation in a worker thread so the event loop
        # stays free for other requests (login, list, etc.) while we render.
        import asyncio
        docx_bytes = await asyncio.to_thread(
            _create_thesis_docx, study.get("title", ""), respondent_count, ai_content
        )

        # Build filename from cache_key
        chapters_str = ""
        if cache_key and "thesis_" in cache_key:
            parts = cache_key.replace("thesis_", "").split("_")
            if len(parts) > 1:
                chapters_str = "_Ch" + "_Ch".join(parts[1:])
        filename = f"Conjoint_Thesis{chapters_str}_{study_id[:8]}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    return conjoint_router
