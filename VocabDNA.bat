@echo off
setlocal
set "APP=%~dp0VocabDNA.html"
if exist "%APP%" (
  start "" "%APP%"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-vocabdna.ps1"
  if errorlevel 1 pause
)
