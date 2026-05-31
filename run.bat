@echo off
cd /d "%~dp0"
title Scientific Data Analyzer
echo Starting Scientific Data Analyzer...
echo.
echo Opening browser at http://localhost:8000
start http://localhost:8000
echo Launching server...
uv run main.py
pause
