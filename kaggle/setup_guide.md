# Kaggle Publishing Guide

## Prerequisites

1. **Kaggle account** — created at https://kaggle.com (username: hassan244973)
2. **API key** — from Account → API → Create New API Token

## Setup

1. Place `kaggle.json` in the correct location:
   - **Windows**: `C:\Users\<you>\.kaggle\kaggle.json`
   - **Linux/Mac**: `~/.kaggle/kaggle.json`

   Contents:
   ```json
   {"username":"hassan244973","key":"YOUR_API_KEY"}
   ```

2. Install the Kaggle CLI:
   ```bash
   pip install kaggle
   ```

## Upload Dataset

```bash
cd kaggle
kaggle datasets create -p ./ -r zip
```

## Create & Run Notebook

1. Go to https://kaggle.com → Notebooks → New Notebook
2. Add `hassan244973/scientific-data-analyzer-example` as dataset input
3. Copy the contents of `analysis_notebook.ipynb` into the notebook cells
4. Run all cells
5. Set visibility to **Public** in the notebook settings

## Publish

- **Dataset**: Auto-published on upload
- **Notebook**: Set to **Public** via the Share button (top-right)
- Make sure both are linked (the notebook should reference the dataset)
