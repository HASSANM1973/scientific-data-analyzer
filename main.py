# /// script
# dependencies = [
#   "fastapi",
#   "uvicorn[standard]",
#   "pandas",
#   "numpy",
#   "scipy",
#   "statsmodels",
#   "scikit-learn",
#   "openpyxl",
#   "python-multipart",
#   "jinja2",
# ]
# ///

import io
import json
import os
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware


import math


def convert_numpy(obj):
    """Recursively convert numpy types to Python native types."""
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(v) for v in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy(v) for v in obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return convert_numpy(obj.tolist())
    elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj

from analysis import (AHP, ANOVA, PCAnalysis, Regression, SEM,
                      DescriptiveStats, InterpretationEngine)

app = FastAPI(title="Scientific Data Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

sessions = {}


@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Scientific Data Analyzer</h1><p>Frontend not found.</p>")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    content = await file.read()
    sheets = {}
    full_data = {}
    try:
        xl = pd.ExcelFile(io.BytesIO(content))
        for sheet_name in xl.sheet_names:
            df = xl.parse(sheet_name)
            if df.empty:
                sheets[sheet_name] = {"columns": [], "rows": [], "dtypes": {}, "n_rows": 0, "n_cols": 0}
                full_data[sheet_name] = pd.DataFrame()
                continue
            df_orig = df.copy()
            df = df.where(pd.notna(df), None)
            columns = list(df.columns)
            dtypes = {str(col): str(df[col].dtype) for col in columns}
            numeric_cols = [str(col) for col in columns if pd.api.types.is_numeric_dtype(df_orig[col])]
            categorical_cols = [str(col) for col in columns
                                if not pd.api.types.is_numeric_dtype(df_orig[col])
                                and str(col) not in numeric_cols]
            preview = df.head(100).to_dict(orient="records")
            cleaned = []
            for row in preview:
                cleaned.append({str(k): (
                    v.isoformat() if isinstance(v, (pd.Timestamp, datetime))
                    else None if isinstance(v, float) and (math.isnan(v) or math.isinf(v))
                    else v
                ) for k, v in row.items()})
            sheets[sheet_name] = {
                "columns": [str(c) for c in columns],
                "rows": cleaned,
                "dtypes": dtypes,
                "n_rows": len(df_orig),
                "n_cols": len(columns),
                "numeric_columns": numeric_cols,
                "categorical_columns": categorical_cols
            }
            full_data[sheet_name] = df_orig
        sessions[session_id] = {"data": full_data, "preview": sheets, "raw": content}
        return convert_numpy({"session_id": session_id, "sheets": sheets, "sheet_names": list(sheets.keys())})
    except Exception as e:
        return {"error": f"Failed to parse file: {str(e)}"}


@app.post("/api/analyze")
async def analyze(
    session_id: str = Form(...),
    sheet: str = Form(...),
    method: str = Form(...),
    dv: Optional[str] = Form(None),
    ivs: Optional[str] = Form(None),
    between: Optional[str] = Form(None),
    factor_a: Optional[str] = Form(None),
    factor_b: Optional[str] = Form(None),
    variables: Optional[str] = Form(None),
    sem_paths: Optional[str] = Form(None),
    ahp_data: Optional[str] = Form(None),
):
    if session_id not in sessions:
        return {"error": "Session not found. Please re-upload your file."}
    df = sessions[session_id]["data"].get(sheet)
    if df is None:
        return {"error": f"Sheet '{sheet}' not found."}
    if df.empty:
        return {"error": f"Sheet '{sheet}' is empty."}

    try:
        result = None
        if method == "descriptive":
            if not dv:
                return {"error": "Please select a variable."}
            if dv not in df.columns:
                return {"error": f"Variable '{dv}' not found."}
            result = DescriptiveStats.compute(df[dv], dv)
            interpretation = InterpretationEngine.generate("descriptive", result)

        elif method == "anova":
            if not dv or not between:
                return {"error": "Please select DV and factor."}
            result = ANOVA.one_way(df, dv, between)
            interpretation = InterpretationEngine.generate("anova", result)
            if result.get("tukey_hsd"):
                pass

        elif method == "anova_twoway":
            if not dv or not factor_a:
                return {"error": "Please select DV and at least Factor A."}
            result = ANOVA.two_way(df, dv, factor_a, factor_b) if factor_b else {"error": "Factor B required"}
            interpretation = InterpretationEngine.generate("anova", result)

        elif method == "regression":
            if not dv or not ivs:
                return {"error": "Please select DV and at least one IV."}
            iv_list = [v.strip() for v in ivs.split(",") if v.strip()]
            result = Regression.multiple(df, dv, iv_list)
            interpretation = InterpretationEngine.generate("regression", result)

        elif method == "pca":
            if not variables:
                return {"error": "Please select variables."}
            var_list = [v.strip() for v in variables.split(",") if v.strip()]
            result = PCAnalysis.compute(df, var_list)
            interpretation = InterpretationEngine.generate("pca", result)

        elif method == "sem":
            if not sem_paths:
                return {"error": "Please define paths for SEM."}
            paths = json.loads(sem_paths)
            result = SEM.path_analysis(df, paths)
            interpretation = InterpretationEngine.generate("sem", result)

        elif method == "ahp":
            if not ahp_data:
                return {"error": "Please provide AHP data."}
            ahp = json.loads(ahp_data)
            result = AHP.compute(
                ahp.get("criteria", []),
                ahp.get("alternatives", []),
                ahp.get("criteria_matrix", []),
                ahp.get("alt_matrices", [])
            )
            interpretation = InterpretationEngine.generate("ahp", result)

        else:
            return {"error": f"Unknown method: {method}"}

        return convert_numpy({
            "method": method,
            "result": result,
            "interpretation": interpretation
        })
    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}


@app.post("/api/export-excel")
async def export_excel(session_id: str = Form(...), sheet: str = Form(...)):
    if session_id not in sessions:
        return {"error": "Session not found"}
    df = sessions[session_id]["data"].get(sheet)
    if df is None:
        return {"error": "Sheet not found"}
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=sheet, index=False)
    headers = {"Content-Disposition": f"attachment; filename={sheet}_export.xlsx"}
    return Response(content=buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
