# Scientific Data Analyzer

A web-based statistical analysis tool supporting descriptive statistics, ANOVA, regression, PCA, SEM (path analysis), and AHP.

## Quick Start

1. **Install uv** (if not installed):
   ```
   pip install uv
   ```

2. **Start the server**:
   ```
   uv run main.py
   ```

3. **Open** http://localhost:8000 in your browser.

## Step-by-Step Usage

### 1. Upload Data
- Drag & drop an **.xlsx** or **.xls** file onto the upload area, or click **Browse Files** to select one.
- Files with multiple sheets are supported. After upload, the sheet tabs appear at the top.

### 2. Select a Sheet
- Click a sheet tab to preview its data in the table below.

### 3. Choose a Method
- Select a statistical method from the **Analysis Configuration** dropdown.

| Method | What it does |
|---|---|
| Descriptive Statistics | Mean, median, std dev, skewness, kurtosis, outliers, KDE plot |
| One-way ANOVA | Compare means across groups + Tukey post-hoc |
| Two-way ANOVA | Factorial ANOVA with interaction effects |
| Multiple Linear Regression | Linear model with one DV and multiple IVs |
| PCA | Dimensionality reduction with loadings and variance explained |
| Path Analysis (SEM) | Specify causal paths between variables |
| AHP | Multi-criteria decision making with pairwise comparisons |

### 4. Configure Variables
Each method shows relevant fields after selection:

- **Descriptive**: Pick a numeric variable.
- **One-way ANOVA**: Pick a Dependent Variable (DV) and a Factor (categorical grouping column).
- **Two-way ANOVA**: Pick DV, Factor A, and Factor B.
- **Regression**: Pick DV and one or more Independent Variables (comma-separated).
- **PCA**: Pick two or more numeric variables (comma-separated).
- **Path Analysis (SEM)**: Enter paths in JSON format, e.g.:
  ```
  [{"from": "Var1", "to": "Var3"}, {"from": "Var2", "to": "Var3"}]
  ```
- **AHP**: Enter criteria, alternatives, criteria comparison matrix, and alternative matrices in JSON format.

### 5. Run Analysis
- Click **Run Analysis**. Results appear below with tables, charts, and a plain‑language interpretation.

### 6. Export
- Click **Export Excel** to download the current sheet.
- Click **PDF Report** to print or save a PDF report of results.

## Requirements (auto-installed by uv)
- fastapi, uvicorn, pandas, numpy, scipy, statsmodels, scikit-learn, openpyxl, python-multipart, jinja2
